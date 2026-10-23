import type { ReactNode } from "react";

import type { GetICUArgs } from "./vendor/icu-type-parser.js";

type Opts = {
    ICUArgument: string | number;
    ICUNumberArgument: number;
    ICUDateArgument: Date;
};

/** The arguments a message's ICU placeholders require. */
export type Params<M extends string> = GetICUArgs<M, Opts>;

/** Opening tag names in a message. ICU tags carry no attributes, by design. */
export type TagNames<M extends string> =
    M extends `${string}<${infer T}>${infer Rest}`
        ?
              | (T extends `/${string}`
                    ? never
                    : T extends `${string}/`
                      ? never
                      : T)
              | TagNames<Rest>
        : never;

/** The tail after the last `<`, so a nested opening tag yields its own name. */
type AfterLastLt<S extends string> = S extends `${string}<${infer R}`
    ? AfterLastLt<R>
    : S;
type TrimEnd<S extends string> = S extends `${infer R} ` ? TrimEnd<R> : S;

/**
 * Self-closing tags in a message. ICU has no such concept: `<X />` parses as a
 * literal text node, so it renders as itself and the renderer is never called.
 */
export type SelfClosingTags<M extends string> =
    M extends `${string}<${infer T}/>${infer Rest}`
        ? TrimEnd<AfterLastLt<T>> | SelfClosingTags<Rest>
        : never;

export type HasTags<M extends string> = [TagNames<M>] extends [never]
    ? false
    : true;

type Returns<M extends string> = HasTags<M> extends true ? ReactNode : string;

export type TagRenderers<M extends string> = {
    [K in TagNames<M>]: (chunks: ReactNode) => ReactNode;
};

type Args<M extends string> = Params<M> & TagRenderers<M>;

export type SelfClosingError<M extends string> = {
    __tolkaError: "ICU renders a self-closing tag as literal text. Use {placeholder} or a paired <tag></tag>.";
    offendingTags: SelfClosingTags<M>;
};

/** No params and no tags -> a plain string. Otherwise a formatter. */
type Formatter<M extends string> = keyof Params<M> extends never
    ? HasTags<M> extends true
        ? (tags: TagRenderers<M>) => ReactNode
        : string
    : (args: Args<M>) => Returns<M>;

/**
 * What a resolved key hands back. The contract is frozen: untagged is `string`,
 * tagged is `ReactNode`, and no option or mode may ever change it.
 */
export type Value<M extends string> = [SelfClosingTags<M>] extends [never]
    ? Formatter<M>
    : SelfClosingError<M>;

// ---------------------------------------------------------------- plugins

export type Tagged<
    Tag extends string,
    States extends Record<string, string> = Record<string, string>,
> = {
    readonly __tag: Tag;
    readonly states: States;
};

export interface Plugin<Tag extends string, Axis> {
    tag: Tag;
    resolve: (value: Tagged<Tag>, axis: Axis) => string;
    /** Declaring one makes this plugin's `state` key optional at the provider. */
    defaultAxisValue?: Axis | undefined;
}

/**
 * Constraint only. Structural rather than `Plugin<any, any>`: `never` in the
 * parameter positions accepts any concrete plugin contravariantly, while the
 * return stays pinned to `string`. Using `any` there made the whole signature
 * `any`-ish, so a plugin whose `resolve` returned a number compiled cleanly.
 */
export type AnyPlugin = {
    tag: string;
    resolve: (value: never, axis: never) => string;
    defaultAxisValue?: unknown;
};

/**
 * The axis is whatever `resolve` accepts, read from there alone. Inferring it
 * from the whole plugin would let a declared `defaultAxisValue` narrow the axis
 * to that one literal.
 */
type AxisOf<K> = K extends {
    resolve: (value: never, axis: infer Axis) => string;
}
    ? Axis
    : never;

/**
 * Whether the plugin literal declared a default.
 *
 * This reads the shape `definePlugin` preserves, not the `Plugin` interface:
 * `defaultAxisValue` is optional there, so it is always in `keyof` and an
 * annotated plugin would always look as though it had one.
 */
type DeclaresDefault<K> = "defaultAxisValue" extends keyof K ? true : false;

/**
 * The provider's `state` shape, derived from the registered plugins. A plugin
 * that declares a `defaultAxisValue` makes its key optional.
 */
export type StateFromPlugins<P extends readonly AnyPlugin[]> = {
    [K in P[number] as DeclaresDefault<K> extends true
        ? never
        : K["tag"]]: AxisOf<K>;
} & {
    [K in P[number] as DeclaresDefault<K> extends true
        ? K["tag"]
        : never]?: AxisOf<K>;
};

// ---------------------------------------------------------------- locales

/**
 * Inert descriptor data, like a plugin's. Sharing locale descriptors between
 * packages is an ordinary import, which is how a package can have German
 * required while its neighbour still has it optional.
 */
export type LocaleDef<
    Code extends string = string,
    Optional extends boolean = boolean,
> = {
    readonly code: Code;
    readonly optional: Optional;
};

/** A bare code is shorthand for a required locale. */
export type LocaleInput = string | LocaleDef;

type CodeOf<S> = S extends string
    ? S
    : S extends { readonly code: infer Code extends string }
      ? Code
      : never;

export type LocalesOf<Spec extends readonly LocaleInput[]> = CodeOf<
    Spec[number]
>;

export type OptionalLocalesOf<Spec extends readonly LocaleInput[]> = CodeOf<
    Extract<Spec[number], { readonly optional: true }>
>;

export type RequiredLocalesOf<Spec extends readonly LocaleInput[]> = Exclude<
    LocalesOf<Spec>,
    OptionalLocalesOf<Spec>
>;

// ---------------------------------------------------------------- content

export type Leaf = string | Tagged<string>;

/**
 * Required locales are required keys; optional ones may be absent. A missing
 * required locale is a compile error at authoring time, which is what makes
 * the sv->en coercion bug class structurally impossible.
 */
export type Content<L extends string, R extends L = L> = Record<
    string,
    { [K in R]: Leaf } & { [K in Exclude<L, R>]?: Leaf | undefined }
>;

/**
 * Param types are seeded from the default locale and the `default` axis state.
 * Reconciling every locale x state at the type level is not worth the
 * complexity; that they agree is enforced by the consistency checks instead.
 */
export type MessageOf<V> = V extends string
    ? V
    : V extends Tagged<string, infer S>
      ? "default" extends keyof S
          ? S["default"] extends string
              ? S["default"]
              : string
          : string
      : string;

/** Which plugin tags a dictionary's content actually uses. */
export type TagsUsed<C> = {
    [K in keyof C]: {
        [Loc in keyof C[K]]: C[K][Loc] extends Tagged<infer T> ? T : never;
    }[keyof C[K]];
}[keyof C];

/**
 * Reserved from day one so a dev transform can attribute content later without
 * a breaking change to the shape every `.content.ts` produces.
 */
export type DictionaryMeta = {
    /** Source module id, injected by a dev transform. Never hand-written. */
    source?: string | undefined;
};

export interface Dictionary<C> {
    content: C;
    meta?: DictionaryMeta | undefined;
}

export type Resolved<C, D extends PropertyKey> = {
    [K in keyof C]: D extends keyof C[K] ? Value<MessageOf<C[K][D]>> : never;
};
