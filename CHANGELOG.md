# @meitner/tolka

## 0.1.0

### Minor Changes

- [#4](https://github.com/meitner-se/tolka/pull/4) [`1f50e32`](https://github.com/meitner-se/tolka/commit/1f50e3297d515b0ac075c0066bf569f9b99dd7e1) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - A key can now hold a group of further keys instead of copy, so a closed union can be read dynamically — `content.sectionType[category]` — while the compiler still proves every branch has copy. This replaces flattening each branch into its own key and reaching it with a template literal, which preserved totality but left the key that actually exists nowhere in the source.

  An ICU `select` cannot do the same job: with an `other` clause the argument widens to `string` and an uncovered member passes silently, and without one `intl-messageformat` refuses to construct the message.

  Groups nest to any depth at runtime and to four levels in the types; the new `content-depth` rule stops authors at two, because deeper nesting rebuilds the namespace tree that colocated dictionaries replace. The consistency checker names a branch by its path (`sectionType.Program`), and coverage counts branches rather than the groups holding them.

  Existing flat content is unaffected.

## 0.0.4

### Patch Changes

- [`395a54d`](https://github.com/meitner-se/tolka/commit/395a54d724e396e420068bbd1704880960dd94c2) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - Add `@meitner/tolka/eslint-plugin` with `static-content`, which requires a dictionary's content to be string literals and plugin calls.

  ```js
  import tolka from "@meitner/tolka/eslint-plugin";

  export default [
    {
      files: ["**/*.dictionary.ts"],
      plugins: { tolka },
      rules: { "tolka/static-content": "error" },
    },
  ];
  ```

  TypeScript will not enforce this, and everything else depends on it. The consistency checker, per-locale rules, a future editor and a TMS export all read content without running it — the difference between "the editor is an AST walk" and "the editor must execute arbitrary code". A migration audit reading content it cannot analyse is a check that passes vacuously.

  The spread is the one worth catching. Reaching for `...common.content` to share copy is the first instinct, and the sanctioned answer is two dictionaries side by side: with direct imports that is just another import.

  A plugin call is recognised by shape rather than name — one call, one object literal, string values — because which helper belongs to which plugin cannot be known syntactically. The rule is purely syntactic, so it needs no type information and runs under oxlint's jsPlugins. `eslint` is an optional peer dependency; nothing else in the package requires it.

## 0.0.3

### Patch Changes

- [`5b50ad0`](https://github.com/meitner-se/tolka/commit/5b50ad097cd1905962f39ed04a4cbaaebddfe2e8) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - Export `DefinedPlugin` and `PluginCreate`, so a package can define a plugin and re-export it.

  `definePlugin`'s return type mentions `PluginCreate`, which was declared but not reachable from the entry point. A package that emits declarations — which any shared package does — therefore could not name the type of its own plugin, and failed to build with TS2883: _the inferred type cannot be named without a reference to `PluginCreate`; a type annotation is necessary._

  `DefinedPlugin<Tag, Axis>` is that annotation, and is what `definePlugin` returns:

  ```ts
  export const schoolTypePlugin: DefinedPlugin<"schoolType", SchoolType> = definePlugin({ … });
  export const schoolType: PluginCreate<"schoolType"> = schoolTypePlugin.create;
  ```

  Found by moving a plugin into a shared package so several apps could agree on one definition of the axis — which is exactly the arrangement the plugin system exists to support, and the one case the types did not allow.

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
