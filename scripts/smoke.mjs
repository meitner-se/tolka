/**
 * Loads the built package the way a consumer would.
 *
 * Unit tests run against `src/`, so nothing else exercises the emitted output.
 * A dropped import extension, a bad `exports` map or a stray type-only import
 * surviving into JS all produce a package that typechecks, lints and tests
 * clean while failing on first import.
 */
import assert from "node:assert/strict";

import { createTolka, definePlugin } from "../dist/index.js";

const tone = definePlugin({
    tag: "tone",
    resolve: (value, axis) => value.states[axis] ?? value.states.default,
});

const tolka = createTolka({
    locales: ["sv", "en"],
    defaultLocale: "sv",
    plugins: [tone],
    onError: () => {},
});

const dictionary = tolka.createDictionary({
    content: {
        plain: { sv: "Filer", en: "Files" },
        counted: {
            sv: "{n, plural, one {# fil} other {# filer}}",
            en: "{n, plural, one {# file} other {# files}}",
        },
        varied: {
            sv: {
                __tag: "tone",
                states: { default: "Filer", formal: "Dokument" },
            },
            en: "Files",
        },
    },
});

const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "formal" },
});

assert.equal(content.plain, "Filer");
assert.equal(content.counted({ n: 1 }), "1 fil");
assert.equal(content.counted({ n: 4 }), "4 filer");
assert.equal(content.varied, "Dokument");

// A failed format degrades to the raw message rather than throwing.
assert.equal(content.counted({}), "{n, plural, one {# fil} other {# filer}}");

// The day-one seams survive the build.
const marked = createTolka({
    locales: ["sv"],
    defaultLocale: "sv",
    plugins: [],
    onError: () => {},
    postResolve: (message, info) =>
        `[${info.source ?? "?"}:${info.key}]${message}`,
});
const markedDictionary = marked.createDictionary({
    content: { plain: { sv: "Filer" } },
    meta: { source: "example.dictionary.ts" },
});
assert.equal(
    marked.resolveDictionary(markedDictionary, { locale: "sv", state: {} })
        .content.plain,
    "[example.dictionary.ts:plain]Filer"
);

// The react subpath resolves and emits.
const { createReactBindings } = await import("../dist/react.js");
const bindings = createReactBindings(tolka);
assert.equal(typeof bindings.DictionaryProvider, "function");
assert.equal(typeof bindings.useDictionary, "function");

// The testing subpath resolves and gates a corpus.
const { runConsistencyChecks } = await import("../dist/testing.js");
const report = runConsistencyChecks(
    { locales: ["sv", "en"], defaultLocale: "sv" },
    {
        "./a.content.ts": {
            content: { greet: { sv: "Hej {name}", en: "Hello" } },
        },
    }
);
assert.equal(report.findings.length, 1);
assert.equal(report.findings[0].source, "./a.content.ts");
assert.equal(report.coverage.sv.ratio, 1);

console.log("smoke: built package loads and resolves correctly");
