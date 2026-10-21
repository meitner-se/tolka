import type { ExtendsCollision, ExtendsGuard, Tagged } from "../src/index.js";

/**
 * `extends` is the sanctioned form of what the `static-content` rule blocks
 * authors doing by hand. The product is the type: one resolution hands back
 * every key the component reads, a collision never compiles, and an extended
 * dictionary's plugin tags are part of what the config has to register.
 */
import { createTolka, definePlugin } from "../src/index.js";
import { createReactBindings } from "../src/react.js";

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

const plain = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [] as const,
});

// ---- the acceptance shape: a helper's copy, split small (INF-10424)

const userCategoryLabels = tolka.createDictionary({
    content: {
        categoryStudent: { sv: "Elev", en: "Student" },
        categoryEmployee: { sv: "Personal", en: "Employee" },
        categoryGuardian: { sv: "Vårdnadshavare", en: "Guardian" },
    },
});

const userCountLabels = tolka.createDictionary({
    content: {
        userCount: {
            sv: "{count, plural, one {# användare} other {# användare}}",
            en: "{count, plural, one {# user} other {# users}}",
        },
    },
});

const useUserDropdownDictionary = tolka.createDictionary({
    extends: [userCategoryLabels, userCountLabels],
    content: {
        placeholder: { sv: "Välj användare", en: "Pick a user" },
        empty: { sv: "Inga träffar", en: "No matches" },
    },
});

const { useDictionary } = createReactBindings(tolka);

function UserDropdown(): null {
    // One resolution, no aliased content binding: the component reads the
    // helper's keys and its own off the same object.
    const { content } = useDictionary(useUserDropdownDictionary);

    const own: string = content.placeholder;
    const extended: string = content.categoryStudent;
    const counted: string = content.userCount({ count: 3 });

    // @ts-expect-error `count` is a number argument, inside extends as out
    void content.userCount({ count: "3" });

    // @ts-expect-error nothing brought this key into the resolution
    void content.categoryUnknown;

    void own;
    void extended;
    void counted;
    return null;
}
void UserDropdown;

// ---- transitivity: an extended dictionary's own extends come along

const base = tolka.createDictionary({
    content: { fromBase: { sv: "Bas", en: "Base" } },
});

const middle = tolka.createDictionary({
    extends: [base],
    content: { fromMiddle: { sv: "Mellan", en: "Middle" } },
});

const leaf = tolka.createDictionary({
    extends: [middle],
    content: { fromLeaf: { sv: "Löv", en: "Leaf" } },
});

const transitive = tolka.resolveDictionary(leaf, {
    locale: "sv",
    state: { tone: "default" },
}).content;

const viaBase: string = transitive.fromBase;
const viaMiddle: string = transitive.fromMiddle;
const viaLeaf: string = transitive.fromLeaf;
void viaBase;
void viaMiddle;
void viaLeaf;

// ---- a collision is a compile error, and it names both sides

// @ts-expect-error `categoryStudent` is already defined by extends[0]
tolka.createDictionary({
    extends: [userCategoryLabels],
    content: {
        categoryStudent: { sv: "Elev", en: "Student" },
    },
});

// @ts-expect-error both extended dictionaries define `fromBase`
tolka.createDictionary({
    extends: [base, middle],
    content: { own: { sv: "Egen", en: "Own" } },
});

/**
 * The message itself, pinned: `@ts-expect-error` proves only that something
 * failed, and a collision that compiled to a vague error would be the failure
 * this rule exists to make legible.
 */
type OwnCollision = ExtendsGuard<
    { categoryStudent: Record<"sv" | "en", string> },
    readonly [typeof userCategoryLabels]
>;
const ownCollision: OwnCollision = {
    __tolkaError:
        "extends: two dictionaries define the same key, so which copy a component gets would be a coin toss. Rename the key, or drop one of them.",
    collision: '"categoryStudent" is defined by both content and extends[0]',
};
void ownCollision;

type BetweenCollision = ExtendsGuard<
    { own: Record<"sv" | "en", string> },
    readonly [typeof base, typeof middle]
>;
const betweenCollision: BetweenCollision = {
    __tolkaError:
        "extends: two dictionaries define the same key, so which copy a component gets would be a coin toss. Rename the key, or drop one of them.",
    collision: '"fromBase" is defined by both extends[0] and extends[1]',
};
void betweenCollision;

// A dictionary with nothing to collide with is accepted unchanged.
const noCollision: ExtendsGuard<
    { own: Record<"sv" | "en", string> },
    readonly [typeof base]
> = "anything goes, the guard is `unknown`";
void noCollision;

// The guard is the only thing that can satisfy itself, which is what makes a
// collision unignorable rather than merely noisy.
const spelled: ExtendsCollision<"x"> = {
    __tolkaError:
        "extends: two dictionaries define the same key, so which copy a component gets would be a coin toss. Rename the key, or drop one of them.",
    collision: "x",
};
void spelled;

// ---- tags union into the capability check

const tagged = tolka.createDictionary({
    content: {
        greeting: {
            sv: tonePlugin.create({ default: "Hej", formal: "God dag" }),
            en: "Hello",
        },
    },
});

const extendsTagged = tolka.createDictionary({
    extends: [tagged],
    content: { untagged: { sv: "Rent", en: "Plain" } },
});

// Its own content uses no tag, but the copy it resolves does.
// @ts-expect-error this config registers no `tone` plugin
plain.resolveDictionary(extendsTagged, { locale: "sv", state: {} });

tolka.resolveDictionary(extendsTagged, {
    locale: "sv",
    state: { tone: "formal" },
});

// ---- a dictionary built for other locales is not extendable here

const swedishOnly = createTolka({
    locales: ["sv"] as const,
    defaultLocale: "sv",
    plugins: [] as const,
}).createDictionary({ content: { only: { sv: "Bara svenska" } } });

tolka.createDictionary({
    // @ts-expect-error `only` has no `en`, which this config requires
    extends: [swedishOnly],
    content: { own: { sv: "Egen", en: "Own" } },
});
