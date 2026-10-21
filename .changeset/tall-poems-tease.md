---
"@meitner/tolka": minor
---

A dictionary can now name other dictionaries it also resolves, so a component that reads copy owned by a helper resolves one thing instead of importing, resolving and aliasing the helper's dictionary for keys it never reads itself. Write `extends: [userCategoryLabels]` beside `content` and the extended keys arrive on the resolved content alongside the dictionary's own, in one `useDictionary` or `resolveDictionary`. It composes: a dictionary that extends one which itself extends another resolves all three, bounded at three hops in the types.

Two dictionaries in one resolution may not define the same key. That is a compile error naming the key and both sides — `content`, or the position in `extends` — rather than a last-wins that would publish the wrong copy with nothing to catch it. The extended dictionaries' plugin tags union into the capability check, so a config that does not register them still refuses to resolve. A dictionary built for a different locale set cannot be extended into one that promises those locales.

Extending copies nothing, which is what keeps the numbers your gates read from moving. `content` still holds a dictionary's own keys and only those, so `runConsistencyChecks`, locale coverage and any audit over your dictionaries count each key once, under the dictionary that defines it; adding `extends` to a dictionary leaves every coverage ratio exactly where it was.

`extends` is a sibling of `content`, not something inside it, so the `static-content` and `content-depth` lint rules are unchanged — they read the `content` object and nothing else. `extends` is the sanctioned form of the `...other.content` spread that `static-content` has always refused, and unlike that spread it neither duplicates the copy nor counts it twice.

Keep the dictionaries you extend small. Extending a fifty-key helper drags every one of its keys into the consumer's content type, its autocomplete and its coverage ratio; extending a six-key unit does not.

Nothing existing changes shape. `Dictionary` gained a second, defaulted type parameter and an optional `extends` field, so `Dictionary<C>` still means what it meant. `Finding` gained an `extends-collision` kind, reported by the new `checkExtends` as the runtime net under a JavaScript caller or a chain deeper than the types reach.
