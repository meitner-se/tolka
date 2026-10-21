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
    checkExtends,
    formatFindings,
    localeCoverage,
    variantsOf,
} from "./check.js";
export type {
    ChainMember,
    DictionaryNode,
    Finding,
    LocaleCoverage,
    Rule,
    Variant,
} from "./check.js";

export type {
    AnyDictionary,
    AnyPlugin,
    Content,
    Dictionary,
    DictionaryMeta,
    Extendable,
    Extended,
    ExtendsCollision,
    ExtendsGuard,
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
