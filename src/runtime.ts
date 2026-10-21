import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { FormatXMLElementFn, PrimitiveType } from "intl-messageformat";
import type { ReactNode } from "react";

import { IntlMessageFormat } from "intl-messageformat";

import type {
    AnyDictionary,
    AnyPlugin,
    Plugin,
    Content,
    Dictionary,
    DictionaryMeta,
    Extendable,
    Extended,
    ExtendsGuard,
    LocaleDef,
    LocaleInput,
    LocalesOf,
    RequiredLocalesOf,
    Leaf,
    Resolved,
    StateFromPlugins,
    Tagged,
    TaggedStates,
    TagsUsed,
} from "./types.js";

import {
    checkDictionary,
    checkExtends,
    extendsChain,
    formatFindings,
    isLocaleMap,
    type Finding,
} from "./check.js";

/**
 * `message` is the identifier. With direct imports a dictionary is an anonymous
 * module, so there is no name to report; the raw message text is what locates
 * the failure.
 */
/** What ICU accepts for a message's placeholders and tag renderers. */
export type FormatValues = Record<
    string,
    PrimitiveType | ReactNode | FormatXMLElementFn<ReactNode>
>;

export type ErrorInfo = {
    key: string;
    locale: string;
    message: string;
};

/** What `postResolve` is told about the string it is handed. */
export type ResolveInfo = {
    key: string;
    locale: string;
    /** Present only when a dev transform supplied the dictionary's `meta`. */
    source?: string | undefined;
};

/**
 * Dev-only interceptor on the single resolution path.
 *
 * It runs on the resolved message *before* ICU formatting, so a marker or a
 * pseudo-localization wrapper survives into the formatted output and costs
 * nothing per format call. It is deliberately not applied to the reference
 * message, which decides whether a key is a plain string or a formatter --
 * decorating that could flip the shape.
 *
 * Gate it to development at the call site; the library never ships it on.
 */
export type PostResolve = (message: string, info: ResolveInfo) => string;

export type TolkaConfig<
    Spec extends readonly LocaleInput[],
    D extends RequiredLocalesOf<Spec>,
    P extends readonly AnyPlugin[],
> = {
    locales: Spec;
    /** Must itself be required, which is what makes the one-hop fallback total. */
    defaultLocale: D;
    plugins: P;
    /** Formatting never throws at render; failures arrive here instead. */
    onError?: ((error: unknown, info: ErrorInfo) => void) | undefined;
    /** Dev-only. See `PostResolve`. */
    postResolve?: PostResolve | undefined;
};

export interface Tolka<
    L extends string,
    R extends L,
    D extends R,
    P extends readonly AnyPlugin[],
> {
    /** Plain codes, whichever form the config declared them in. */
    locales: readonly L[];
    optionalLocales: readonly string[];
    defaultLocale: D;
    plugins: P;

    createDictionary<
        const C extends Content<L, R>,
        const E extends readonly Extendable<L, R>[] = [],
    >(
        definition: {
            /**
             * Dictionaries this one also resolves. Their keys arrive on
             * `content` at resolution without being copied into it, so a
             * component reads one dictionary while coverage, the consistency
             * checks and the audit still see each key once, where it is
             * defined.
             */
            extends?: E;
            content: C;
            meta?: DictionaryMeta | undefined;
        } & ExtendsGuard<C, E>
    ): Dictionary<C, E>;

    /**
     * A dictionary may only be resolved by a config registering all its tags --
     * the extended dictionaries' tags included, since their copy is what comes
     * back.
     */
    resolveDictionary<
        C extends Content<L, R>,
        E extends readonly AnyDictionary[] = [],
    >(
        dictionary: Dictionary<C, E> &
            ([TagsUsed<Extended<C, E>>] extends [P[number]["tag"]]
                ? unknown
                : never),
        options: { locale: L; state: StateFromPlugins<P> }
    ): { content: Resolved<Extended<C, E>, D> };

    /** The stage-3 primitive, for a message that did not come from a dictionary. */
    formatMessage(message: string, locale: L, params?: FormatValues): unknown;
}

/**
 * The authoring helper a plugin hands to content files, so they never write the
 * `__tag` marker by hand.
 */
export type PluginCreate<Tag extends string> = <
    const States extends TaggedStates,
>(
    states: States
) => Tagged<Tag, States>;

/**
 * What `definePlugin` returns: the plugin plus its authoring helper.
 *
 * A package that defines a plugin and re-exports it has to name this type. The
 * inferred one mentions `PluginCreate`, and a package that emits declarations
 * then fails with TS2883 -- "cannot be named without a reference to ...; a type
 * annotation is necessary" -- so leaving it unnamed is not an option
 * downstream.
 */
export type DefinedPlugin<Tag extends string, Axis> = Plugin<Tag, Axis> & {
    create: PluginCreate<Tag>;
};

