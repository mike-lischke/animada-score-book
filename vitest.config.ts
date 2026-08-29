import { configDefaults, defineConfig } from "vitest/config";

import packageJson from "./package.json";

export default defineConfig({
    define: {
        appVersion: JSON.stringify(packageJson.version),
    },
    test: {
        logHeapUsage: true,
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
