import { configDefaults, defineConfig } from "vitest/config";

import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
    define: {
        appVersion: JSON.stringify(packageJson.version),
    },
    test: {
        logHeapUsage: true,
        // The files share one module graph per worker instead of starting a fresh one each. Specs that mock modules
        // or record generated ids have to account for that themselves, which they do.
        isolate: false,
        pool: "threads",
        reporters: [["default", { summary: false }]],
        slowTestThreshold: 5000,
        sequence: {
            concurrent: true,
        },
        testTimeout: 10000,
        setupFiles: ["./tests/setup.ts"],
        environment: "jsdom",
        exclude: [...configDefaults.exclude, "tests/e2e/**"],
    }
});
