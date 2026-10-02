# @meitner/tolka

## 0.0.1

### Patch Changes

- [`cfffba4`](https://github.com/meitner-se/tolka/commit/cfffba48b440aa95451b3180b5426b8d4f4fc930) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - Initial release. Typesafe ICU message formatting with direct imports: a content file is a plain module, so parameter types come from the module graph rather than a generated registry, and there is no codegen and no build step.

  Formatting is real ICU MessageFormat delegated to `intl-messageformat`, which is the only runtime dependency. Locale is the one built-in axis; everything else is a plugin, so the library knows nothing about any consuming domain. A key's return type is frozen at `string` when its message has no tags and `ReactNode` when it does, and nothing in the library may change that. Formatting never throws at render, falling back to the raw message and reporting through `onError`.

  Ships the core, a `react` subpath with a provider and hook, and a `testing` subpath whose `runConsistencyChecks` gates a whole corpus in CI. Consistency checking is load-bearing rather than cosmetic: the derived types read a key's shape off the default locale, so a translation that quietly drops a placeholder would otherwise make that type a lie in one language only.
