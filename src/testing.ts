import type { DictionaryMeta, Leaf } from "./types.js";

import {
    checkDictionary,
    formatFindings,
    localeCoverage,
    variantsOf,
    type Finding,
    type LocaleCoverage,
    type Rule,
} from "./check.js";

type AnyContent = Record<string, Record<string, Leaf>>;
type AnyDictionary = { content: AnyContent; meta?: DictionaryMeta | undefined };

export type CheckReport = {
    findings: Finding[];
    /** Aggregated across every dictionary, so a rollout is one number. */
    coverage: Record<string, LocaleCoverage>;
    /** Ready to put in an assertion message. */
    summary: string;
};

function isDictionary(value: unknown): value is AnyDictionary {
    return (
        typeof value === "object" &&
        value !== null &&
        "content" in value &&
        typeof value.content === "object"
    );
}

/**
 * Every dictionary a module exposes.
 *
 * A module may be the dictionary, export it as default, or export it under a
 * name -- all three occur, and a module may hold more than one. Checking only
 * the first two silently skipped named exports, which is the common shape.
 */
function dictionariesOf(module: unknown): AnyDictionary[] {
    if (isDictionary(module)) {
        return [module];
    }
    if (typeof module !== "object" || module === null) {
        return [];
    }
    return Object.values(module).filter(isDictionary);
}

/**
 * The CI gate. A three-line vitest file glob-imports every content module and
 * calls this.
 *
 * The runtime check inside `createDictionary` covers structural parity only,
 * because it runs wherever content loads and must stay cheap. This is where
 * the whole corpus is walked, where rules run, and where coverage is counted.
 */
export function runConsistencyChecks(
    config: { locales: readonly string[]; defaultLocale: string },
    modules: Record<string, unknown>,
    options?: { rules?: readonly Rule[] | undefined }
): CheckReport {
    const findings: Finding[] = [];
    const merged: AnyContent = {};
    const rules = options?.rules ?? [];

    for (const [path, module] of Object.entries(modules)) {
        const found = dictionariesOf(module);
        if (found.length === 0) {
            findings.push({
                key: "<module>",
                source: path,
                kind: "unparseable",
                detail: "module exports no dictionary",
            });
            continue;
        }

        for (const dictionary of found) {
            // The glob key is the module path, which is the `source` a dev
            // transform would otherwise have to inject.
            const source = dictionary.meta?.source ?? path;

            findings.push(
                ...checkDictionary(
                    dictionary.content,
                    config.defaultLocale,
                    source,
                    config.locales
                )
            );

            for (const entry of variantsOf(dictionary.content)) {
                for (const rule of rules) {
                    for (const finding of rule.check({ ...entry, source })) {
                        findings.push({
                            ...finding,
                            kind: "rule",
                            rule: rule.name,
                            source,
                        });
                    }
                }
            }

            for (const [key, byLocale] of Object.entries(dictionary.content)) {
                merged[`${source}:${key}`] = byLocale;
            }
        }
    }

    const coverage = localeCoverage(merged, config.locales);
    return { findings, coverage, summary: formatFindings(findings) };
}
