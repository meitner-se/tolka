import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { rules } from "./index.js";

const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("static-content", () => {
    it("accepts literals and plugin calls, rejects anything that must be run", () => {
        ruleTester.run("static-content", rules["static-content"], {
            valid: [
                {
                    code: `tolka.createDictionary({ content: { a: { sv: "Hej", en: "Hi" } } });`,
                },
                {
                    // A plugin call: one object literal, string values.
                    code: `tolka.createDictionary({ content: { a: { sv: schoolType({ default: "Elever", Preschool: "Barn" }) } } });`,
                },
                {
                    // A template with no interpolation is a literal in other quotes.
                    code: "tolka.createDictionary({ content: { a: { sv: `Hej` } } });",
                },
                {
                    // Untouched: not a dictionary.
                    code: `somethingElse({ content: { a: { sv: other.thing } } });`,
                },
                {
                    code: `createDictionary({ content: { a: { sv: "Hej" } } });`,
                },
            ],
            invalid: [
                {
                    // The one everyone reaches for first.
                    code: `tolka.createDictionary({ content: { ...common.content, a: { sv: "Hej" } } });`,
                    errors: [{ messageId: "spread" }],
                },
                {
                    code: `tolka.createDictionary({ content: { a: { ...shared, sv: "Hej" } } });`,
                    errors: [{ messageId: "spread" }],
                },
                {
                    // oxlint-disable-next-line no-template-curly-in-string -- the placeholder is the fixture
                    code: "tolka.createDictionary({ content: { a: { sv: `${count} filer` } } });",
                    errors: [{ messageId: "computed" }],
                },
                {
                    code: `tolka.createDictionary({ content: { a: { sv: common.title } } });`,
                    errors: [{ messageId: "computed" }],
                },
                {
                    code: `tolka.createDictionary({ content: { a: { sv: "a" + "b" } } });`,
                    errors: [{ messageId: "computed" }],
                },
                {
                    code: `tolka.createDictionary({ content: { a: { sv: isX ? "a" : "b" } } });`,
                    errors: [{ messageId: "computed" }],
                },
                {
                    // A call whose argument is not a flat object of strings is
                    // not a plugin helper — it has to be executed to know.
                    code: `tolka.createDictionary({ content: { a: { sv: build(other) } } });`,
                    errors: [{ messageId: "computed" }],
                },
            ],
        });
    });
});

describe("static-content, a string however it is quoted", () => {
    it("treats a plain template the same wherever it appears", () => {
        ruleTester.run("static-content", rules["static-content"], {
            valid: [
                {
                    code: "tolka.createDictionary({ content: { a: { sv: tone({ default: `Hej` }) } } });",
                },
            ],
            invalid: [
                {
                    // An interpolation has to run, in either position.
                    // oxlint-disable-next-line no-template-curly-in-string -- the placeholder is the fixture
                    code: "tolka.createDictionary({ content: { a: { sv: tone({ default: `${x}` }) } } });",
                    errors: [{ messageId: "computed" }],
                },
            ],
        });
    });
});

describe("content-depth", () => {
    it("allows the shapes the migration needs and flags a namespace tree", () => {
        ruleTester.run("content-depth", rules["content-depth"], {
            valid: [
                {
                    // Flat: no groups at all.
                    code: `tolka.createDictionary({ content: { a: { sv: "Hej", en: "Hi" } } });`,
                },
                {
                    // One group -- the union lookup this exists for.
                    code: `tolka.createDictionary({ content: { sectionType: { Program: { sv: "P", en: "P" } } } });`,
                },
                {
                    // Two -- errorCodes[code].title.
                    code: `tolka.createDictionary({ content: { errorCodes: { NotFound: { title: { sv: "H", en: "N" } } } } });`,
                },
                {
                    // A plugin call is a locale map's value, never a group.
                    code: `tolka.createDictionary({ content: { a: { sv: schoolType({ default: "Elever", Preschool: "Barn" }) } } });`,
                },
                {
                    code: `tolka.createDictionary({ content: { a: { b: { c: { d: { sv: "x" } } } } } });`,
                    options: [{ max: 3 }],
                },
                {
                    // A group whose siblings are not groups: the walk steps
                    // over them rather than counting them as depth.
                    code: `tolka.createDictionary({ content: { group: { branch: { sv: "x" }, stray: "y", ...rest } } });`,
                },
                {
                    // No content object at all.
                    code: `tolka.createDictionary({});`,
                },
            ],
            invalid: [
                {
                    code: `tolka.createDictionary({ content: { page: { section: { header: { title: { sv: "x", en: "y" } } } } } });`,
                    errors: [{ messageId: "tooDeep" }],
                },
                {
                    code: `tolka.createDictionary({ content: { a: { b: { sv: "x", en: "y" } } } });`,
                    options: [{ max: 0 }],
                    errors: [{ messageId: "tooDeep" }],
                },
            ],
        });
    });
});

describe("extends is a sibling of content, so neither rule sees it", () => {
    it("leaves the extends array alone", () => {
        // `extends` is the sanctioned form of what `static-content` blocks
        // authors doing by hand. Both rules read the `content` object and
        // nothing else, which is what lets the identifiers in `extends` be
        // identifiers.
        ruleTester.run("static-content", rules["static-content"], {
            valid: [
                {
                    code: `tolka.createDictionary({ extends: [userCategoryLabels], content: { a: { sv: "Hej", en: "Hi" } } });`,
                },
                {
                    code: `tolka.createDictionary({ extends: [...shared], content: { a: { sv: "Hej" } } });`,
                },
            ],
            invalid: [
                {
                    // The content object is still guarded, extends or not.
                    code: `tolka.createDictionary({ extends: [labels], content: { ...common.content, a: { sv: "Hej" } } });`,
                    errors: [{ messageId: "spread" }],
                },
            ],
        });

        ruleTester.run("content-depth", rules["content-depth"], {
            valid: [
                {
                    code: `tolka.createDictionary({ extends: [a, b], content: { g: { h: { sv: "Hej" } } } });`,
                },
            ],
            invalid: [],
        });
    });
});
