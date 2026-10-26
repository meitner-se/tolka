import {
    cloneElement,
    createContext,
    createElement,
    Fragment,
    isValidElement,
    useContext,
    useMemo,
    type ReactNode,
} from "react";

import type { Tolka } from "./runtime.js";
import type {
    AnyDictionary,
    AnyPlugin,
    ChainGuard,
    Content,
    Dictionary,
    Extended,
    Resolved,
    StateFromPlugins,
    TagsUsed,
} from "./types.js";

/**
 * `format` returns an array as soon as a tag renderer yields a non-string, and
 * React warns about missing keys on a bare array. The core stays free of React
 * at runtime, so the wrapping lives here.
 */
/**
 * The core is React-free, so its formatters are typed `unknown`. This module is
 * the boundary where that becomes `ReactNode`, and this is the one place the
 * crossing is asserted.
 */
function asNode(value: unknown): ReactNode {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    return value as ReactNode;
}

function toNode(value: unknown): unknown {
    if (!Array.isArray(value)) {
        return value;
    }
    return createElement(
        Fragment,
        null,
        ...value.map((part: unknown, index: number) =>
            typeof part === "object" && part !== null
                ? createElement(Fragment, { key: index }, asNode(part))
                : asNode(part)
        )
    );
}

type Formatter = (...args: unknown[]) => unknown;

function isFormatter(value: unknown): value is Formatter {
    return typeof value === "function";
}

/**
 * Tag renderers, wrapped so each element they return carries a key.
 *
 * `toNode` keys only the array `format` returns at the top. A nested tag hands
 * its renderer an array of already-built elements as `chunks` — `<ul>` receives
 * its `<li>`s — and the renderer created each of those without a key, so React
 * warns once per element. A call site cannot fix this:
 * `Children.toArray(chunks)` keys the children, while React validates the
 * element the renderer handed back.
 *
 * The counter restarts per call, so a key depends on the message rather than on
 * how many times it has been rendered.
 */
function keyRenderers(args: unknown[]): unknown[] {
    const [first, ...rest] = args;
    if (typeof first !== "object" || first === null) {
        return args;
    }
    const keyed: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(first)) {
        if (!isFormatter(value)) {
            keyed[name] = value;
            continue;
        }
        // Per tag, so the keys read as `li0`, `li1` rather than one running
        // count across every tag in the message.
        let index = 0;
        keyed[name] = (...inner: unknown[]) => {
            const result = value(...inner);
            if (!isValidElement(result)) {
                return result;
            }
            index += 1;
            return cloneElement(result, { key: `${name}${index}` });
        };
    }
    return [keyed, ...rest];
}

function wrapFormatters(
    content: Record<string, unknown>
): Record<string, unknown> {
    const wrapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
        wrapped[key] = isFormatter(value)
            ? (...args: unknown[]) => toNode(value(...keyRenderers(args)))
            : value;
    }
    return wrapped;
}

/** Stable across renders for the same axis values, whatever object identity. */
function stateKey(state: Record<string, unknown>): string {
    return JSON.stringify(
        Object.keys(state)
            // oxlint-disable-next-line unicorn/no-array-sort -- `Object.keys` returns a fresh array; `toSorted` would need ES2023 and raise this library's runtime floor
            .sort()
            .map((key) => [key, state[key]])
    );
}

/**
 * What `createReactBindings` returns, named rather than inferred.
 *
 * A consumer holds these in a module of its own — one instance, one context —
 * and packages that emit declarations re-export them. Left anonymous, the
 * declaration emitter has no name to point at and writes `useDictionary`'s
 * type out in full, which walks `Extended` and `ChainGuard` into their own
 * recursion and fails with TS5088 in the consumer, not here. Naming it is what
 * lets `export const { useDictionary } = createReactBindings(tolka)` be
 * inferred, with no annotation on the consumer's side.
 */
export type DictionaryProviderOf<
    L extends string,
    P extends readonly AnyPlugin[],
> = (props: {
    locale: L;
    state: StateFromPlugins<P>;
    children: ReactNode;
}) => ReactNode;

export type UseDictionaryOf<
    L extends string,
    R extends L,
    D extends R,
    P extends readonly AnyPlugin[],
