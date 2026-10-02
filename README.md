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
// intl.config.ts
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
import { tolka } from "./intl.config";

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

## React

Bind once, then use the hook:

```tsx
// intl.react.ts
import { createReactBindings } from "@meitner/tolka/react";
import { tolka } from "./intl.config";

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
import { tolka } from "./intl.config";

const modules = import.meta.glob("./**/*.dictionary.ts", { eager: true });

test("content is consistent", () => {
    const report = runConsistencyChecks(tolka, modules);
    expect(report.summary).toBe("");
});
```

It reports placeholder drift, tag drift, unparseable ICU, undeclared locales and
self-closing tags, and it tells you which file each one came from.

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
