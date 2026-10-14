/**
 * Lint rules for tolka content, shipped as `@meitner/tolka/eslint-plugin`.
 *
 * Syntactic only, so they need no type information and run under oxlint's
 * jsPlugins as well as ESLint.
 */
import type { Rule } from "eslint";
import type {
    CallExpression,
    Expression,
    ObjectExpression,
    Pattern,
    Property,
    SpreadElement,
} from "estree";

type Value = Expression | Pattern | SpreadElement;

function isCreateDictionary(node: CallExpression): boolean {
    const callee = node.callee;
    if (callee.type === "Identifier") {
        return callee.name === "createDictionary";
    }
    return (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "createDictionary"
    );
}

/** The `content: { … }` object of a `createDictionary` call, if it has one. */
function contentObject(node: CallExpression): ObjectExpression | undefined {
    const [first] = node.arguments;
    if (first?.type !== "ObjectExpression") {
        return undefined;
    }
    for (const property of first.properties) {
        if (
            property.type === "Property" &&
            property.key.type === "Identifier" &&
            property.key.name === "content" &&
            property.value.type === "ObjectExpression"
        ) {
            return property.value;
        }
    }
    return undefined;
}

/** A string, however it is quoted. A template with no `${}` is still a literal. */
function isLiteralString(node: Value): boolean {
    if (node.type === "Literal") {
        return typeof node.value === "string";
    }
    return node.type === "TemplateLiteral" && node.expressions.length === 0;
}

/**
 * A plugin's authoring helper: one call, one object literal, string values.
 *
 * Which helper is which cannot be known syntactically, so the shape stands in
 * for the name. That is enough, because the point is not to identify the
 * plugin — it is that the value can be read without running anything.
 */
function isPluginCall(node: Value): boolean {
    if (node.type !== "CallExpression" || node.arguments.length !== 1) {
        return false;
    }
    const [states] = node.arguments;
    if (states?.type !== "ObjectExpression") {
        return false;
    }
    return states.properties.every(
        (property) =>
            property.type === "Property" && isLiteralString(property.value)
    );
}

function isReadableWithoutRunning(node: Value): boolean {
    return isLiteralString(node) || isPluginCall(node);
}

const staticContent: Rule.RuleModule = {
    meta: {
        type: "problem",
        docs: {
            description:
                "require dictionary content to be literals and plugin calls, so it can be read without being run",
        },
        schema: [],
        messages: {
            spread: "Do not spread one dictionary's content into another. Import both and use them side by side.",
            computed:
                "Dictionary content must be a string literal or a plugin call, so it can be read without being run.",
        },
    },
    create(context) {
        function checkProperty(property: Property | SpreadElement): void {
            if (property.type === "SpreadElement") {
                context.report({ node: property, messageId: "spread" });
                return;
            }
            const value = property.value;
            if (value.type === "ObjectExpression") {
                checkObject(value);
                return;
            }
            if (!isReadableWithoutRunning(value)) {
                context.report({ node: value, messageId: "computed" });
            }
        }

        function checkObject(object: ObjectExpression): void {
            for (const property of object.properties) {
                checkProperty(property);
            }
        }

        return {
            CallExpression(node: CallExpression) {
                if (!isCreateDictionary(node)) {
                    return;
                }
                const content = contentObject(node);
                if (content) {
                    checkObject(content);
                }
            },
        };
    },
};

/**
 * A group's values are objects; a locale map's are literals and plugin calls.
 * Same discriminator the runtime uses, read syntactically.
 */
function isLocaleMapNode(object: ObjectExpression): boolean {
    return !object.properties.some(
        (property) =>
            property.type === "Property" &&
            property.value.type === "ObjectExpression"
    );
}

const contentDepth: Rule.RuleModule = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "keep dictionary groups shallow, so content stays colocated rather than becoming a namespace tree",
        },
        schema: [
            {
                type: "object",
                properties: { max: { type: "integer", minimum: 0 } },
                additionalProperties: false,
            },
        ],
        messages: {
            tooDeep:
                "This key is {{depth}} groups deep; at most {{max}} is intended. Deep nesting rebuilds the namespace tree that colocated dictionaries replace -- split the dictionary instead.",
        },
    },
    create(context) {
        const option: unknown = context.options[0];
        const max =
            typeof option === "object" &&
            option !== null &&
            "max" in option &&
            typeof option.max === "number"
                ? option.max
                : 2;

        function walk(object: ObjectExpression, depth: number): void {
            if (isLocaleMapNode(object)) {
                return;
            }
            for (const property of object.properties) {
                if (
                    property.type !== "Property" ||
                    property.value.type !== "ObjectExpression"
                ) {
                    continue;
                }
                if (depth + 1 > max) {
                    context.report({
                        node: property,
                        messageId: "tooDeep",
                        data: { depth: String(depth + 1), max: String(max) },
                    });
                    continue;
                }
                walk(property.value, depth + 1);
            }
        }

        return {
            CallExpression(node: CallExpression) {
                if (!isCreateDictionary(node)) {
                    return;
                }
                const content = contentObject(node);
                if (!content) {
                    return;
                }
                // The content root's own keys are not groups; depth counts
                // the group levels between a key and its copy.
                for (const property of content.properties) {
                    if (
                        property.type === "Property" &&
                        property.value.type === "ObjectExpression"
                    ) {
                        walk(property.value, 0);
                    }
                }
            },
        };
    },
};

export const rules = {
    "static-content": staticContent,
    "content-depth": contentDepth,
};

export default { rules };