> = <C extends Content<L, R>, E extends readonly AnyDictionary[] = []>(
    dictionary: Dictionary<C, E> &
        ChainGuard<L, R, E> &
        ([TagsUsed<Extended<C, E>>] extends [P[number]["tag"]]
            ? unknown
            : never),
    /**
     * Axis values for this read alone, merged over the provider's. A component
     * that knows it is showing another axis says so where it reads the copy,
     * rather than wrapping itself in a second provider — which would also have
     * to restate the locale, and would replace the whole state rather than the
     * one axis it means to change.
     */
    state?: Partial<StateFromPlugins<P>>
) => { content: Resolved<Extended<C, E>, D> };

export interface ReactBindings<
    L extends string,
    R extends L,
    D extends R,
    P extends readonly AnyPlugin[],
> {
    DictionaryProvider: DictionaryProviderOf<L, P>;
    useDictionary: UseDictionaryOf<L, R, D, P>;
}

export function createReactBindings<
    L extends string,
    R extends L,
    D extends R,
    P extends readonly AnyPlugin[],
>(tolka: Tolka<L, R, D, P>): ReactBindings<L, R, D, P> {
    type State = StateFromPlugins<P>;
    type Axes = { locale: L; state: State };

    const Context = createContext<Axes | null>(null);

    /**
     * Resolution is memoised per (dictionary, locale, state) rather than per
     * component, so two components reading the same dictionary share one
     * object. Plain-string keys and formatter functions then keep a stable
     * identity across renders and are safe in dependency arrays.
     */
    type ResolvedContent = { content: Record<string, unknown> };

    const cache = new WeakMap<object, Map<string, ResolvedContent>>();

    /**
     * The one assertion in this module. The cache holds entries for many
     * dictionaries at once, so it cannot carry each one's derived content type;
     * only the call site's `C` knows it.
     */
    function asResolved<C>(entry: ResolvedContent): {
        content: Resolved<C, D>;
    } {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
        return entry as { content: Resolved<C, D> };
    }

    function DictionaryProvider(props: {
        locale: L;
        state: State;
        children: ReactNode;
    }): ReactNode {
        const { locale, state, children } = props;
        // Purely an optimisation: the context value keeps its identity while
        // the axis values are unchanged, so consumers are not invalidated by a
        // fresh `state` object each render. Nothing breaks if React drops it.
        const key = `${locale}\u0000${stateKey(state)}`;
        const axes = useMemo<Axes>(
            () => ({ locale, state }),
            // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the value identity
            [key]
        );
        return createElement(Context.Provider, { value: axes }, children);
    }

    function useDictionary<
        C extends Content<L, R>,
        E extends readonly AnyDictionary[] = [],
    >(
        dictionary: Dictionary<C, E> &
            ChainGuard<L, R, E> &
            ([TagsUsed<Extended<C, E>>] extends [P[number]["tag"]]
                ? unknown
                : never),
        state?: Partial<State>
    ): { content: Resolved<Extended<C, E>, D> } {
        const axes = useContext(Context);
        if (!axes) {
            throw new Error(
                "tolka: useDictionary was called outside its DictionaryProvider"
            );
        }

        const resolvedState: State = state
            ? { ...axes.state, ...state }
            : axes.state;

        const key = `${axes.locale}\u0000${stateKey(resolvedState)}`;
        let byAxes = cache.get(dictionary);
        if (!byAxes) {
            byAxes = new Map();
            cache.set(dictionary, byAxes);
        }

        const cached = byAxes.get(key);
        if (cached) {
            return asResolved<Extended<C, E>>(cached);
        }

        // Resolution is pure apart from `onError`, and the cache means a
        // report fires once per (dictionary, locale, state) rather than per
        // render.
        const resolved = tolka.resolveDictionary(dictionary, {
            locale: axes.locale,
            state: resolvedState,
        });
        const result: ResolvedContent = {
            content: wrapFormatters(resolved.content),
        };
        byAxes.set(key, result);
        return asResolved<Extended<C, E>>(result);
    }

    return { DictionaryProvider, useDictionary };
}
