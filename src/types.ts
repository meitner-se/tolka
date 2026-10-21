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

/**
 * A plugin's states. `default` is required: it is what the resolver falls back
 * to, and what argument types are read from, so a set without one would lose
 * inference silently and render nothing at runtime.
 */
export type TaggedStates = Record<string, string> & { default: string };

export type Tagged<
    Tag extends string,
    States extends TaggedStates = TaggedStates,
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
export type LocaleMap<L extends string, R extends L = L> = {
    [K in R]: Leaf;
} & { [K in Exclude<L, R>]?: Leaf | undefined };

/**
 * A key maps either to its copy, one entry per locale, or to a group of
 * further keys. Groups exist so a closed union can be read dynamically
 * (`content.sectionType[category]`) while the compiler still proves every
 * branch has copy.
 *
 * The two cases never collide: a locale map's values are `Leaf`, a group's
 * are records. That holds even for a branch named after a locale, which is
 * why nothing here inspects key names.
 */
/**
 * Counts the type's expansion down to zero. Unbounded recursion here is what
 * TypeScript 5.6 and 5.7 reject with TS2589 ("excessively deep"); 5.9 accepts
 * it, so without the bound the declared support range would quietly become
 * 5.8+. Four levels is far past anything content should need -- the lint rule
 * stops authors at two -- and the runtime recursion is not bounded at all.
 */
type Down = [never, 0, 1, 2, 3];

export type Content<
    L extends string,
    R extends L = L,
    D extends 0 | 1 | 2 | 3 | 4 = 4,
> = {
    [key: string]: D extends 0
        ? LocaleMap<L, R>
        : LocaleMap<L, R> | Content<L, R, Down[D]>;
};

/**
 * True when a node carries copy rather than further keys. `Leaf` is a string
 * or a plugin tag, and a group's values are neither.
 */
export type IsLocaleMap<T> = [Extract<T[keyof T], Leaf>] extends [never]
    ? false
    : true;

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
export type TagsUsed<C, N extends 0 | 1 | 2 | 3 | 4 = 4> = {
    [K in keyof C]: IsLocaleMap<C[K]> extends true
        ? {
              [Loc in keyof C[K]]: C[K][Loc] extends Tagged<infer T>
                  ? T
                  : never;
          }[keyof C[K]]
        : N extends 0
          ? never
          : TagsUsed<C[K], Down[N]>;
}[keyof C];

/**
 * Reserved from day one so a dev transform can attribute content later without
 * a breaking change to the shape every `.content.ts` produces.
 */
export type DictionaryMeta = {
    /** Source module id, injected by a dev transform. Never hand-written. */
    source?: string | undefined;
};

/**
 * Structural constraint for whatever sits in an `extends` array.
 *
 * Loose about the nested `extends` on purpose: those elements were constrained
 * when each of them was built, and restating the constraint here would make
 * the type recursive for no added proof.
 */
export type AnyDictionary = {
    content: object;
    extends?: readonly unknown[] | undefined;
    meta?: DictionaryMeta | undefined;
};

export interface Dictionary<C, E extends readonly AnyDictionary[] = []> {
    content: C;
    /**
     * Dictionaries this one also resolves, so one `useDictionary` hands back
     * every key a component reads.
     *
     * The copy stays theirs: `content` holds this dictionary's own keys and
     * nothing more, which is what keeps coverage, the consistency checks and
     * the audit counting each key once, under the dictionary that defines it.
     */
    extends?: E | undefined;
    meta?: DictionaryMeta | undefined;
}

// ---------------------------------------------------------------- extends

/**
 * Counts an `extends` chain down to zero, for the reason `Down` counts content
 * depth: unbounded conditional recursion is what TypeScript 5.6 and 5.7 reject
 * with TS2589. Four hops is far past what the model is for -- `extends`
 * composes small units, and a chain longer than that is the namespace tree
 * colocated dictionaries replace.
 *
 * `ChainProblems` counts with the same ladder, so a dictionary is refused at
 * exactly the hop where this walk would start dropping content. Truncating
 * quietly was the original mistake: it left the fifth hop's plugin tags out of
 * the capability check, which made a config that lacked them accept the
 * dictionary rather than reject it. The runtime walk is not bounded at all.
 */
type ChainDown = [never, 0, 1, 2];

/**
 * Everything resolving a dictionary yields: its own content intersected with
 * each extended dictionary's, transitively.
 *
 * An intersection rather than a merge: the keys are proven disjoint at
 * `createDictionary`, so there is nothing for a merge to decide, and `Resolved`
 * maps over it to one flat object either way.
 */
export type Extended<C, E, N extends 0 | 1 | 2 | 3 = 3> = C &
    ExtendedList<E, N>;

type ExtendedList<E, N extends 0 | 1 | 2 | 3> = E extends readonly [
    infer Head,
    ...infer Rest,
]
    ? ExtendedOne<Head, N> & ExtendedList<Rest, N>
    : unknown;

type ExtendedOne<D, N extends 0 | 1 | 2 | 3> =
    D extends Dictionary<infer C, infer E>
        ? N extends 0
            ? C
            : Extended<C, E, ChainDown[N]>
        : unknown;

/** The top-level keys a dictionary resolves, its extends' included. */
type KeysOf<D> = Extract<keyof ExtendedOne<D, 3>, string>;

/**
 * Where a key already came from. A dictionary is an anonymous module object,
 * so there is no name to report; its position in the call -- `content`, or
 * `extends[1]` -- is what locates it, and the error points at the source line
 * that spells both out.
 */
