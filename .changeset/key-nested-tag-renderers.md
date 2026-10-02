---
"@meitner/tolka": patch
---

Key the output of every tag renderer, so a message with nested tags no longer warns about missing keys.

`toNode` keyed only the array `format` returns at the top level. A nested tag hands its renderer an array of already-built elements as `chunks` — a `<ul>` receives its `<li>`s — and the renderer created each of those without a key, so React warned once per element. A message with a list warned several times on every render.

This could not be fixed at the call site, which is what made it worth fixing here: `Children.toArray(chunks)` keys the children, while React validates the element the renderer handed back, so the obvious remedy changes nothing and reads as unfixable noise. Found by converting a real section whose copy is a block of list markup.
