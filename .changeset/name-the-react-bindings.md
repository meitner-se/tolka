---
"@meitner/tolka": patch
---

`createReactBindings` now declares what it returns, so a consumer can hold the bindings in a module of its own without annotating them. Since 0.2.0 that was not possible: `export const { DictionaryProvider, useDictionary } = createReactBindings(tolka)` failed with TS5088 in any package that emits declarations, because the return type was inferred and anonymous, leaving the declaration emitter no name to point at. It then wrote `useDictionary`'s type out in full, walked into `Extended` and `ChainGuard`'s own recursion, and gave up — in the consumer's build, naming a line that looked correct.

The shape is unchanged; only its name is new. `ReactBindings` is the object itself, and `DictionaryProviderOf` and `UseDictionaryOf` are its two members, named separately because that is what the fix turns on: the emitter expands an inferred member type unless the member has a name of its own to reference, so naming only the enclosing interface leaves the failure in place.

The one-instance-per-monorepo pattern the README recommends is what runs into this, since those bindings are exported from a shared package rather than built where they are used. Working around it meant writing the instance's own type parameters back out through `ReturnType` and an `infer` over `Tolka`, splitting the destructuring into one annotated `const` per binding, and silencing whatever hook-naming lint rule the consumer runs, because a binding assigned from a member access no longer reads as a hook. All three go away on upgrade; plain destructuring infers.
