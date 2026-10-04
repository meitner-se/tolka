export { createTolka, defineLocale, definePlugin } from "./runtime.js";
export type {
    DefinedPlugin,
    ErrorInfo,
    PluginCreate,
    PostResolve,
    ResolveInfo,
    Tolka,
    TolkaConfig,
} from "./runtime.js";

export {
    checkDictionary,
    formatFindings,
    localeCoverage,
    variantsOf,
} from "./check.js";
export type { Finding, LocaleCoverage, Rule, Variant } from "./check.js";

export type {
    AnyPlugin,
    Content,
    Dictionary,
    DictionaryMeta,
    HasTags,
    Leaf,
    LocaleDef,
    LocaleInput,
    LocalesOf,
    MessageOf,
    OptionalLocalesOf,
    Params,
    Plugin,
    RequiredLocalesOf,
    Resolved,
    SelfClosingError,
    SelfClosingTags,
    StateFromPlugins,
    TagNames,
    TagRenderers,
    Tagged,
    TaggedStates,
    TagsUsed,
    Value,
} from "./types.js";
