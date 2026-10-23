import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PostResolve, ResolveInfo } from "./runtime.js";
import type { Tagged } from "./types.js";

import { createTolka, defineLocale, definePlugin } from "./runtime.js";

type Tone = "formal" | "casual" | "terse";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: Tone) =>
        value.states[axis] ?? value.states["default"] ?? "",
});

function setup(onError?: (error: unknown, info: unknown) => void) {
    return createTolka({
        locales: ["sv", "en"] as const,
        defaultLocale: "sv",
        plugins: [tonePlugin] as const,
        onError,
    });
}

function call(value: unknown, args: Record<string, unknown>): unknown {
    return (value as (args: Record<string, unknown>) => unknown)(args);
}

describe("plugin resolution and ICU compose", () => {
    const tolka = setup(() => {});
    const dictionary = tolka.createDictionary({
        content: {
            enrolled: {
                sv: {
                    __tag: "tone",
                    states: {
                        default:
                            "{count, plural, one {# fil} other {# filer}} är sparade",
                        formal: "{count, plural, one {# dokument} other {# dokument}} är sparade",
                        terse: "{count, plural, one {# post} other {# poster}} är sparade",
                    },
                },
                en: "{count, plural, one {# file} other {# files}} saved",
            },
        },
    });

    it.each([
        ["formal", "1 dokument är sparade", "4 dokument är sparade"],
        ["casual", "1 fil är sparade", "4 filer är sparade"],
        ["terse", "1 post är sparade", "4 poster är sparade"],
    ])("resolves %s through plugin then ICU", (tone, one, many) => {
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: tone as Tone },
        });
        expect(call(content.enrolled, { count: 1 })).toBe(one);
        expect(call(content.enrolled, { count: 4 })).toBe(many);
    });

    it("ignores the plugin where the locale's leaf is a plain string", () => {
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "en",
            state: { tone: "formal" },
        });
        expect(call(content.enrolled, { count: 2 })).toBe("2 files saved");
    });
});

describe("the public shape follows the default locale, not the active one", () => {
    const tolka = setup(() => {});
    // Built directly rather than through `createDictionary`, which refuses drift
    // in dev. In production drift only warns, so a drifting dictionary does reach
    // resolution -- this is the guard that keeps its runtime shape honest there.
    const dictionary = {
        content: {
            lostParam: { sv: "Hej {name}", en: "Hello" },
            gainedParam: { sv: "Hej", en: "Hello {name}" },
        },
    };

    it.each(["sv", "en"] as const)("keeps shapes stable in %s", (locale) => {
        const { content } = tolka.resolveDictionary(dictionary, {
            locale,
            state: { tone: "casual" },
        });
        expect(typeof content.lostParam).toBe("function");
        expect(typeof content.gainedParam).toBe("string");
    });

    it("renders a formatter over a literal translation", () => {
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "en",
            state: { tone: "casual" },
        });
        expect(call(content.lostParam, { name: "A" })).toBe("Hello");
    });
});

describe("resolution outside React", () => {
    it("works from a route head(), with no hook and no provider", () => {
        const tolka = setup(() => {});
        const dictionary = tolka.createDictionary({
            content: {
                title: {
                    sv: {
                        __tag: "tone",
                        states: { default: "Filer", formal: "Dokument" },
                    },
                    en: "Files",
                },
            },
        });
        const title = (locale: "sv" | "en", tone: Tone) =>
            tolka.resolveDictionary(dictionary, {
                locale,
                state: { tone },
            }).content["title"];

        expect(title("sv", "casual")).toBe("Filer");
        expect(title("sv", "formal")).toBe("Dokument");
        expect(title("en", "formal")).toBe("Files");
        expect(typeof title("sv", "casual")).toBe("string");
    });
});

