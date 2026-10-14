import { describe, expect, it } from "vitest";

import { checkDictionary, formatFindings, localeCoverage } from "./check.js";

const kinds = (findings: { kind: string }[]) =>
    findings.map((finding) => finding.kind).sort();

describe("the consistency checker", () => {
    it("is silent on a consistent dictionary", () => {
        expect(
            kinds(
                checkDictionary(
                    {
                        ok: { sv: "Hej {name}", en: "Hi {name}" },
                        tagged: { sv: "Se <b>{n}</b>", en: "See <b>{n}</b>" },
                    },
                    "sv"
                )
            )
        ).toEqual([]);
    });

    it("reports a placeholder a translation dropped", () => {
        expect(
            kinds(
                checkDictionary(
                    { bad: { sv: "Hej {name}", en: "Hello" } },
                    "sv"
                )
            )
        ).toEqual(["placeholder-drift"]);
    });

    it("reports a tag a translation dropped", () => {
        expect(
            kinds(
                checkDictionary(
                    { bad: { sv: "Se <b>x</b>", en: "See x" } },
                    "sv"
                )
            )
        ).toEqual(["tag-drift"]);
    });

    it("sees drift inside a plural branch", () => {
        const findings = checkDictionary(
            {
                bad: {
                    sv: "{n, plural, one {# av {total}} other {# av {total}}}",
                    en: "{n, plural, one {# of many} other {# of many}}",
                },
            },
            "sv"
        );
        expect(kinds(findings)).toEqual(["placeholder-drift"]);
    });

    it("sees drift between a plugin's own states, naming the state", () => {
        const findings = checkDictionary(
            {
                bad: {
                    sv: {
                        __tag: "tone",
                        states: { default: "{n} filer", formal: "dokument" },
                    },
                    en: "{n} files",
                },
            },
            "sv"
        );
        expect(kinds(findings)).toEqual(["placeholder-drift"]);
        expect(findings[0]?.detail).toBe(
            "sv/formal vs sv/default: missing {n}"
        );
    });

    it("reports a self-closing tag per locale", () => {
        expect(
            kinds(
                checkDictionary(
                    { bad: { sv: "Antal: <Value />", en: "Count: <Value />" } },
                    "sv"
                )
            )
        ).toEqual(["self-closing", "self-closing"]);
    });

    it("reports malformed ICU rather than throwing", () => {
        const findings = checkDictionary(
            { bad: { sv: "{n, plural one {x} other {y}}", en: "ok" } },
            "sv"
        );
        expect(kinds(findings)).toEqual(["unparseable"]);
        expect(findings[0]?.detail).toMatch(/^sv: /);
    });

    it("carries a source when the caller knows one", () => {
        const findings = checkDictionary(
            { bad: { sv: "Hej {name}", en: "Hello" } },
            "sv",
            "example.dictionary.ts"
        );
        expect(findings[0]?.source).toBe("example.dictionary.ts");
        expect(formatFindings(findings)).toMatch(
            /^example\.dictionary\.ts:bad \[placeholder-drift\]/
        );
    });

    it("skips a key with no content at all", () => {
        expect(kinds(checkDictionary({ empty: {} }, "sv"))).toEqual([]);
    });

    it("omits the prefix when there is no source", () => {
        const findings = checkDictionary(
            { bad: { sv: "Hej {name}", en: "Hello" } },
            "sv"
        );
        expect(formatFindings(findings)).toMatch(/^bad \[placeholder-drift\]/);
    });
});

describe("undeclared locale keys", () => {
    it("reports a locale the config never declared", () => {
        const findings = checkDictionary(
            { title: { sv: "Filer", en: "Files", de: "Dateien" } },
            "sv",
            undefined,
            ["sv", "en"]
        );
        expect(kinds(findings)).toEqual(["unknown-locale"]);
        expect(findings[0]?.detail).toBe('"de" is not a declared locale');
    });

    it("says nothing when the caller declares no locale list", () => {
        expect(
            kinds(
                checkDictionary({ title: { sv: "Filer", de: "Dateien" } }, "sv")
            )
        ).toEqual([]);
    });
});

describe("locale coverage", () => {
    const content = {
        a: { sv: "a", en: "a", nb: "a" },
        b: { sv: "b", en: "b" },
        c: { sv: "c" },
    };

    it("counts how much of a dictionary each locale covers", () => {
        expect(localeCoverage(content, ["sv", "en", "nb"])).toEqual({
            sv: { present: 3, total: 3, ratio: 1 },
            en: { present: 2, total: 3, ratio: 2 / 3 },
            nb: { present: 1, total: 3, ratio: 1 / 3 },
        });
    });

    it("reports a locale with no content at all", () => {
        expect(localeCoverage(content, ["de"])).toEqual({
            de: { present: 0, total: 3, ratio: 0 },
        });
    });

    it("treats an empty dictionary as fully covered", () => {
        expect(localeCoverage({}, ["sv"])).toEqual({
            sv: { present: 0, total: 0, ratio: 1 },
        });
    });
});

describe("groups", () => {
    it("checks a branch and names it by path", () => {
        const findings = checkDictionary(
            {
                sectionType: {
                    // `{name}` in sv, `{title}` in en -- the drift the
                    // derived param types rest on not happening.
                    Program: { sv: "Programmet {name}", en: "The {title}" },
                },
            },
            "sv"
        );

        expect(kinds(findings)).toEqual(["placeholder-drift"]);
        expect(findings[0]?.key).toBe("sectionType.Program");
    });

    it("checks to any depth", () => {
        const findings = checkDictionary(
            { errorCodes: { NotFound: { title: { sv: "{a}", en: "{b}" } } } },
            "sv"
        );

        expect(findings[0]?.key).toBe("errorCodes.NotFound.title");
    });

    it("is silent on a consistent group", () => {
        expect(
            kinds(
                checkDictionary(
                    {
                        save: { sv: "Spara", en: "Save" },
                        sectionType: {
                            Program: { sv: "Program", en: "Programme" },
                        },
                    },
                    "sv"
                )
            )
        ).toEqual([]);
    });

    it("reads an undeclared locale inside a group", () => {
        const findings = checkDictionary(
            { group: { branch: { sv: "Hej", eng: "Hi" } } },
            "sv",
            undefined,
            ["sv", "en"]
        );

        expect(kinds(findings)).toContain("unknown-locale");
        expect(findings[0]?.key).toBe("group.branch");
    });

    it("counts branches, not groups, towards coverage", () => {
        const coverage = localeCoverage(
            {
                save: { sv: "Spara", en: "Save" },
                sectionType: {
                    Program: { sv: "Program", en: "Programme" },
                    Orientation: { sv: "Inriktning" },
                },
            },
            ["sv", "en"]
        );

        // Three keys carry copy; the group itself is not one of them.
        expect(coverage["sv"]?.total).toBe(3);
        expect(coverage["en"]?.present).toBe(2);
    });
});
