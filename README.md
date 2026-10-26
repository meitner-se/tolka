# tolka

ICU message formatting for TypeScript. Content files are plain modules you
import, so argument types come from the literal strings. No string keys, no
generated registry, no build step.

```bash
pnpm add @meitner/tolka
```

> Pre-release (`0.0.x`). The API still moves.

## Getting started

Create one instance for your app:

```ts
// intl.ts
import { createTolka, defineLocale } from "@meitner/tolka";

export const tolka = createTolka({
    locales: [defineLocale("sv"), defineLocale("en")],
    defaultLocale: "sv",
    plugins: [],
});
```

Write content next to the component that uses it:

```ts
// header.dictionary.ts
import { tolka } from "./intl";

export const dictionary = tolka.createDictionary({
    content: {
        title: { sv: "Filer", en: "Files" },
        count: {
            sv: "{n, plural, =0 {Inga filer} =1 {1 fil} other {# filer}}",
            en: "{n, plural, =0 {No files} =1 {1 file} other {# files}}",
        },
    },
});
```

Read it:

```ts
const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: {},
});

content.title; // "Filer"
content.count({ n: 0 }); // "Inga filer"
content.count({ n: 3 }); // "3 filer"
```

`content.title` is a string because its message has no arguments. `content.count`
is a function because its message does. You get that distinction from the
literal, with no annotations.

## What the types know

```ts
content.count({ n: 3 }); // ok
content.count({ n: "3" }); // Error: n is a number
content.count({}); // Error: n is missing
content.count({ n: 3, extra: 1 }); // Error: no such argument
content.title(); // Error: not a function
```

Everything ICU can express is typed. `plural` and `number` arguments are
numbers, `date` and `time` are `Date`, and `select` branches become a union:

```ts
const dictionary = tolka.createDictionary({
    content: {
        status: {
            sv: "{state, select, draft {Utkast} sent {Skickat} other {Okänt}}",
            en: "{state, select, draft {Draft} sent {Sent} other {Unknown}}",
        },
        when: {
            sv: "Sparad {at, date, short}",
            en: "Saved {at, date, short}",
        },
    },
});

content.status({ state: "draft" }); // ok
content.status({ state: "nope" }); // Error
content.when({ at: new Date() }); // ok
content.when({ at: "today" }); // Error: at is a Date
```

## Copy chosen by a value

A key can hold a group of further keys instead of copy. That is how a closed
union is read dynamically while the compiler still proves every branch exists:

```ts
export const dictionary = createDictionary({
    content: {
        status: {
            Draft: { sv: "Utkast", en: "Draft" },
            Published: { sv: "Publicerad", en: "Published" },
        },
    },
});

const { content } = useDictionary(dictionary);

content.status[state]; // string
```

Add a third member to `status` without adding its branch and the index stops
compiling. That is the whole point of the shape — an ICU `select` cannot do it,
because `select` requires an `other` clause and `other` widens the argument to
`string`.

Groups nest as deep as you like, which is what the two-level case needs:

```ts
content.errorCodes[code].title;
```

Depth is bounded at four levels in the types, and the `content-depth` rule
stops at two by default. Past that, a dictionary is becoming a namespace tree,
which is the thing colocation and direct imports exist to avoid — split it
instead.

A branch may be named after a locale (`sv`, `en`). Nothing reads key names: a
locale map's values are copy, a group's values are records, and that is the
only distinction being made.

## Rich text

ICU tags get a renderer per call. The return type changes to `ReactNode` as
soon as a message has tags:

```ts
const dictionary = tolka.createDictionary({
    content: {
        confirm: {
            sv: "Ta bort <b>{name}</b>?",
            en: "Delete <b>{name}</b>?",
        },
    },
});

content.confirm({ name: "report.pdf", b: (chunks) => <strong>{chunks}</strong> });
```

Tags carry no attributes. Anything dynamic arrives through a placeholder, which
is escaped, so translated copy can never introduce markup.

A renderer per tag is what you want when copy and components interleave — a
link around part of a sentence, emphasis around an interpolated name.

When a message is a block of markup instead, writing one per call site gets
tedious. Keep a shared object and spread it:

```tsx
// intl.tags.tsx
export const tags = {
    p: (chunks: ReactNode) => <p>{chunks}</p>,
    strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
    ul: (chunks: ReactNode) => <ul>{chunks}</ul>,
    li: (chunks: ReactNode) => <li>{chunks}</li>,
};

content.terms(tags);
content.notice({ ...tags, name: user.name });
```