describe("rich text and failure", () => {
    it("substitutes tags through renderers", () => {
        const tolka = setup(() => {});
        const dictionary = tolka.createDictionary({
            content: {
                rich: {
                    sv: "Du har <b>{n, plural, one {# nytt} other {# nya}}</b> brev",
                    en: "x <b>{n}</b>",
                },
            },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        const node = call(content.rich, {
            n: 3,
            b: (chunks: unknown) => <strong>{chunks as never}</strong>,
        });
        expect(renderToStaticMarkup(<>{node as never}</>)).toBe(
            "Du har <strong>3 nya</strong> brev"
        );
    });

    it("falls back to the raw message and reports instead of throwing", () => {
        const onError = vi.fn();
        const tolka = setup(onError);
        const dictionary = tolka.createDictionary({
            content: { needsArg: { sv: "Hej {name}", en: "Hi {name}" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });

        expect(call(content.needsArg, {})).toBe("Hej {name}");
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[1]).toMatchObject({
            key: "needsArg",
            locale: "sv",
        });
    });

    it("escapes a raw-message fallback rather than injecting markup", () => {
        const tolka = setup(() => {});
        const dictionary = tolka.createDictionary({
            content: { risky: { sv: "<b>{name}</b>", en: "<b>{name}</b>" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        // No `b` renderer supplied, so formatting throws and the raw message returns.
        expect(
            renderToStaticMarkup(<>{call(content.risky, {}) as never}</>)
        ).toBe("&lt;b&gt;{name}&lt;/b&gt;");
    });
});

describe("the consistency check", () => {
    it("refuses a dictionary whose locales disagree on placeholders", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: { greeting: { sv: "Hej {name}", en: "Hello" } },
            })
        ).toThrow(/placeholder-drift/);
    });

    it("refuses drift between a plugin's own states", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: {
                    count: {
                        sv: {
                            __tag: "tone",
                            states: {
                                default: "{n} filer",
                                formal: "dokument",
                            },
                        },
                        en: "{n} files",
                    },
                },
            })
        ).toThrow(/placeholder-drift/);
    });

    it("reports a self-closing tag, which ICU renders as literal text", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: {
                    bad: { sv: "Antal: <Value />", en: "Count: <Value />" },
                },
            })
        ).toThrow(/self-closing/);
    });

    it("accepts a consistent dictionary", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: {
                    ok: { sv: "Hej <b>{name}</b>", en: "Hi <b>{name}</b>" },
                },
            })
        ).not.toThrow();
    });
});

describe("configuration errors", () => {
    it("rejects a duplicate plugin tag", () => {
        expect(() =>
            createTolka({
                locales: ["sv"] as const,
                defaultLocale: "sv",
                plugins: [tonePlugin, tonePlugin] as const,
            })
        ).toThrow(/duplicate plugin tag/);
    });
});

describe("formatMessage", () => {
    it("formats a message that came from no dictionary", () => {
        const tolka = setup(() => {});
        expect(
            tolka.formatMessage(
                "{n, plural, one {# fil} other {# filer}}",
                "sv",
                {
                    n: 4,
                }
            )
        ).toBe("4 filer");
    });

    it("accepts a message with no arguments", () => {
        const tolka = setup(() => {});
        expect(tolka.formatMessage("Spara", "sv")).toBe("Spara");
    });

    it("falls back to the raw message and reports when formatting throws", () => {
        const onError = vi.fn();
        const tolka = setup(onError);
        expect(tolka.formatMessage("{n, plural one {x} other {y}}", "sv")).toBe(
            "{n, plural one {x} other {y}}"
        );
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[1]).toMatchObject({
            key: "<formatMessage>",
        });
    });
});

describe("degraded paths", () => {
    it("falls back to the default locale when a locale's leaf is missing", () => {
        const tolka = setup(() => {});
        const dictionary = tolka.createDictionary({
            content: { save: { sv: "Spara", en: "Save" } },
        });
        // A locale absent from the content, reachable when a locale is added
        // to the config before every dictionary has caught up.
        const partial = { content: { save: { sv: "Spara" } } } as never;
        const { content } = tolka.resolveDictionary(partial, {
            locale: "en",
            state: { tone: "casual" },
        });
        expect(content["save"]).toBe("Spara");
        void dictionary;
    });

    it("reports a key absent from every locale instead of rendering nothing", () => {
        const onError = vi.fn();
        const tolka = setup(onError);
        const empty = { content: { save: {} } } as never;
        const { content } = tolka.resolveDictionary(empty, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(content["save"]).toBe("");
        expect(onError).toHaveBeenCalled();
        expect(String(onError.mock.calls[0]?.[0])).toMatch(
            /no content for key "save"/
        );
    });

    it("reports a tag with no registered plugin and uses its default state", () => {
        const onError = vi.fn();
        const tolka = createTolka({
            locales: ["sv"] as const,
            defaultLocale: "sv",
            plugins: [] as const,
            onError,
        });
        const foreign = {
            content: {
                title: {
                    sv: { __tag: "tone", states: { default: "Filer" } },
                },
            },
        } as never;
        const { content } = tolka.resolveDictionary(foreign, {
            locale: "sv",
            state: {},
        });
        expect(content["title"]).toBe("Filer");
        expect(onError).toHaveBeenCalled();
        expect(String(onError.mock.calls[0]?.[0])).toMatch(
            /no plugin registered/
        );
    });

    it("renders empty when an unregistered tag has no default state", () => {
        const onError = vi.fn();
        const tolka = createTolka({
            locales: ["sv"] as const,
            defaultLocale: "sv",
            plugins: [] as const,
            onError,
        });
        const foreign = {
            content: { title: { sv: { __tag: "tone", states: {} } } },
        } as never;
        const { content } = tolka.resolveDictionary(foreign, {
            locale: "sv",
            state: {},
        });
        expect(content["title"]).toBe("");
        expect(onError).toHaveBeenCalled();
    });

    it("hands out the raw string when the reference message is malformed", () => {
        const onError = vi.fn();
        const tolka = setup(onError);
        const broken = {
            content: { bad: { sv: "{n, plural one {x} other {y}}", en: "ok" } },
        } as never;
        const { content } = tolka.resolveDictionary(broken, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(content["bad"]).toBe("{n, plural one {x} other {y}}");
        expect(onError).toHaveBeenCalled();
    });

    it("logs to the console when no onError is configured", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const tolka = createTolka({
            locales: ["sv"] as const,
            defaultLocale: "sv",
            plugins: [] as const,
        });
        const dictionary = tolka.createDictionary({
            content: { greeting: { sv: "Hej {name}" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: {},
        });
        call(content["greeting"], {});
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0]?.[0]).toMatch(/^\[tolka\] greeting \(sv\)/);
        spy.mockRestore();
    });
});

describe("a plugin that declares a default axis value", () => {
    it("makes its state key optional at the provider", () => {
        const optional = definePlugin({
            tag: "tone",
            resolve: (value: Tagged<"tone">, axis: Tone) =>
                value.states[axis] ?? value.states["default"] ?? "",
            defaultAxisValue: "formal" satisfies Tone,
        });
        const tolka = createTolka({
            locales: ["sv"] as const,
            defaultLocale: "sv",
            plugins: [optional] as const,
            onError: () => {},
        });
        const dictionary = tolka.createDictionary({
            content: {
                title: {
                    sv: {
                        __tag: "tone",
                        states: { default: "Filer", formal: "Dokument" },
                    },
                },
            },
        });
        // Declaring a default makes the key optional at the provider, so an
        // empty state compiles with no help.
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: {},
        });
        expect(content["title"]).toBe("Dokument");
    });
});

