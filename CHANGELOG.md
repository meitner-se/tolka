# @meitner/tolka

## 0.4.0

### Minor Changes

- [#5](https://github.com/meitner-se/tolka/pull/5) [`4fa4d2b`](https://github.com/meitner-se/tolka/commit/4fa4d2bc996d3c7bc467322df02dfbf08e512540) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - `useDictionary` takes an optional second argument: axis values for that one
  read, merged over the provider's state. A component showing a different axis
  than the user is on now says so where it reads the copy, instead of wrapping
  itself in a second `DictionaryProvider` — which replaces the whole state rather
  than the one axis it means to change, and has to restate the locale too. The
  override is typed against the configured plugins, and each distinct state stays
  its own cache entry.

## 0.3.0

### Minor Changes

- [#3](https://github.com/meitner-se/tolka/pull/3) [`fee05cf`](https://github.com/meitner-se/tolka/commit/fee05cf763c1c601abdc64f26355595bd39ab5a5) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - A custom rule passed to `runConsistencyChecks` now names its own findings. Rules
  return just the key and the detail; the walk stamps the file, the kind `"rule"`
  and the rule's name, and `formatFindings` prints that name in the label. Until
  now the `Finding` kind union held only the library's structural kinds, so a rule
  had to borrow one — a glossary violation reported itself as unparseable ICU.

## 0.2.1

### Patch Changes

- [#8](https://github.com/meitner-se/tolka/pull/8) [`8524f52`](https://github.com/meitner-se/tolka/commit/8524f52e1dbd69a65180ef3966d3567990357eb9) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - `createReactBindings` now declares what it returns, so a consumer can hold the bindings in a module of its own without annotating them. Since 0.2.0 that was not possible: `export const { DictionaryProvider, useDictionary } = createReactBindings(tolka)` failed with TS5088 in any package that emits declarations, because the return type was inferred and anonymous, leaving the declaration emitter no name to point at. It then wrote `useDictionary`'s type out in full, walked into `Extended` and `ChainGuard`'s own recursion, and gave up — in the consumer's build, naming a line that looked correct.

  The shape is unchanged; only its name is new. `ReactBindings` is the object itself, and `DictionaryProviderOf` and `UseDictionaryOf` are its two members, named separately because that is what the fix turns on: the emitter expands an inferred member type unless the member has a name of its own to reference, so naming only the enclosing interface leaves the failure in place.

  The one-instance-per-monorepo pattern the README recommends is what runs into this, since those bindings are exported from a shared package rather than built where they are used. Working around it meant writing the instance's own type parameters back out through `ReturnType` and an `infer` over `Tolka`, splitting the destructuring into one annotated `const` per binding, and silencing whatever hook-naming lint rule the consumer runs, because a binding assigned from a member access no longer reads as a hook. All three go away on upgrade; plain destructuring infers.

## 0.2.0

### Minor Changes

- [#6](https://github.com/meitner-se/tolka/pull/6) [`0224a2b`](https://github.com/meitner-se/tolka/commit/0224a2b08d5ae81c49fa2b3813240be50fa15c4a) Thanks [@MattisAbrahamsson](https://github.com/MattisAbrahamsson)! - A dictionary can now name other dictionaries it also resolves, so a component that reads copy owned by a helper resolves one thing instead of importing, resolving and aliasing the helper's dictionary for keys it never reads itself. Write `extends: [userCategoryLabels]` beside `content` and the extended keys arrive on the resolved content alongside the dictionary's own, in one `useDictionary` or `resolveDictionary`. It composes: a dictionary that extends one which itself extends another resolves all three, bounded at four hops.

  Two dictionaries in one resolution may not define the same key. That is a compile error naming the key and both sides — `content`, or the position in `extends` — rather than a last-wins that would publish the wrong copy with nothing to catch it. The extended dictionaries' plugin tags union into the capability check, so a config that does not register them still refuses to resolve, however many hops down the copy that needs them lives.

  Anything the compiler cannot read end to end is refused rather than resolved anyway, because each of those checks is derived from the chain, and a hop the walk cannot see does not fail a check — it drops one. So `extends` wants an array literal at the call, since a hoisted array hides which dictionaries are in it; a chain past four hops is a compile error rather than a silent truncation; and a dictionary built for a different locale set cannot be extended in, even one hop below a wrapper with empty content. The same proof runs at `resolveDictionary` and `useDictionary`, not only where the dictionary is built.

  Extending copies nothing, which is what keeps the numbers your gates read from moving. `content` still holds a dictionary's own keys and only those, so `runConsistencyChecks`, locale coverage and any audit over your dictionaries count each key once, under the dictionary that defines it; adding `extends` to a dictionary leaves every coverage ratio exactly where it was.

  `extends` is a sibling of `content`, not something inside it, so the `static-content` and `content-depth` lint rules are unchanged — they read the `content` object and nothing else. `extends` is the sanctioned form of the `...other.content` spread that `static-content` has always refused, and unlike that spread it neither duplicates the copy nor counts it twice.

  Keep the dictionaries you extend small. Extending a fifty-key helper drags every one of its keys into the consumer's content type, its autocomplete and its coverage ratio; extending a six-key unit does not.

  Nothing existing changes shape. `Dictionary` gained a second, defaulted type parameter and an optional `extends` field, so `Dictionary<C>` still means what it meant. `Finding` gained an `extends-collision` kind, reported by the new `checkExtends` as the runtime net under a JavaScript caller or a chain deeper than the types reach.

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
