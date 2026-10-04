import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { FormatXMLElementFn, PrimitiveType } from "intl-messageformat";
import type { ReactNode } from "react";

import { IntlMessageFormat } from "intl-messageformat";

import type {
    AnyPlugin,
    Plugin,
    Content,
    Dictionary,
    DictionaryMeta,
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

import { checkDictionary, formatFindings, type Finding } from "./check.js";

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

    createDictionary<const C extends Content<L, R>>(definition: {
        content: C;
        meta?: DictionaryMeta | undefined;
    }): Dictionary<C>;

    /** A dictionary may only be resolved by a config registering all its tags. */
    resolveDictionary<C extends Content<L, R>>(
        dictionary: Dictionary<C> &
            ([TagsUsed<C>] extends [P[number]["tag"]] ? unknown : never),
        options: { locale: L; state: StateFromPlugins<P> }
    ): { content: Resolved<C, D> };

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
            const findings: Finding[] = checkDictionary(
                definition.content,
                config.defaultLocale,
                definition.meta?.source,
                codes
            );
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

        resolveDictionary<C extends Content<AllLocales, RequiredLocales>>(
            dictionary: Dictionary<C> &
                ([TagsUsed<C>] extends [P[number]["tag"]] ? unknown : never),
            options: { locale: AllLocales; state: StateFromPlugins<P> }
        ): { content: Resolved<C, D> } {
            const { locale, state } = options;
            // Widened for iteration: an optional locale makes the entry an
            // intersection of mapped types, which cannot be indexed by the
            // full locale union while those are still generic.
            const entries: Record<
                string,
                Partial<Record<string, Leaf>>
            > = dictionary.content;
            const source = dictionary.meta?.source;
            const content: Record<string, unknown> = {};

            for (const [key, byLocale] of Object.entries(entries)) {
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
                    content[key] = message;
                    continue;
                }

                if (isLiteral(referenceFormatter)) {
                    content[key] = message;
                    continue;
                }

                content[key] = (args: FormatValues) => {
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

            return { content: sealResolved<C, D>(content) };
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
