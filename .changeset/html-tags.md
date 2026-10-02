---
"@meitner/tolka": minor
---

Add `htmlTags` to the `react` subpath: renderers for the content-only HTML tags, for a message that is a block of markup rather than copy with components in it.

```tsx
content.terms(htmlTags);
content.notice({ ...htmlTags, name: user.name });
```

Tag renderers are the right shape when copy and components interleave — a link around part of a sentence, emphasis around an interpolated name — because the alternative forces the translator to break the sentence into fragments. They are pure overhead when the message is a static block of list markup, where writing a renderer per tag turns one line into twenty. Found by converting a real section of exactly that kind.

Passed explicitly rather than applied by default, so what a message renders stays readable at the call site. `a` is deliberately absent: a link needs an href, and taking one from translated copy is the single thing the tag design exists to prevent, so it gets a renderer of its own with the href from code.

Note that `<br>` must be written `<br></br>`. ICU has no self-closing tags, so `<br/>` renders as its own source text and a bare `<br>` fails to parse.
