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
