/**
 * Optional locales at the type level: required locales are required keys,
 * optional ones may be absent, and the default locale must itself be required.
 */
import { createTolka, defineLocale } from "../src/index.js";

const tolka = createTolka({
    locales: [
        defineLocale("sv"),
        defineLocale("en"),
        defineLocale("nb", { optional: true }),
    ] as const,
    defaultLocale: "sv",
    plugins: [] as const,
});

// Required locales must be present; the optional one may be omitted.
tolka.createDictionary({
    content: { title: { sv: "Filer", en: "Files" } },
});
tolka.createDictionary({
    content: { title: { sv: "Filer", en: "Files", nb: "Filer" } },
});

tolka.createDictionary({
    // @ts-expect-error `en` is required and missing
    content: { title: { sv: "Filer" } },
});

// An undeclared locale key is NOT a type error: excess properties go
// unchecked in this generic constraint position. The consistency checker
// reports it as `unknown-locale` instead, which throws in dev.
tolka.createDictionary({
    content: { title: { sv: "Filer", en: "Files" } },
});

// The default locale must be a required one, never an optional one.
createTolka({
    locales: [
        defineLocale("sv"),
        defineLocale("nb", { optional: true }),
    ] as const,
    // @ts-expect-error `nb` is optional, so it cannot be the fallback target
    defaultLocale: "nb",
    plugins: [] as const,
});

// An optional locale is still a valid locale to resolve in.
const dictionary = tolka.createDictionary({
    content: { title: { sv: "Filer", en: "Files" } },
});
tolka.resolveDictionary(dictionary, { locale: "nb", state: {} });

// The shorthand form means every locale is required.
const plain = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [] as const,
});
plain.createDictionary({ content: { save: { sv: "Spara", en: "Save" } } });
plain.createDictionary({
    // @ts-expect-error `en` is required under the shorthand form
    content: { save: { sv: "Spara" } },
});

// `locales` stays a plain code array, so the documented derivation still works.
type Locale = (typeof tolka)["locales"][number];
const locale: Locale = "nb";
void locale;
// @ts-expect-error not a declared locale
const wrong: Locale = "de";
void wrong;
