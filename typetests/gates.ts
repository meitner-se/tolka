import type { Tagged } from "../src/index.js";

/**
 * Type-level assertions. These are the product: runtime tests exercise none of
 * this, so every `@ts-expect-error` below is load-bearing -- an unused one is
 * itself a compile error, which is what keeps them honest.
 */
import { createTolka, definePlugin } from "../src/index.js";

type Tone = "formal" | "casual" | null;

// The tone plugin is built entirely outside the library.
const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis ?? "default"] ?? value.states["default"] ?? "",
});

const tolka = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
});

const dictionary = tolka.createDictionary({
    content: {
        plain: { sv: "Filer", en: "Files" },
        counted: {
            sv: "{n, plural, one {# fil} other {# filer}}",
            en: "{n, plural, one {# file} other {# files}}",
        },
        rich: { sv: "Ta bort <b>{name}</b>?", en: "Delete <b>{name}</b>?" },
        picked: {
            sv: "{kind, select, a {A} other {B}}",
            en: "{kind, select, a {A} other {B}}",
        },
    },
});

const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "casual" },
});

// ---- the frozen return-type contract
const plain: string = content.plain;
const counted: string = content.counted({ n: 3 });
void plain;
void counted;

// @ts-expect-error a message with tags returns ReactNode, never string
const rich: string = content.rich({ name: "A", b: (chunks) => chunks });

// @ts-expect-error a plain string is not callable
void content.plain({});

// ---- params are derived from the literal
// @ts-expect-error `n` is a number argument
void content.counted({ n: "3" });
// @ts-expect-error unknown argument
void content.counted({ n: 3, nope: 1 });
// @ts-expect-error missing the tag renderer
void content.rich({ name: "A" });
// @ts-expect-error `kind` is a union of the select branches
void content.picked({ kind: 1 });

void rich;

// ---- the provider state shape is inferred from the registered plugins
tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: null },
});
tolka.resolveDictionary(dictionary, {
    locale: "sv",
    // @ts-expect-error `tone` must be a Tone
    state: { tone: "Nope" },
});
tolka.resolveDictionary(dictionary, {
    locale: "sv",
    // @ts-expect-error an unregistered axis is not part of the state
    state: { tone: null, other: 1 },
});
tolka.resolveDictionary(dictionary, {
    // @ts-expect-error the locale must be one the config declares
    locale: "de",
    state: { tone: null },
});

// ---- locales are required per key
// @ts-expect-error `en` is missing
tolka.createDictionary({ content: { oops: { sv: "Bara svenska" } } });

// ---- ICU renders a self-closing tag as literal text, so the call site fails
const selfClosing = tolka.createDictionary({
    content: { bad: { sv: "Antal: <Value />", en: "Count: <Value />" } },
});
const resolvedSelfClosing = tolka.resolveDictionary(selfClosing, {
    locale: "sv",
    state: { tone: null },
});
// @ts-expect-error a self-closing tag is not a usable slot
void resolvedSelfClosing.content.bad({ Value: () => null });
