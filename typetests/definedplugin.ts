/**
 * A package that defines a plugin and re-exports it has to annotate it: the
 * inferred type names `PluginCreate`, and a package emitting declarations then
 * fails with TS2883. `DefinedPlugin` is that annotation.
 */
import type { DefinedPlugin, PluginCreate, Tagged } from "../src/index.js";

import { createTolka, definePlugin } from "../src/index.js";

type Tone = "formal" | null;

const plugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis ?? "default"] ?? value.states.default,
    defaultAxisValue: null,
});

/** The annotation a consuming package writes. */
export const tonePlugin: DefinedPlugin<"tone", Tone> = plugin;

/** And the helper alone, for content files. */
export const tone: PluginCreate<"tone"> = plugin.create;

/** An annotated plugin still registers, and still carries its axis through. */
const tolka = createTolka({
    locales: ["sv"],
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
});

const dictionary = tolka.createDictionary({
    content: {
        greeting: { sv: tone({ default: "Hej", formal: "God dag" }) },
    },
});

export function resolves() {
    return tolka.resolveDictionary(dictionary, {
        locale: "sv",
        // `defaultAxisValue` is declared, so the key stays optional.
        state: {},
    });
}

export function rejectsAWrongAxisValue() {
    return tolka.resolveDictionary(dictionary, {
        locale: "sv",
        // @ts-expect-error `casual` is not a Tone
        state: { tone: "casual" },
    });
}
