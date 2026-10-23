# tolka

Typesafe ICU message formatting with direct imports — no string keys, no registry, no build step.

> Status: pre-release (`0.0.x`), private while the API settles. Published as `@meitner/tolka`.

## What it is

Content is a plain module you import directly, so param types come from the module graph
rather than generated lookup tables. Formatting is real ICU MessageFormat, delegated to
`intl-messageformat` — not a bespoke DSL.

```ts
// intl.config.ts
import { createTolka } from "@meitner/tolka";
import { tonePlugin } from "./plugins/tone";

export const tolka = createTolka({
    locales: ["sv", "en"] as const,
    defaultLocale: "sv",
    plugins: [tonePlugin] as const,
    onError: (error, info) => reportToSentry(error, info),
});
```

```ts
// example.dictionary.ts
import { tolka } from "./intl.config";

export const dictionary = tolka.createDictionary({
    content: {
        title: { sv: "Filer", en: "Files" },
        resultCount: {
            sv: "Visar {count, plural, =1 {1 resultat} other {# resultat}}",
            en: "Showing {count, plural, =1 {1 result} other {# results}}",
        },
        confirmDelete: {
            sv: "Ta bort <b>{name}</b>?",
            en: "Delete <b>{name}</b>?",
        },
    },
});
```

```ts
const { content } = tolka.resolveDictionary(dictionary, {
    locale: "sv",
    state: { tone: null },
});

content.title; // string
content.resultCount({ count: 3 }); // string
content.confirmDelete({ name, b: (chunks) => <strong>{chunks}</strong> }); // ReactNode
```

In React, bind once and use the hook:

```tsx
// intl.react.ts -- the only module that touches tolka/react
import { createReactBindings } from "@meitner/tolka/react";
import { tolka } from "./intl.config";

export const { DictionaryProvider, useDictionary } = createReactBindings(tolka);
```

```tsx
function Header() {
    const { content } = useDictionary(dictionary);
    return <h1>{content.title}</h1>;
}
```

`useDictionary` is a thin wrapper: it reads `{ locale, state }` from the
provider and calls `resolveDictionary`. One resolution path, and the core
never imports React at runtime. Resolution is memoised per
`(dictionary, locale, state)`, so plain-string keys and formatter functions
keep a stable identity across renders and are safe in dependency arrays.

## Design commitments

- **Real ICU**, delegated to `intl-messageformat`. No hand-rolled message DSL.
- **No codegen.** Param types are parsed from the literal string type. `tsc` is sufficient.
- **Bundler-agnostic.** No plugin, no transform, no scan — which is why published
  packages need no special case.
- **Pluggable axes.** Locale is the one built-in axis. Everything else, school type
  included, is a plugin; the core knows nothing about any of them.
- **The return type is frozen.** No tags means `string`, forever. Tags mean `ReactNode`.
  Only an author changing a message's tags may flip a key between the two.
- **Never throws at render.** A failed format falls back to the raw message and reports
  through `onError`.

## Consistency checks

`createDictionary` compares every locale and plugin state of a key against each other and
reports placeholder drift, tag drift, self-closing tags and unparseable ICU. It throws in
development and warns in production, because a copy typo must never crash the app.

These checks are load-bearing for type soundness rather than mere copy hygiene: the derived
types read a key's shape off the default locale, so a translation that quietly drops a
placeholder would otherwise make that type a lie in one language only.

A note on ICU that costs people time: **there are no self-closing tags.** `<Value />` parses
as literal text, renders as itself, and never calls a renderer. Use `{value}` or a paired
`<value></value>`. The types reject it and the checker reports it.

## Development

```bash
pnpm install
pnpm test        # runtime behaviour
pnpm typecheck   # includes typetests/, where the type-level assertions live
```

The type-level machinery is the product and runtime tests exercise none of it, so
`typetests/` carries `@ts-expect-error` assertions and CI runs them across a TypeScript
version matrix.
