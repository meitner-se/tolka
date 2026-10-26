import type { Tagged } from "../src/index.js";

/**
 * `useDictionary`'s second argument overrides axes for one read. It is partial,
 * so a plugin left out keeps the provider's value, and it is still typed: an
 * unknown axis or an unknown state is a compile error rather than a silent
 * fallback to the default.
 */
import { createTolka, definePlugin } from "../src/index.js";
import { createReactBindings } from "../src/react.js";

type Tone = "formal" | "casual";
type Density = "cosy" | "compact";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis] ?? value.states.default,
});

const densityPlugin = definePlugin({
    tag: "density",
    resolve: (value: Tagged<"density">, axis: Density) =>
        value.states[axis] ?? value.states.default,
});

const tolka = createTolka({
    locales: ["sv"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin, densityPlugin] as const,
});

const { useDictionary } = createReactBindings(tolka);

const dictionary = tolka.createDictionary({
    content: { save: { sv: "Spara" } },
});

// Omitting it keeps every axis the provider supplies.
useDictionary(dictionary);

// One axis at a time; the other is inherited rather than reset.
useDictionary(dictionary, { tone: "formal" });
useDictionary(dictionary, { density: "compact" });
useDictionary(dictionary, { tone: "formal", density: "compact" });

// @ts-expect-error partial does not mean untyped
useDictionary(dictionary, { tone: "Nope" });

// @ts-expect-error an axis no plugin declares
useDictionary(dictionary, { spacing: "compact" });
