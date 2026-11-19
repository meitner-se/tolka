---
"@meitner/tolka": minor
---

`createReactBindings` now also returns `useLocale`, which reads the locale the `DictionaryProvider` is on and types it as the instance's own locales rather than `string`. An app that narrows a plain string once to mount the provider can read it back narrowed everywhere it formats a date, a number or a list, instead of narrowing again at each site or keeping a second locale context beside the provider. Like `useDictionary` it throws outside the provider rather than falling back to a default, and a per-read axis override does not affect it.
