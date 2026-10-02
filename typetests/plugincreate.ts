import type { Tagged } from "../src/index.js";

/**
 * Content files author plugin values through the plugin's own `create`, never
 * by writing the `__tag` marker. `default` is required, because it is both the
 * resolver's fallback and where argument types are read from.
 */
import { createTolka, defineLocale, definePlugin } from "../src/index.js";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: string) =>
        value.states[axis] ?? value.states.default,
});

const tone = tonePlugin.create;

const tolka = createTolka({
    locales: [defineLocale("sv"), defineLocale("en")],
    defaultLocale: "sv",
    plugins: [tonePlugin],
});

const dictionary = tolka.createDictionary({
    content: {
        greeting: {
            sv: tone({ default: "Hej", formal: "God dag" }),
            en: tone({ default: "Hello" }),
        },
        counted: {
            sv: tone({ default: "{n, plural, =1 {1 fil} other {# filer}}" }),
            en: tone({ default: "{n, plural, =1 {1 file} other {# files}}" }),
        },
    },
});

const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "formal" },
});

// Argument types still come from the default state.
const greeting: string = content.greeting;
void greeting;
void content.counted({ n: 3 });
// @ts-expect-error `n` is a number
void content.counted({ n: "3" });

// @ts-expect-error a state set without `default` has no fallback and no types
tone({ formal: "God dag" });

// The raw marker is rejected the same way, so the rule holds without `create`.
tolka.createDictionary({
    content: {
        // @ts-expect-error `default` is required
        raw: { sv: { __tag: "tone", states: { formal: "x" } }, en: "x" },
    },
});
