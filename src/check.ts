import { IntlMessageFormat } from "intl-messageformat";

import type { DictionaryMeta, Leaf } from "./types.js";

/**
 * A rule sees every variant of one key at once, not a single message. The
 * German glossary checks German against its Swedish source, which a
 * per-message hook could not express.
 */
export type Rule = {
    name: string;
    check: (entry: {
        key: string;
        source?: string | undefined;
        variants: Variant[];
    }) => RuleFinding[];
};

/**
 * A rule names the key and says what is wrong; the walk stamps the rest, so a
 * glossary violation can never masquerade as one of the structural kinds.
 */
export type RuleFinding = {
    key: string;
    detail: string;
};

export type Finding = {
    /** Supplied by callers that know one, such as a CI glob over content files. */
    source?: string | undefined;
    key: string;
    kind:
        | "placeholder-drift"
        | "tag-drift"
        | "self-closing"
        | "unparseable"
        | "unknown-locale"
        | "extends-collision"
        | "rule";
    /** The rule that raised it. Set only when `kind` is `"rule"`. */
    rule?: string | undefined;
    detail: string;
};

/** Node types we care about; the rest carry no argument or tag name. */
const LITERAL = 0;
const TAG = 8;

type Node = {
    type: number;
    value?: unknown;
    children?: Node[];
    options?: Record<string, { value: Node[] }>;
};

type Shape = { args: Set<string>; tags: Set<string> };

/** Every argument and tag a message depends on, nested branches included. */
function shapeOf(
    nodes: Node[],
    out: Shape = { args: new Set(), tags: new Set() }
): Shape {
    for (const node of nodes) {
        if (node.type === LITERAL) {
            continue;
        }
        if (node.type === TAG) {
            if (typeof node.value === "string") {
                out.tags.add(node.value);
            }
            shapeOf(node.children ?? [], out);
            continue;
        }
        if (typeof node.value === "string") {
            out.args.add(node.value);
        }
        for (const option of Object.values(node.options ?? {})) {
            shapeOf(option.value, out);
        }
    }
    return out;
}

/** `noUncheckedIndexedAccess` makes `split()[0]` optional, so narrow it here. */
function firstLine(text: string): string {
    const [line = ""] = text.split("\n");
    return line;
}

const SELF_CLOSING = /<\s*[A-Za-z][\w]*\s*\/>/g;

/** One renderable form of a key: a locale, optionally a plugin state. */
export type Variant = {
    locale: string;
    state?: string | undefined;
    message: string;
};

/**
 * A node is a group when some child is itself a record; everything else is a
 * locale map. Asking it in that direction rather than "does any value look
 * like copy" matters for the empty node: a key absent from every locale must
 * stay a locale map so it is *reported*, since rendering nothing is the
 * failure this library exists to avoid. A group with no branches would mean
 * nothing anyway.
 *
 * A plugin tag is an object too, so it is excluded by its `__tag`.
 */
export function isLocaleMap(
    node: Record<string, unknown>
): node is Record<string, Leaf> {
    return !Object.values(node).some(
        (value) =>
            typeof value === "object" && value !== null && !("__tag" in value)
    );
}

