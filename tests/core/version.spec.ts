/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import packageJson from "../../package.json";

describe("App version", () => {
    it("is injected from package.json at build time", () => {
        expect(appVersion).toBe(packageJson.version);
    });

    it("follows semantic versioning", () => {
        expect(appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
});
