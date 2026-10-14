---
"@meitner/tolka": minor
---

A key can now hold a group of further keys instead of copy, so a closed union can be read dynamically — `content.sectionType[category]` — while the compiler still proves every branch has copy. This replaces flattening each branch into its own key and reaching it with a template literal, which preserved totality but left the key that actually exists nowhere in the source.

An ICU `select` cannot do the same job: with an `other` clause the argument widens to `string` and an uncovered member passes silently, and without one `intl-messageformat` refuses to construct the message.

Groups nest to any depth at runtime and to four levels in the types; the new `content-depth` rule stops authors at two, because deeper nesting rebuilds the namespace tree that colocated dictionaries replace. The consistency checker names a branch by its path (`sectionType.Program`), and coverage counts branches rather than the groups holding them.

Existing flat content is unaffected.