type OwnerOf<
    Key extends string,
    Own extends string,
    Rest,
    I extends readonly unknown[] = [],
> = Key extends Own
    ? "content"
    : Rest extends readonly [infer Head, ...infer Tail]
      ? Key extends KeysOf<Head>
          ? `extends[${I["length"]}]`
          : OwnerOf<Key, Own, Tail, [...I, unknown]>
      : "an extended dictionary";

type Describe<
    Keys extends string,
    Own extends string,
    All,
    At extends number,
> = Keys extends string
    ? `"${Keys}" is defined by both ${OwnerOf<Keys, Own, All>} and extends[${At}], so which copy a component gets would be a coin toss -- rename it, or drop one of them`
    : never;

/**
 * Every key two of a resolution's dictionaries both define.
 *
 * The owner lookup only ever runs on the failing branch, which a conditional
 * leaves uninstantiated otherwise -- so a dictionary with no collision pays
 * for the key-set union and nothing else.
 */
type Walk<
    Own extends string,
    All,
    Rest,
    Seen extends string,
    I extends readonly unknown[],
> = Rest extends readonly [infer Head, ...infer Tail]
    ?
          | ([Extract<KeysOf<Head>, Seen>] extends [never]
                ? never
                : Describe<Extract<KeysOf<Head>, Seen>, Own, All, I["length"]>)
          | Walk<Own, All, Tail, Seen | KeysOf<Head>, [...I, unknown]>
    : never;

export type ExtendsProblem<Detail extends string> = {
    __tolkaError: "extends: this dictionary cannot be resolved as written. `problem` says what is wrong; every check here fails loudly rather than quietly resolving something it could not prove.";
    problem: Detail;
};

type GuardFrom<Detail extends string> = [Detail] extends [never]
    ? unknown
    : ExtendsProblem<Detail>;

/**
 * Whether the chain is one the type can read end to end.
 *
 * A chain it cannot read has to be refused rather than shrugged at. Every
 * capability this feature rests on -- which plugin tags the copy uses, which
 * locales it covers, which keys collide -- is derived from `Extended`, so a
 * hop the walk cannot see does not fail the check, it *weakens* it: the tags
 * of a dictionary beyond the bound simply stop being required, and a config
 * missing their plugin resolves it anyway.
 */
type ChainProblems<
    L extends string,
    R extends L,
    E,
    N extends 0 | 1 | 2 | 3 = 3,
> = E extends readonly [infer Head, ...infer Rest]
    ? HeadProblem<L, R, Head, N> | ChainProblems<L, R, Rest, N>
    : [E] extends [readonly []]
      ? never
      : "`extends` must be an array literal at the call, so the compiler can see which dictionaries are in it -- a hoisted array hides them, and what it hides stops being checked";

/**
 * The locale proof lives here rather than in the constraint on `extends`.
 *
 * As a constraint it only reached the immediate elements, so a wrapper with
 * empty content let a foreign locale set through one hop below it. Carrying it
 * down the same walk reaches every hop -- and keeps the message accurate,
 * because a constraint that fails makes inference fall back to the constraint
 * itself, which then reports whatever is wrong with *that* instead.
 */
type HeadProblem<L extends string, R extends L, D, N extends 0 | 1 | 2 | 3> =
    D extends Dictionary<infer C, infer E>
        ?
              | (C extends Content<L, R>
                    ? never
                    : "an extended dictionary's content is not valid for this config's locales -- it was built for a different locale set")
              | (N extends 0
                    ? [E] extends [readonly []]
                        ? never
                        : "an `extends` chain runs further than four hops, which is further than the types can prove -- compose shallower units instead"
                    : ChainProblems<L, R, E, ChainDown[N]>)
        : never;

/**
 * `unknown` when there is nothing to refuse, so the definition is accepted
 * unchanged; otherwise a shape no object literal can satisfy.
 */
export type ExtendsGuard<L extends string, R extends L, C, E> = GuardFrom<
    | ChainProblems<L, R, E>
    | Walk<Extract<keyof C, string>, E, E, Extract<keyof C, string>, []>
>;

/**
 * The same proof minus the collisions, for the resolution paths: a dictionary
 * built by `createDictionary` already had those refused, but nothing
 * guarantees the chain in front of a resolver came from there.
 */
export type ChainGuard<L extends string, R extends L, E> = GuardFrom<
    ChainProblems<L, R, E>
>;

/**
 * What `extends` accepts: a dictionary this config could already resolve on
 * its own, all the way down. The guards prove this per hop rather than
 * constraining `extends` to it -- see `HeadProblem` -- so this is the shape
 * they prove, and the one to name when typing a helper that takes dictionaries.
 */
export interface Extendable<
    L extends string,
    R extends L = L,
> extends Dictionary<Content<L, R>, readonly Extendable<L, R>[]> {}

/**
 * Probing with the default locale, rather than key names, is what keeps a
 * group whose branch is called `sv` from reading as a locale map: that
 * branch's value is a record, not a `Leaf`.
 */
export type Resolved<
    C,
    D extends PropertyKey,
    N extends 0 | 1 | 2 | 3 | 4 = 4,
> = {
    [K in keyof C]: C[K] extends Record<D, Leaf>
        ? Value<MessageOf<C[K][D]>>
        : N extends 0
          ? never
          : Resolved<C[K], D, Down[N]>;
};
