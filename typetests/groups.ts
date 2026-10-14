import type { Tagged } from "../src/index.js";

/**
 * A group maps a closed union to copy and keeps the totality the flat
 * `prefix${value}` key pattern bought: a branch the union has but the
 * dictionary lacks must not compile.
 */
import { createTolka, definePlugin } from "../src/index.js";

const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, axis: string) =>
        value.states[axis] ?? value.states.default,
});

const tolka = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
});

const dictionary = tolka.createDictionary({
    content: {
        save: { sv: "Spara", en: "Save" },
        sectionType: {
            Program: { sv: "Programgemensam", en: "Programme specific" },
            Orientation: { sv: "Inriktningsgemensam", en: "Orientation" },
        },
        // Depth is not capped: the two-level case reads without a second
        // flattening into `errorCodes${code}Title`.
        errorCodes: {
            NotFound: {
                title: { sv: "Hittades inte", en: "Not found" },
                description: { sv: "Finns inte", en: "Does not exist" },
            },
        },
        // A branch named after a locale stays a group: its value is a record,
        // never a Leaf, which is what the discriminator reads.
        byLocaleName: {
            sv: { sv: "Svenska", en: "Swedish" },
            en: { sv: "Engelska", en: "English" },
        },
        withCount: {
            Program: {
                sv: "{count, plural, =1 {1 kurs} other {# kurser}}",
                en: "{count, plural, =1 {1 course} other {# courses}}",
            },
        },
    },
});

const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "formal" },
});

declare const covered: "Program" | "Orientation";
declare const uncovered: "Program" | "Orientation" | "Individual";

// A flat key keeps resolving as before.
const save: string = content.save;

// Every branch of the union has copy, so the dynamic read is allowed.
const sectionType: string = content.sectionType[covered];

// @ts-expect-error `Individual` has no branch in the dictionary
void content.sectionType[uncovered];

// Two levels resolve the same way.
const title: string = content.errorCodes.NotFound.title;

// A locale-named branch is still a group, not copy.
const byLocaleName: string = content.byLocaleName.sv;

// Params are derived inside a group exactly as at the top level.
const withCount: string = content.withCount.Program({ count: 2 });

// @ts-expect-error `count` is a number argument
void content.withCount.Program({ count: "2" });

// @ts-expect-error a group is not itself copy
const group: string = content.sectionType;

void save;
void sectionType;
void title;
void byLocaleName;
void withCount;
void group;