tolka does not ship that object, deliberately. Which tags belong in it is a
decision about your content, and any set the library picked would be wrong for
someone. Keeping it in your code also keeps the choice visible: a tag you have
not listed is a compile error at the call site, not a silent rendering.

Leave `a` out of a shared set. A link needs an href, and an href taken from
translated copy is the one thing this design prevents — so give it a renderer
of its own, with the href supplied from code.

Void elements take no chunks, and ICU has no self-closing tags, so write
`<br></br>` in the message. `<br/>` renders as its own source text.

## React

Bind once, then use the hook:

```tsx
// intl.react.ts
import { createReactBindings } from "@meitner/tolka/react";
import { tolka } from "./intl";

export const { DictionaryProvider, useDictionary } = createReactBindings(tolka);
```

```tsx
// app root
<DictionaryProvider locale={locale} state={{}}>
    <App />
</DictionaryProvider>
```

```tsx
import { dictionary } from "./header.dictionary";

function Header() {
    const { content } = useDictionary(dictionary);
    return <h1>{content.title}</h1>;
}
```

`useDictionary` reads the locale from the provider and calls
`resolveDictionary`. Resolution is cached per dictionary, locale and state, so
the object you get back keeps its identity across renders and is safe in a
dependency array.

A component that knows it is showing a different axis than the one the user is
on says so where it reads the copy:

```tsx
function PreviewCard() {
    const { content } = useDictionary(dictionary, { tone: "formal" });
    return <h1>{content.title}</h1>;
}
```

The second argument is merged over the provider's state, so an axis you leave
out keeps the value the provider gave it — the reason to prefer this over a
second `DictionaryProvider`, which would replace the whole state and would have
to restate the locale as well. Each distinct state is its own cache entry, so
two components reading the same dictionary under different overrides do not
collide.

React is an optional peer dependency. The core never imports it.

## Outside React

`resolveDictionary` needs no provider and no hook, so it works in a route's
`head()`, a loader, a script or a test:

```ts
const { content } = tolka.resolveDictionary(dictionary, {
    locale: "en",
    state: {},
});

export const meta = [{ title: content.title }];
```

There is also `formatMessage` for a string that did not come from a dictionary:

```ts
tolka.formatMessage("{n, plural, =1 {1 file} other {# files}}", "en", { n: 3 });
```

## Sharing copy between dictionaries

A component that calls a helper owning copy used to have to resolve the
helper's dictionary too and hand the content straight back, for keys it never
reads itself. `extends` removes that: the dictionary names what it also
resolves, and the component resolves one thing.

```ts
// userRoles.dictionary.ts
export const userRoleLabels = tolka.createDictionary({
    content: {
        roleAdmin: { sv: "Administratör", en: "Admin" },
        roleMember: { sv: "Medlem", en: "Member" },
    },
});
```

```ts
// useUserDropdown.dictionary.ts
export const useUserDropdownDictionary = tolka.createDictionary({
    extends: [userRoleLabels],
    content: {
        placeholder: { sv: "Välj användare", en: "Pick a user" },
    },
});
```

```tsx
const { content } = useDictionary(useUserDropdownDictionary);

content.placeholder; // its own
content.roleAdmin; // the one it extends
```

`extends` composes: a dictionary that extends one which itself extends another
resolves all three. The chain is bounded at four hops, because anything longer
is the namespace tree colocated dictionaries exist to replace.

**Two dictionaries in one resolution may not define the same key.** It is a
compile error naming the key and both sides — `content`, or the position in
`extends` — because a silent last-wins would publish the wrong copy with
nothing to catch it. A dictionary's plugin tags come along too, so a config
that does not register them still refuses to resolve it, however many hops down
the copy that needs them lives.

Anything the compiler cannot read end to end is refused rather than resolved
anyway, because every one of those checks is derived from the chain — a hop it
cannot see does not fail a check, it quietly drops one. So `extends` wants an
array literal at the call (a hoisted array hides which dictionaries are in it),
a chain past four hops is a compile error rather than a silent truncation, and
a dictionary built for a different locale set cannot be extended in, even one
hop below an empty wrapper.

Extending copies nothing. `content` holds a dictionary's own keys and only
those, so `runConsistencyChecks`, your coverage ratios and any audit count each
key once, under the dictionary that defines it. Extending a dictionary never
moves another dictionary's numbers.

Keep the extended units small. Extending a fifty-key helper drags every one of
its keys into the consumer's content type, its autocomplete and its coverage
ratio; extending a six-key unit does not.

