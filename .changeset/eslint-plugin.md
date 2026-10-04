---
"@meitner/tolka": patch
---

Add `@meitner/tolka/eslint-plugin` with `static-content`, which requires a dictionary's content to be string literals and plugin calls.

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
