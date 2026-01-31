import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        logHeapUsage: true,
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
    }
});