describe("the consistency check in production", () => {
    it("warns instead of throwing, so a copy typo cannot crash the app", () => {
        vi.stubEnv("NODE_ENV", "production");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: { greeting: { sv: "Hej {name}", en: "Hello" } },
            })
        ).not.toThrow();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toMatch(/inconsistent dictionary/);
        warn.mockRestore();
        vi.unstubAllEnvs();
    });
});

function pseudo(message: string): string {
    return `⟦${message}⟧`;
}

describe("the postResolve seam", () => {
    function withPostResolve(postResolve: PostResolve) {
        return createTolka({
            locales: ["sv", "en"] as const,
            defaultLocale: "sv",
            plugins: [tonePlugin] as const,
            onError: () => {},
            postResolve,
        });
    }

    it("decorates a plain string", () => {
        const tolka = withPostResolve(pseudo);
        const dictionary = tolka.createDictionary({
            content: { save: { sv: "Spara", en: "Save" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(content.save).toBe("⟦Spara⟧");
    });

    it("survives into formatted output, because it runs before ICU", () => {
        const tolka = withPostResolve(pseudo);
        const dictionary = tolka.createDictionary({
            content: {
                count: {
                    sv: "{n, plural, one {# fil} other {# filer}}",
                    en: "{n, plural, one {# file} other {# files}}",
                },
            },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(call(content.count, { n: 4 })).toBe("⟦4 filer⟧");
    });

    it("cannot flip a key between string and formatter", () => {
        // A decoration that would itself parse as a placeholder. If the
        // reference message were decorated, `plain` would acquire an argument
        // and become a formatter. The reference is deliberately left alone, so
        // the shape the types promise cannot move underneath them.
        const tolka = withPostResolve((message) => `${message} {marker}`);
        const dictionary = tolka.createDictionary({
            content: {
                plain: { sv: "Spara", en: "Save" },
                formatted: { sv: "Hej {name}", en: "Hi {name}" },
            },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(typeof content.plain).toBe("string");
        expect(typeof content.formatted).toBe("function");
    });

    it("is told the key, the locale and the dictionary source", () => {
        const seen: ResolveInfo[] = [];
        const tolka = withPostResolve((message, info) => {
            seen.push(info);
            return message;
        });
        const dictionary = tolka.createDictionary({
            content: { save: { sv: "Spara", en: "Save" } },
            meta: { source: "example.dictionary.ts" },
        });
        tolka.resolveDictionary(dictionary, {
            locale: "en",
            state: { tone: "casual" },
        });
        expect(seen).toEqual([
            { key: "save", locale: "en", source: "example.dictionary.ts" },
        ]);
    });

    it("omits the source when no transform supplied one", () => {
        const seen: ResolveInfo[] = [];
        const tolka = withPostResolve((message, info) => {
            seen.push(info);
            return message;
        });
        const dictionary = tolka.createDictionary({
            content: { save: { sv: "Spara", en: "Save" } },
        });
        tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(seen[0]).not.toHaveProperty("source");
    });

    it("applies to formatMessage too", () => {
        const tolka = withPostResolve(pseudo);
        expect(tolka.formatMessage("Spara", "sv")).toBe("⟦Spara⟧");
    });

    it("leaves everything untouched when not configured", () => {
        const tolka = setup(() => {});
        const dictionary = tolka.createDictionary({
            content: { save: { sv: "Spara", en: "Save" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "sv",
            state: { tone: "casual" },
        });
        expect(content.save).toBe("Spara");
    });
});

describe("dictionary metadata", () => {
    it("names the source in consistency findings when a transform supplied it", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: { greeting: { sv: "Hej {name}", en: "Hello" } },
                meta: { source: "example.dictionary.ts" },
            })
        ).toThrow(/example\.dictionary\.ts:greeting/);
    });

    it("omits the prefix when there is none", () => {
        const tolka = setup(() => {});
        expect(() =>
            tolka.createDictionary({
                content: { greeting: { sv: "Hej {name}", en: "Hello" } },
            })
        ).toThrow(/^(?!.*:greeting)[\s\S]*greeting \[placeholder-drift\]/);
    });
});

describe("optional locales", () => {
    const tolka = createTolka({
        locales: [
            defineLocale("sv"),
            defineLocale("en"),
            defineLocale("nb", { optional: true }),
        ] as const,
        defaultLocale: "sv",
        plugins: [] as const,
        onError: () => {},
    });

    it("exposes plain codes and the optional subset", () => {
        expect(tolka.locales).toEqual(["sv", "en", "nb"]);
        expect(tolka.optionalLocales).toEqual(["nb"]);
    });

    it("treats a bare code as required", () => {
        const plain = createTolka({
            locales: ["sv", "en"] as const,
            defaultLocale: "sv",
            plugins: [] as const,
        });
        expect(plain.locales).toEqual(["sv", "en"]);
        expect(plain.optionalLocales).toEqual([]);
    });

    it("falls back one hop to the default locale when an optional one is absent", () => {
        const dictionary = tolka.createDictionary({
            content: { title: { sv: "Filer", en: "Files" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "nb",
            state: {},
        });
        expect(content.title).toBe("Filer");
    });

    it("uses the optional locale's own copy once it exists", () => {
        const dictionary = tolka.createDictionary({
            content: { title: { sv: "Filer", en: "Files", nb: "Filer" } },
        });
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "nb",
            state: {},
        });
        expect(content.title).toBe("Filer");
    });

    it("still checks an optional locale that is present", () => {
        // Optional means "may be absent", never "may be sloppy".
        expect(() =>
            tolka.createDictionary({
                content: {
                    greeting: { sv: "Hej {name}", en: "Hi {name}", nb: "Hei" },
                },
            })
        ).toThrow(/placeholder-drift/);
    });

    it("refuses a locale the config never declared", () => {
        expect(() =>
            tolka.createDictionary({
                content: {
                    title: { sv: "Filer", en: "Files", de: "Dateien" },
                },
            })
        ).toThrow(/"de" is not a declared locale/);
    });
});

describe("two independent counts in one message", () => {
    // The shape that cannot be expressed without nesting: each count selects
    // its own plural branch, and a single `count` argument could not drive both.
    const tolka = createTolka({
        locales: ["en", "fr"] as const,
        defaultLocale: "en",
        plugins: [] as const,
        onError: () => {},
    });
    const dictionary = tolka.createDictionary({
        content: {
            summary: {
                en: "{boxes, plural, =1 {1 box} other {# boxes}} holding {apples, plural, =1 {1 apple} other {# apples}}.",
                fr: "{boxes, plural, =1 {1 boîte} other {# boîtes}} contenant {apples, plural, =1 {1 pomme} other {# pommes}}.",
            },
        },
    });

    it.each([
        [1, 1, "1 box holding 1 apple."],
        [1, 7, "1 box holding 7 apples."],
        [3, 1, "3 boxes holding 1 apple."],
        [3, 7, "3 boxes holding 7 apples."],
    ])(
        "varies each count independently (%i boxes, %i apples)",
        (boxes, apples, expected) => {
            const { content } = tolka.resolveDictionary(dictionary, {
                locale: "en",
                state: {},
            });
            expect(call(content.summary, { boxes, apples })).toBe(expected);
        }
    );

    it("lets another locale place its own forms", () => {
        const { content } = tolka.resolveDictionary(dictionary, {
            locale: "fr",
            state: {},
        });
        expect(call(content.summary, { boxes: 3, apples: 1 })).toBe(
            "3 boîtes contenant 1 pomme."
        );
    });
});
