import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url).pathname;

function sources(): string[] {
    const out: string[] = [];
    function walk(dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(path);
            } else if (/\.tsx?$/.test(entry.name)) {
                out.push(path);
            }
        }
    }
    walk(SRC);
    return out;
}

function imports(source: string): { specifier: string; typeOnly: boolean }[] {
    const pattern = /^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm;
    return [...source.matchAll(pattern)].map((match) => ({
        specifier: match[2] ?? "",
        typeOnly: Boolean(match[1]),
    }));
}

describe("layering", () => {
    it("keeps React out of everything but the react entry point", () => {
        // A type-only import is erased, so it costs the core nothing at
        // runtime. A value import would make React reachable from the core and
        // break the promise that it runs anywhere -- a node script, the CI
        // gate, a future exporter.
        const offenders = sources()
            .filter((path) => !/react\.tsx?$/.test(path))
            .filter((path) =>
                imports(readFileSync(path, "utf8")).some(
                    (entry) => entry.specifier === "react" && !entry.typeOnly
                )
            );
        expect(offenders).toEqual([]);
    });

    it("knows nothing about its author's other packages", () => {
        // tolka is a general library. An `@meitner*` import would be the first
        // place Meitner's domain leaked into it.
        const offenders = sources().filter((path) =>
            imports(readFileSync(path, "utf8")).some((entry) =>
                entry.specifier.startsWith("@meitner")
            )
        );
        expect(offenders).toEqual([]);
    });
});
