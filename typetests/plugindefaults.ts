import type { Tagged } from "../src/index.js";

/**
 * A plugin that declares a `defaultAxisValue` makes its `state` key optional at
 * the provider; one that does not keeps it required.
 */
import { createTolka, definePlugin } from "../src/index.js";

type Tone = "formal" | "casual";

const required = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis] ?? value.states.default,
});

const defaulted = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis] ?? value.states.default,
    defaultAxisValue: "formal",
});

const strict = createTolka({
    locales: ["sv"] as const,
    defaultLocale: "sv",
    plugins: [required] as const,
});

const lenient = createTolka({
    locales: ["sv"] as const,
    defaultLocale: "sv",
    plugins: [defaulted] as const,
});

const dictionary = strict.createDictionary({
    content: { save: { sv: "Spara" } },
});
const other = lenient.createDictionary({ content: { save: { sv: "Spara" } } });

strict.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "formal" },
});
// @ts-expect-error no default declared, so the axis is required
strict.resolveDictionary(dictionary, { locale: "sv", state: {} });

// A declared default makes it optional, and supplying it is still allowed.
lenient.resolveDictionary(other, { locale: "sv", state: {} });
lenient.resolveDictionary(other, {
    locale: "sv",
    state: { tone: "casual" },
});

lenient.resolveDictionary(other, {
    locale: "sv",
    // @ts-expect-error optional does not mean untyped
    state: { tone: "Nope" },
});
