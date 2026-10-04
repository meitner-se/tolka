---
"@meitner/tolka": minor
---

Export `DefinedPlugin` and `PluginCreate`, so a package can define a plugin and re-export it.

`definePlugin`'s return type mentions `PluginCreate`, which was declared but not reachable from the entry point. A package that emits declarations — which any shared package does — therefore could not name the type of its own plugin, and failed to build with TS2883: *the inferred type cannot be named without a reference to `PluginCreate`; a type annotation is necessary.*

`DefinedPlugin<Tag, Axis>` is that annotation, and is what `definePlugin` returns:

```ts
export const schoolTypePlugin: DefinedPlugin<"schoolType", SchoolType> = definePlugin({ … });
export const schoolType: PluginCreate<"schoolType"> = schoolTypePlugin.create;
```

Found by moving a plugin into a shared package so several apps could agree on one definition of the axis — which is exactly the arrangement the plugin system exists to support, and the one case the types did not allow.