/**
 * Returns the literal shape rather than the `Plugin` interface, so whether a
 * `defaultAxisValue` was declared survives into `StateFromPlugins`, plus a
 * synthesised `create` so every plugin need not write the same two lines.
 */
export function definePlugin<const P extends AnyPlugin>(
    plugin: P
): P & { create: PluginCreate<P["tag"]> } {
    return {
        ...plugin,
        create: (states) => ({ __tag: plugin.tag, states }),
    };
}

function isDev(): boolean {
    return (
        typeof process !== "undefined" &&
        process.env["NODE_ENV"] !== "production"
    );
}

/** `TYPE.literal`. Typed against the AST so this stays a safe enum comparison. */
const LITERAL_NODE: MessageFormatElement["type"] = 0;

/** A message with nothing to interpolate is handed out as a plain string. */
function isLiteral(formatter: IntlMessageFormat): boolean {
    return formatter.getAst().every((node) => node.type === LITERAL_NODE);
}

/**
 * The only type assertion in the library.
 *
 * `content` is built key by key at runtime, and each key's shape is a mapped
 * type over a generic the compiler has not resolved. No construction can prove
 * that soundly, so the assertion is isolated here rather than spread through
 * the resolution loop.
 */
function sealResolved<C, D extends PropertyKey>(
    content: Record<string, unknown>
): Resolved<C, D> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    return content as Resolved<C, D>;
}

/** A bare code is shorthand for a required locale. */
export function defineLocale<const Code extends string>(
    code: Code
): LocaleDef<Code, false>;
export function defineLocale<
    const Code extends string,
    const Optional extends boolean,
>(code: Code, options: { optional: Optional }): LocaleDef<Code, Optional>;
export function defineLocale(
    code: string,
    options?: { optional?: boolean }
): LocaleDef {
    return { code, optional: options?.optional ?? false };
}

function isOptional(entry: LocaleInput): boolean {
    return typeof entry !== "string" && entry.optional;
}

/**
 * The declared locale codes.
 *
 * `.map` over a union-typed array cannot be proven to produce the mapped
 * union, so the extraction is asserted once here. `locales` needs the precise
 * type for the documented `(typeof tolka)["locales"][number]` derivation.
 */
