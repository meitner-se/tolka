# @meitner/tolka

## 0.0.2

### Patch Changes

- [`0773792`](https://github.com/meitner-se/tolka/commit/0773792b7292bdec33bea4c7e7de2da4dd24ff4d) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - Key the output of every tag renderer, so a message with nested tags no longer warns about missing keys.

  `toNode` keyed only the array `format` returns at the top level. A nested tag hands its renderer an array of already-built elements as `chunks` — a `<ul>` receives its `<li>`s — and the renderer created each of those without a key, so React warned once per element. A message with a list warned several times on every render.

  This could not be fixed at the call site, which is what made it worth fixing here: `Children.toArray(chunks)` keys the children, while React validates the element the renderer handed back, so the obvious remedy changes nothing and reads as unfixable noise. Found by converting a real section whose copy is a block of list markup.

## 0.0.1

### Patch Changes

- [`cfffba4`](https://github.com/meitner-se/tolka/commit/cfffba48b440aa95451b3180b5426b8d4f4fc930) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - Initial release. Typesafe ICU message formatting with direct imports: a content file is a plain module, so parameter types come from the module graph rather than a generated registry, and there is no codegen and no build step.

  Formatting is real ICU MessageFormat delegated to `intl-messageformat`, which is the only runtime dependency. Locale is the one built-in axis; everything else is a plugin, so the library knows nothing about any consuming domain. A key's return type is frozen at `string` when its message has no tags and `ReactNode` when it does, and nothing in the library may change that. Formatting never throws at render, falling back to the raw message and reporting through `onError`.

  Ships the core, a `react` subpath with a provider and hook, and a `testing` subpath whose `runConsistencyChecks` gates a whole corpus in CI. Consistency checking is load-bearing rather than cosmetic: the derived types read a key's shape off the default locale, so a translation that quietly drops a placeholder would otherwise make that type a lie in one language only.
