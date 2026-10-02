import type { Tagged } from "../src/index.js";

/**
 * A plugin's `resolve` must return a string. The constraint is structural --
 * `never` parameters keep any concrete plugin assignable while pinning the
 * return -- because `Plugin<any, any>` made the whole signature `any`-ish and
 * left the return unchecked.
 */
import { definePlugin } from "../src/index.js";

definePlugin({
    tag: "ok",
    resolve: (value: Tagged<"ok">, axis: string) =>
        value.states[axis] ?? value.states.default,
});

definePlugin({
    tag: "wrongType",
    // @ts-expect-error resolve must return a string
    resolve: (_value: Tagged<"wrongType">, _axis: string) => 42,
});

definePlugin({
    tag: "maybeUndefined",
    // @ts-expect-error an unguarded Record index is `string | undefined`
    resolve: (value: Tagged<"maybeUndefined">, axis: string) =>
        value.states[axis],
});
