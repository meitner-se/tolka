import { describe, expect, it } from "vitest";

import type { Rule } from "./check.js";

import { runConsistencyChecks } from "./testing.js";

const config = { locales: ["sv", "en", "nb"] as const, defaultLocale: "sv" };

const clean = {
    content: {
        save: { sv: "Spara", en: "Save", nb: "Lagre" },
        greet: { sv: "Hej {name}", en: "Hi {name}", nb: "Hei {name}" },
    },
};

describe("runConsistencyChecks", () => {
    it("is silent on a clean corpus and reports full coverage", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": clean,
        });
        expect(report.findings).toEqual([]);
        expect(report.coverage["sv"]?.ratio).toBe(1);
        expect(report.coverage["nb"]?.ratio).toBe(1);
    });

    it("names the module path as the source of a finding", () => {
        const report = runConsistencyChecks(config, {
            "./example.dictionary.ts": {
                content: {
                    greet: { sv: "Hej {name}", en: "Hello", nb: "Hei {name}" },
                },
            },
        });
        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]).toMatchObject({
            source: "./example.dictionary.ts",
            key: "greet",
            kind: "placeholder-drift",
        });
        expect(report.summary).toMatch(/^\.\/example\.dictionary\.ts:greet/);
    });

    it("accepts a default export, which is what import.meta.glob hands back", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": { default: clean },
        });
        expect(report.findings).toEqual([]);
    });

    it("prefers an injected meta.source over the glob key", () => {
        const report = runConsistencyChecks(config, {
            "./glob/path.content.ts": {
                content: {
                    greet: { sv: "Hej {name}", en: "Hello", nb: "Hei" },
                },
                meta: { source: "injected/by/transform.ts" },
            },
        });
        expect(report.findings[0]?.source).toBe("injected/by/transform.ts");
    });

    it("reports a module exporting no dictionary instead of throwing", () => {
        const report = runConsistencyChecks(config, {
            "./broken.ts": { nope: 1 },
        });
        expect(report.findings).toEqual([
            {
                key: "<module>",
                source: "./broken.ts",
                kind: "unparseable",
                detail: "module exports no dictionary",
            },
        ]);
    });

    it("aggregates coverage across modules so a rollout is one number", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": {
                content: { one: { sv: "a", en: "a", nb: "a" } },
            },
            "./b.content.ts": { content: { two: { sv: "b", en: "b" } } },
            "./c.content.ts": { content: { three: { sv: "c", en: "c" } } },
        });
        expect(report.coverage["sv"]).toEqual({
            present: 3,
            total: 3,
            ratio: 1,
        });
        expect(report.coverage["nb"]).toEqual({
            present: 1,
            total: 3,
            ratio: 1 / 3,
        });
    });

    it("keys coverage per module, so identical key names do not collide", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": {
                content: { save: { sv: "a", en: "a", nb: "a" } },
            },
            "./b.content.ts": { content: { save: { sv: "b", en: "b" } } },
        });
        expect(report.coverage["sv"]?.total).toBe(2);
    });
});

describe("rules", () => {
    const typography: Rule = {
        name: "typography",
        check: ({ key, source, variants }) =>
            variants
                .filter(
                    (variant) =>
                        variant.locale === "de" && variant.message.includes('"')
                )
                .map((variant) => ({
                    source,
                    key,
                    kind: "unparseable" as const,
                    detail: `${variant.locale}: use „ and “ rather than "`,
                })),
    };

    it("runs over every variant and can see the source locale", () => {
        const seen: string[] = [];
        const spy: Rule = {
            name: "spy",
            check: ({ key, variants }) => {
                seen.push(
                    `${key}:${variants.map((variant) => variant.locale + (variant.state ? `/${variant.state}` : "")).join(",")}`
                );
                return [];
            },
        };
        runConsistencyChecks(
            { locales: ["sv", "de"] as const, defaultLocale: "sv" },
            {
                "./a.content.ts": {
                    content: {
                        title: {
                            sv: {
                                __tag: "tone",
                                states: {
                                    default: "Filer",
                                    formal: "Dokument",
                                },
                            },
                            de: "Dateien",
                        },
                    },
                },
            },
            { rules: [spy] }
        );
        expect(seen).toEqual(["title:sv/default,sv/formal,de"]);
    });

    it("reports what a rule finds, alongside the structural findings", () => {
        const report = runConsistencyChecks(
            { locales: ["sv", "de"] as const, defaultLocale: "sv" },
            {
                "./a.content.ts": {
                    content: { quote: { sv: "Hej", de: 'Sagte "nein"' } },
                },
            },
            { rules: [typography] }
        );
        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]?.detail).toMatch(/use „ and “/);
    });
});