## Plugins

Locale is the only axis tolka knows about. Anything else is a plugin, so the
library stays free of your domain:

```ts
// plugins/tone.ts
import { definePlugin } from "@meitner/tolka";
import type { Tagged } from "@meitner/tolka";

export type Tone = "formal" | "casual" | null;

export const tonePlugin = definePlugin({
    tag: "tone",
    resolve: (value: Tagged<"tone">, tone: Tone) =>
        value.states[tone ?? "default"] ?? value.states.default,
    defaultAxisValue: null,
});

// What content files use.
export const tone = tonePlugin.create;
```

Register the plugin, then write varying values with its `create`:

```ts
export const tolka = createTolka({
    locales: [defineLocale("sv"), defineLocale("en")],
    defaultLocale: "sv",
    plugins: [tonePlugin],
});
```

```ts
import { tone } from "./plugins/tone";

const dictionary = tolka.createDictionary({
    content: {
        greeting: {
            sv: tone({ default: "Hej", formal: "God dag" }),
            en: tone({ default: "Hello" }),
        },
    },
});

tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: "formal" },
});
// content.greeting === "God dag"
```

`default` is required. It is the fallback when an axis value has no entry, and
it is where argument types are read from, so a set without one would lose
inference and render nothing.

The plugin resolves first, then ICU formats the result. So a plugin can change
which words appear, never which plural branch is chosen.

The provider's `state` is typed from the plugins you registered. A plugin with
a `defaultAxisValue` makes its key optional; one without keeps it required.

## Adding a locale later

Adding a locale to the config would normally break every dictionary at once.
Mark it optional while it is being filled in:

```ts
createTolka({
    locales: [
        defineLocale("sv"),
        defineLocale("en"),
        defineLocale("nb", { optional: true }),
    ],
    defaultLocale: "sv",
});
```

A missing `nb` falls back to the default locale. Required locales stay required,
so a missing `en` is still a compile error. Track the rollout with
`runConsistencyChecks`, which reports coverage per locale, and flip the locale
to required when it reaches 1.

## Checking your content

`createDictionary` compares every locale and plugin state of a key. It throws in
development and warns in production, because a copy typo should not crash an
app.

This matters more than it looks. Argument types are read off the default locale,
so if a translation drops a placeholder, the type is wrong in that one language.
The check is what stops that.

For the whole corpus, add one test:

```ts
import { runConsistencyChecks } from "@meitner/tolka/testing";
import { tolka } from "./intl";

const modules = import.meta.glob("./**/*.dictionary.ts", { eager: true });

test("content is consistent", () => {
    const report = runConsistencyChecks(tolka, modules);
    expect(report.summary).toBe("");
});
```

It reports placeholder drift, tag drift, unparseable ICU, undeclared locales and
self-closing tags, and it tells you which file each one came from.

## Keeping content readable without running it

```js
// eslint.config.js
import tolka from "@meitner/tolka/eslint-plugin";

export default [
    {
        files: ["**/*.dictionary.ts"],
        plugins: { tolka },
        rules: {
            "tolka/static-content": "error",
            "tolka/content-depth": "warn",
        },
    },
];
```

Content has to be string literals and plugin calls. TypeScript will not enforce
that, and the consistency checker, a future editor and any export all depend on
it — they read content, they do not run it.

The rule's main job is the spread. Reaching for `...common.content` to share
copy is the first instinct; the answer is `extends`, which is a sibling of
`content` rather than something inside it — the rule reads the `content` object
and nothing else, so the identifiers in `extends` stay identifiers.

## Things that catch people out

**ICU has no self-closing tags.** `<Value />` parses as literal text. It renders
as itself and your renderer is never called. Write `{value}` or
`<value></value>` instead. tolka rejects it at the call site and the checker
reports it, but other ICU tools will not.

**`'` starts an escape.** `'{name}'` renders the braces literally. Write `''` for
a real apostrophe.

**Return types are fixed by the message.** No tags means `string`, tags mean
`ReactNode`. Nothing in the library can change that, which is why
`content.title` is safe in `document.title` or an `aria-label`. Adding a tag to
a message flips the key, and the compiler will walk you through every call site.

## Contributing

```bash
pnpm install
pnpm test        # behaviour
pnpm typecheck   # includes typetests/
pnpm lint
```

The type-level machinery is most of the product, and runtime tests exercise none
of it. `typetests/` holds `@ts-expect-error` assertions instead, and CI runs them
against several TypeScript versions.
