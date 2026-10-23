import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            include: ["src/**"],
            // `types.ts` is type-only and emits nothing; `index.ts` is a
            // re-export barrel, exercised by the built-package smoke test.
            exclude: [
                "src/vendor/**",
                "src/types.ts",
                "src/index.ts",
                "**/*.test.*",
            ],
            thresholds: {
                statements: 98,
                branches: 92,
                functions: 95,
                lines: 98,
            },
        },
    },
});