describe("how a module may expose its dictionaries", () => {
    it("accepts a named export, which is the common shape", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": { exampleDictionary: clean },
        });
        expect(report.findings).toEqual([]);
    });

    it("checks every dictionary a module exports", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": {
                first: clean,
                second: {
                    content: {
                        greet: { sv: "Hej {name}", en: "Hello", nb: "Hei" },
                    },
                },
            },
        });
        // `en` and `nb` each drop the placeholder the reference carries.
        expect(report.findings).toHaveLength(2);
        expect(
            report.findings.every(
                (finding) => finding.kind === "placeholder-drift"
            )
        ).toBe(true);
    });

    it.each([
        ["null", null],
        ["a string", "not a module"],
        ["a number", 7],
    ])("reports %s rather than throwing", (_label, module) => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": module,
        });
        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]?.detail).toBe("module exports no dictionary");
    });

    it("still ignores non-dictionary exports alongside one", () => {
        const report = runConsistencyChecks(config, {
            "./a.content.ts": { helper: () => "x", value: 1, dict: clean },
        });
        expect(report.findings).toEqual([]);
    });
});

describe("extends and coverage attribution", () => {
    // A key counts once, for the dictionary that defines it. If `extends`
    // contributed to the extending dictionary's coverage too, every app's
    // numeric floor would shift under a refactor that changed no copy.
    const shared = {
        content: {
            categoryStudent: { sv: "Elev", en: "Student", nb: "Elev" },
            categoryStaff: { sv: "Personal", en: "Staff", nb: "Personale" },
        },
    };

    const extending = {
        content: { placeholder: { sv: "Välj", en: "Pick" } },
        extends: [shared],
    };

    it("counts an extended key once, under the dictionary that defines it", () => {
        const report = runConsistencyChecks(config, {
            "./shared.dictionary.ts": shared,
            "./extending.dictionary.ts": extending,
        });

        expect(report.coverage["sv"]).toEqual({
            present: 3,
            total: 3,
            ratio: 1,
        });
        // Two of the three keys have `nb`, and both are the shared ones.
        expect(report.coverage["nb"]).toEqual({
            present: 2,
            total: 3,
            ratio: 2 / 3,
        });
    });

    it("gives the same numbers whether or not the extending dictionary is globbed", () => {
        const withExtender = runConsistencyChecks(config, {
            "./shared.dictionary.ts": shared,
            "./extending.dictionary.ts": extending,
        });
        const asSiblings = runConsistencyChecks(config, {
            "./shared.dictionary.ts": shared,
            "./extending.dictionary.ts": { content: extending.content },
        });

        expect(withExtender.coverage).toEqual(asSiblings.coverage);
    });

    it("reports a finding against the dictionary that defines the key", () => {
        const drifting = {
            content: {
                greet: { sv: "Hej {name}", en: "Hello", nb: "Hei {name}" },
            },
        };
        const report = runConsistencyChecks(config, {
            "./shared.dictionary.ts": drifting,
            "./extending.dictionary.ts": {
                content: { own: { sv: "Egen", en: "Own", nb: "Egen" } },
                extends: [drifting],
            },
        });

        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]).toMatchObject({
            source: "./shared.dictionary.ts",
            key: "greet",
        });
    });
});