/** Anything that can hold copy or further keys. */
function isNode(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** One key that carries copy, labelled by the path an author would read. */
export type FlatEntry = { key: string; byLocale: Record<string, Leaf> };

/**
 * Groups collapse to dotted paths, so every check below stays a per-key check
 * and a finding names the path an author would read (`sectionType.Program`).
 *
 * A list rather than a record keyed by that path: the path is a *label*, and
 * two distinct keys can share one -- a literal `"section.Program"` beside a
 * group `section: { Program }`. Keyed, the second would overwrite the first
 * and drop it from checking and coverage silently, which for a gate the
 * derived types rest on is the worst way to fail.
 */
export function flattenContent(
    content: Record<string, unknown>,
    path = ""
): FlatEntry[] {
    const flat: FlatEntry[] = [];

    for (const [name, value] of Object.entries(content)) {
        const key = path ? `${path}.${name}` : name;
        if (!isNode(value)) {
            continue;
        }
        const child = value;

        if (isLocaleMap(child)) {
            flat.push({ key, byLocale: child });
            continue;
        }
        flat.push(...flattenContent(child, key));
    }

    return flat;
}

/**
 * The least a walk needs of a dictionary, so a plain object still qualifies.
 *
 * `content` is widened for iteration: an optional locale makes an entry an
 * intersection of mapped types, which cannot be indexed by the full locale
 * union while those are still generic.
 */
export type DictionaryNode = {
    content: Record<string, unknown>;
    extends?: readonly unknown[] | undefined;
    meta?: DictionaryMeta | undefined;
};

/** One dictionary a resolution draws copy from, labelled by where it came in. */
export type ChainMember = { label: string; dictionary: DictionaryNode };

function isDictionaryNode(value: unknown): value is DictionaryNode {
    return isNode(value) && isNode(value["content"]);
}

/**
 * Every dictionary a resolution draws copy from: the extended ones first and
 * depth-first, the dictionary itself last, each appearing once.
 *
 * The label is the extending dictionary's own `extends` index, carried down
 * through transitive hops, so a finding names the line its author wrote rather
 * than a position in this walk.
 *
 * Order is only a tie-break for a collision the compiler already refuses. It
 * decides nothing for a dictionary that compiles, and the `seen` set is there
 * for the same reason: a cycle cannot be written with `const` bindings, and
 * the types refuse a chain they cannot read end to end, but a circular import
 * can still hand one over half-built.
 */
export function extendsChain(dictionary: unknown): ChainMember[] {
    const chain: ChainMember[] = [];
    const seen = new Set<unknown>();

    function walk(value: unknown, label: string): void {
        if (!isDictionaryNode(value) || seen.has(value)) {
            return;
        }
        seen.add(value);
        for (const [index, extended] of (value.extends ?? []).entries()) {
            walk(extended, label === "" ? `extends[${index}]` : label);
        }
        chain.push({
            label: label === "" ? "content" : label,
            dictionary: value,
        });
    }

    walk(dictionary, "");
    return chain;
}

/**
 * Two of a resolution's dictionaries defining the same top-level key.
 *
 * The compiler refuses this at `createDictionary`, so this is the net under a
 * JavaScript caller -- the one case left where a collision would otherwise go
 * unproven and silently last-wins.
 *
 * Top-level keys only, which is exactly what a resolution merges: two
 * dictionaries that both define the group `errors` would lose one side's
 * branches wholesale, not blend them.
 */
export function checkExtends(dictionary: unknown, source?: string): Finding[] {
    const findings: Finding[] = [];
    const owner = new Map<string, string>();

    for (const { label, dictionary: member } of extendsChain(dictionary)) {
        for (const key of Object.keys(member.content)) {
            const previous = owner.get(key);
            if (previous === undefined) {
                owner.set(key, label);
                continue;
            }
            findings.push({
                source,
                key,
                kind: "extends-collision",
                detail: `defined by both ${previous} and ${label}`,
            });
        }
    }

    return findings;
}

/** Every renderable form of every key, which is what rules are given. */
export function variantsOf(
    content: Record<string, unknown>
): { key: string; variants: Variant[] }[] {
    return flattenContent(content).map(({ key, byLocale }) => ({
        key,
        variants: Object.entries(byLocale).flatMap(([locale, leaf]) =>
            variants(leaf).map(([suffix, message]) => ({
                locale,
                ...(suffix ? { state: suffix.slice(1) } : {}),
                message,
            }))
        ),
    }));
}

/** Each variant a leaf renders as, labelled for reporting. */
function variants(leaf: Leaf): [string, string][] {
    if (typeof leaf === "string") {
        return [["", leaf]];
    }
    const states: Record<string, string> = leaf.states;
    return Object.entries(states).map(([state, message]) => [
        `/${state}`,
        message,
    ]);
}

/**
 * Cross-variant drift, which is the only thing a custom check is needed for --
 * malformed ICU throws during `IntlMessageFormat` construction.
 *
 * This is load-bearing for type soundness, not merely copy hygiene: the derived
 * types read a key's shape off the default locale, so a translation that drops
 * a placeholder would otherwise make that type a lie in one language only.
 */
export function checkDictionary(
    content: Record<string, unknown>,
    locale: string,
    source?: string,
    declaredLocales?: readonly string[]
): Finding[] {
    const findings: Finding[] = [];
    const declared = declaredLocales && new Set(declaredLocales);

    for (const { key, byLocale } of flattenContent(content)) {
        // An undeclared locale key cannot be caught by the content type --
        // excess properties go unchecked in that generic constraint position --
        // so a typo would otherwise be silently ignored at runtime.
        if (declared) {
            for (const loc of Object.keys(byLocale)) {
                if (!declared.has(loc)) {
                    findings.push({
                        source,
                        key,
                        kind: "unknown-locale",
                        detail: `"${loc}" is not a declared locale`,
                    });
                }
            }
        }

        const shapes: [string, Shape][] = [];

        for (const [loc, leaf] of Object.entries(byLocale)) {
            for (const [suffix, message] of variants(leaf)) {
                const label = `${loc}${suffix}`;

                for (const hit of message.match(SELF_CLOSING) ?? []) {
                    findings.push({
                        source,
                        key,
                        kind: "self-closing",
                        detail: `${label}: ${hit} renders as literal text`,
                    });
                }

                try {
                    shapes.push([
                        label,
                        shapeOf(
                            new IntlMessageFormat(message, locale).getAst()
                        ),
                    ]);
                } catch (error) {
                    findings.push({
                        source,
                        key,
                        kind: "unparseable",
                        detail: `${label}: ${firstLine(String(error))}`,
                    });
                }
            }
        }

        const reference = shapes[0];
        if (!reference) {
            continue;
        }
        const [refLabel, ref] = reference;

        for (const [label, shape] of shapes.slice(1)) {
            for (const [what, expected, actual] of [
                ["placeholder", ref.args, shape.args],
                ["tag", ref.tags, shape.tags],
            ] as const) {
                const missing = [...expected].filter(
                    (item) => !actual.has(item)
                );
                const extra = [...actual].filter((item) => !expected.has(item));
                if (!missing.length && !extra.length) {
                    continue;
                }
                const parts = [
                    missing.length ? `missing {${missing.join(",")}}` : "",
                    extra.length ? `extra {${extra.join(",")}}` : "",
                ].filter(Boolean);
                findings.push({
                    source,
                    key,
                    kind:
                        what === "placeholder"
                            ? "placeholder-drift"
                            : "tag-drift",
                    detail: `${label} vs ${refLabel}: ${parts.join(" ")}`,
                });
            }
        }
    }

    return findings;
}

export function formatFindings(findings: Finding[]): string {
    return findings
        .map(
            (finding) =>
                `${finding.source ? `${finding.source}:` : ""}${finding.key} [${finding.rule ?? finding.kind}] ${finding.detail}`
        )
        .join("\n");
}

export type LocaleCoverage = {
    present: number;
    total: number;
    /** 0–1. Ratchet an optional locale toward 1, then flip it to required. */
    ratio: number;
};

/**
 * How much of a dictionary each locale actually covers.
 *
 * The same walk that produces findings answers this, which is what makes a
 * rollout observable: CI can hold the line at a ratio and raise it, and at 1
 * the locale becomes required and the compiler takes over.
 */
export function localeCoverage(
    content: Record<string, unknown>,
    locales: readonly string[]
): Record<string, LocaleCoverage> {
    // Coverage counts keys that carry copy, so a group contributes its
    // branches and not itself.
    const flat = flattenContent(content);
    const total = flat.length;
    const coverage: Record<string, LocaleCoverage> = {};

    for (const locale of locales) {
        let present = 0;
        for (const { byLocale } of flat) {
            if (byLocale[locale] !== undefined) {
                present += 1;
            }
        }
        coverage[locale] = {
            present,
            total,
            ratio: total === 0 ? 1 : present / total,
        };
    }

    return coverage;
}
