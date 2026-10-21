import type {
    ChainGuard,
    Dictionary,
    ExtendsGuard,
    ExtendsProblem,
    Tagged,
} from "../src/index.js";

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

/** The sentence every unprovable `extends` is branded with. */
const BRAND =
    "extends: this dictionary cannot be resolved as written. `problem` says what is wrong; every check here fails loudly rather than quietly resolving something it could not prove." as const;

const tolka = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
});

/** This file's configs all declare the same locales. */
type Locales = "sv" | "en";

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
    Locales,
    Locales,
    { categoryStudent: Record<"sv" | "en", string> },
    readonly [typeof userCategoryLabels]
>;
const ownCollision: OwnCollision = {
    __tolkaError: BRAND,
    problem:
        '"categoryStudent" is defined by both content and extends[0], so which copy a component gets would be a coin toss -- rename it, or drop one of them',
};
void ownCollision;

type BetweenCollision = ExtendsGuard<
    Locales,
    Locales,
    { own: Record<"sv" | "en", string> },
    readonly [typeof base, typeof middle]
>;
const betweenCollision: BetweenCollision = {
    __tolkaError: BRAND,
    problem:
        '"fromBase" is defined by both extends[0] and extends[1], so which copy a component gets would be a coin toss -- rename it, or drop one of them',
};
void betweenCollision;

// A dictionary with nothing to collide with is accepted unchanged.
const noCollision: ExtendsGuard<
    Locales,
    Locales,
    { own: Record<"sv" | "en", string> },
    readonly [typeof base]
> = "anything goes, the guard is `unknown`";
void noCollision;

// The guard is the only thing that can satisfy itself, which is what makes an
// unprovable `extends` unignorable rather than merely noisy.
const spelled: ExtendsProblem<"x"> = { __tolkaError: BRAND, problem: "x" };
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

// @ts-expect-error `only` has no `en`, which this config requires
tolka.createDictionary({
    extends: [swedishOnly],
    content: { own: { sv: "Egen", en: "Own" } },
});

type ForeignLocales = ChainGuard<
    Locales,
    Locales,
    readonly [typeof swedishOnly]
>;
const foreignLocales: ForeignLocales = {
    __tolkaError: BRAND,
    problem:
        "an extended dictionary's content is not valid for this config's locales -- it was built for a different locale set",
};
void foreignLocales;

// ---- a chain the type cannot read is refused, not resolved anyway
//
// Every capability check here is derived from `Extended`. A hop the walk
// cannot see does not fail the check, it weakens it -- so each of these used
// to compile, and `plain` resolved a dictionary whose copy wanted `tone`.

const hoisted = [tagged];

// @ts-expect-error a hoisted array hides which dictionaries are in it
tolka.createDictionary({
    extends: hoisted,
    content: { own: { sv: "Egen", en: "Own" } },
});

type HoistedProblem = ChainGuard<Locales, Locales, typeof hoisted>;
const hoistedProblem: HoistedProblem = {
    __tolkaError: BRAND,
    problem:
        "`extends` must be an array literal at the call, so the compiler can see which dictionaries are in it -- a hoisted array hides them, and what it hides stops being checked",
};
void hoistedProblem;

const hop1 = tolka.createDictionary({
    extends: [tagged],
    content: { hop1: { sv: "A", en: "A" } },
});
const hop2 = tolka.createDictionary({
    extends: [hop1],
    content: { hop2: { sv: "A", en: "A" } },
});
const hop3 = tolka.createDictionary({
    extends: [hop2],
    content: { hop3: { sv: "A", en: "A" } },
});

const hop4 = tolka.createDictionary({
    extends: [hop3],
    content: { hop4: { sv: "A", en: "A" } },
});

// Four hops is the bound, and the tag four hops down is still required.
// @ts-expect-error this config registers no `tone` plugin
plain.resolveDictionary(hop4, { locale: "sv", state: {} });

const atTheBound: string = tolka.resolveDictionary(hop4, {
    locale: "sv",
    state: { tone: "formal" },
}).content.greeting;
void atTheBound;

// @ts-expect-error the fifth hop is further than the types can prove
tolka.createDictionary({
    extends: [hop4],
    content: { hop5: { sv: "A", en: "A" } },
});

type TooDeep = ChainGuard<Locales, Locales, readonly [typeof hop4]>;
const tooDeep: TooDeep = {
    __tolkaError: BRAND,
    problem:
        "an `extends` chain runs further than four hops, which is further than the types can prove -- compose shallower units instead",
};
void tooDeep;

// ---- a foreign locale set cannot hide one hop down

const swedishWrapper = createTolka({
    locales: ["sv"] as const,
    defaultLocale: "sv",
    plugins: [] as const,
}).createDictionary({ extends: [swedishOnly], content: {} });

// @ts-expect-error `only` has no `en`, one hop below an empty wrapper
tolka.createDictionary({
    extends: [swedishWrapper],
    content: { own: { sv: "Egen", en: "Own" } },
});

tolka.resolveDictionary(
    // @ts-expect-error the wrapper's chain is not valid for this config
    swedishWrapper,
    { locale: "en", state: { tone: "formal" } }
);

function WrapperReader(): null {
    // @ts-expect-error the same chain, refused on the hook path too
    useDictionary(swedishWrapper);
    return null;
}
void WrapperReader;

// ---- a dictionary round-trips through createDictionary

declare const alreadyBuilt: Dictionary<{ built: Record<Locales, string> }>;

// `Dictionary` declares `extends?: E | undefined`, so under
// `exactOptionalPropertyTypes` the input has to admit the same shape.
tolka.createDictionary(alreadyBuilt);
