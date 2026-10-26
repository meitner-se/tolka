---
"@meitner/tolka": minor
---

`useDictionary` takes an optional second argument: axis values for that one
read, merged over the provider's state. A component showing a different axis
than the user is on now says so where it reads the copy, instead of wrapping
itself in a second `DictionaryProvider` — which replaces the whole state rather
than the one axis it means to change, and has to restate the locale too. The
override is typed against the configured plugins, and each distinct state stays
its own cache entry.