function toCodes<const Spec extends readonly LocaleInput[]>(
    spec: Spec
): readonly LocalesOf<Spec>[] {
    const codes = spec.map((entry) =>
        typeof entry === "string" ? entry : entry.code
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    return codes as unknown as readonly LocalesOf<Spec>[];
}

export function createTolka<
    const Spec extends readonly LocaleInput[],
    const D extends RequiredLocalesOf<Spec>,
    const P extends readonly AnyPlugin[],
>(
    config: TolkaConfig<Spec, D, P>
): Tolka<LocalesOf<Spec>, RequiredLocalesOf<Spec>, D, P> {
    type AllLocales = LocalesOf<Spec>;
    type RequiredLocales = RequiredLocalesOf<Spec>;

    const codes = toCodes(config.locales);
    const optionalCodes = toCodes(config.locales.filter(isOptional));

    const seen = new Set<string>();
    for (const plugin of config.plugins) {
        if (seen.has(plugin.tag)) {
            throw new Error(`tolka: duplicate plugin tag "${plugin.tag}"`);
        }
        seen.add(plugin.tag);
    }

    const byTag = new Map(config.plugins.map((plugin) => [plugin.tag, plugin]));

    // First call per (message, locale) pays the parse; the rest are cache hits.
    const formatters = new Map<string, IntlMessageFormat>();

    function formatterFor(message: string, locale: string): IntlMessageFormat {
        const cacheKey = `${locale}\u0000${message}`;
        const cached = formatters.get(cacheKey);
        if (cached) {
            return cached;
        }
        const formatter = new IntlMessageFormat(message, locale);
        formatters.set(cacheKey, formatter);
        return formatter;
    }

    function report(error: unknown, info: ErrorInfo): void {
        if (config.onError) {
            config.onError(error, info);
            return;
        }
        console.error(`[tolka] ${info.key} (${info.locale}): ${String(error)}`);
    }

    function resolveLeaf(
        leaf: Leaf | undefined,
        state: Record<string, unknown>,
        info: ErrorInfo
    ): string {
        if (leaf === undefined) {
            return "";
        }
        if (typeof leaf === "string") {
            return leaf;
        }

        const plugin = byTag.get(leaf.__tag);
        if (!plugin) {
            report(
                new Error(`no plugin registered for tag "${leaf.__tag}"`),
                info
            );
            // `TaggedStates` requires a `default`, but this branch is only
            // reached for a tag no plugin handles, which in practice means the
            // value came from outside the type system. A test covers it.
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- see above
            return leaf.states["default"] ?? "";
        }
        const axis =
            plugin.tag in state ? state[plugin.tag] : plugin.defaultAxisValue;
        // The constraint declares `resolve`'s parameters as `never` so any
        // concrete plugin stays assignable while its return stays pinned to
        // `string`. That makes it unassignable to *call*, hence this: the axis
        // came from `state`, which `StateFromPlugins` already typed.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
        const resolve = plugin.resolve as (
            value: Tagged<string>,
            axis: unknown
        ) => string;
        return resolve(leaf, axis);
    }

    return {
        locales: codes,
        optionalLocales: optionalCodes,
        defaultLocale: config.defaultLocale,
        plugins: config.plugins,

        createDictionary(definition) {
            const source = definition.meta?.source;
            const findings: Finding[] = [
                ...checkDictionary(
                    definition.content,
                    config.defaultLocale,
                    source,
                    codes
                ),
                ...checkExtends(definition, source),
            ];
            if (findings.length) {
                // Loud in dev and CI; a copy typo must never crash production.
                const summary = `tolka: inconsistent dictionary\n${formatFindings(findings)}`;
                if (isDev()) {
                    throw new Error(summary);
                }
                console.warn(summary);
            }
            return definition;
        },

        resolveDictionary<
            C extends Content<AllLocales, RequiredLocales>,
            E extends readonly AnyDictionary[] = [],
        >(
            dictionary: Dictionary<C, E> &
                ([TagsUsed<Extended<C, E>>] extends [P[number]["tag"]]
                    ? unknown
                    : never),
            options: { locale: AllLocales; state: StateFromPlugins<P> }
        ): { content: Resolved<Extended<C, E>, D> } {
            const { locale, state } = options;

            function resolveNode(
                node: Record<string, unknown>,
                path: string,
                source: string | undefined
            ): Record<string, unknown> {
                const content: Record<string, unknown> = {};

                for (const [name, value] of Object.entries(node)) {
                    // A group's key contributes a path segment and nothing
                    // else; only a locale map produces copy.
                    const key = path ? `${path}.${name}` : name;
                    if (typeof value !== "object" || value === null) {
                        continue;
                    }
                    const child: Record<string, unknown> = { ...value };

                    if (!isLocaleMap(child)) {
                        content[name] = resolveNode(child, key, source);
                        continue;
                    }

                    content[name] = resolveEntry(key, child, source);
                }

                return content;
            }

            function resolveEntry(
                key: string,
                byLocale: Partial<Record<string, Leaf>>,
                source: string | undefined
            ): unknown {
                const info: ErrorInfo = { key, locale, message: "" };

                // Exactly one hop, to the default locale, which is always
                // required. Rendering nothing is the failure this library
                // exists to avoid, so an absent key is reported rather than
                // quietly becoming an empty string.
                const leaf = byLocale[locale] ?? byLocale[config.defaultLocale];
                if (leaf === undefined) {
                    report(
                        new Error(`no content for key "${key}" in "${locale}"`),
                        info
                    );
                }
                const resolved = resolveLeaf(leaf, state, info);
                const message = config.postResolve
                    ? config.postResolve(resolved, {
                          key,
                          locale,
                          ...(source === undefined ? {} : { source }),
                      })
                    : resolved;

                // The public shape is the type's shape, read off the default
                // locale. A translation that drops its placeholders must not
                // turn a formatter into a bare string at runtime.
                const reference = resolveLeaf(
                    byLocale[config.defaultLocale],
                    state,
                    info
                );

                let referenceFormatter: IntlMessageFormat;
                try {
                    referenceFormatter = formatterFor(
                        reference,
                        config.defaultLocale
                    );
                } catch (error) {
                    report(error, { ...info, message: reference });
                    return message;
                }

                if (isLiteral(referenceFormatter)) {
                    return message;
                }

                return (args: FormatValues) => {
                    try {
                        return formatterFor(message, locale).format<ReactNode>(
                            args
                        );
                    } catch (error) {
                        // A thrown format must not take the screen down.
                        report(error, { ...info, message });
                        return message;
                    }
                };
            }

            // Each extended dictionary contributes its own keys, its own
            // `meta.source` and nothing else. The compiler has already proved
            // the key sets disjoint, so the order here settles nothing -- it
            // is a tie-break for a chain too deep for the type to reach.
            const content: Record<string, unknown> = {};
            for (const member of extendsChain(dictionary)) {
                Object.assign(
                    content,
                    resolveNode(
                        member.dictionary.content,
                        "",
                        member.dictionary.meta?.source
                    )
                );
            }

            return {
                content: sealResolved<Extended<C, E>, D>(content),
            };
        },

        formatMessage(message, locale, params) {
            const decorated = config.postResolve
                ? config.postResolve(message, {
                      key: "<formatMessage>",
                      locale,
                  })
                : message;
            try {
                return formatterFor(decorated, locale).format<ReactNode>(
                    params ?? {}
                );
            } catch (error) {
                report(error, { key: "<formatMessage>", locale, message });
                return message;
            }
        },
    };
}
