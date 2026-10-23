---
"@meitner/tolka": minor
---

A custom rule passed to `runConsistencyChecks` now names its own findings. Rules
return just the key and the detail; the walk stamps the file, the kind `"rule"`
and the rule's name, and `formatFindings` prints that name in the label. Until
now the `Finding` kind union held only the library's structural kinds, so a rule
had to borrow one — a glossary violation reported itself as unparseable ICU.
