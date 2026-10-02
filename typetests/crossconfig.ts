import type { Tagged } from "../src/index.js";

/**
 * A dictionary may only be resolved by a config that registers every plugin tag
 * its content uses -- typed by capability, not by nominal branding.
 */
import { createTolka, definePlugin } from "../src/index.js";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: string) =>
        value.states[axis] ?? value.states.default,
});

const tone = tonePlugin.create;

const withPlugin = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
});

const withoutPlugin = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [] as const,
});

const tagged = withPlugin.createDictionary({
    content: {
        title: {
            sv: tone({ default: "Filer", formal: "Dokument" }),
            en: "Files",
        },
    },
});

const untagged = withPlugin.createDictionary({
    content: { save: { sv: "Spara", en: "Save" } },
});

withPlugin.resolveDictionary(tagged, {
    locale: "sv",
    state: { tone: "formal" },
});

// A dictionary using no plugin tags crosses configs freely.
withoutPlugin.resolveDictionary(untagged, { locale: "sv", state: {} });

// @ts-expect-error this config registers no `tone` plugin
withoutPlugin.resolveDictionary(tagged, { locale: "sv", state: {} });
