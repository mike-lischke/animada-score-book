/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { tryParsePackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import {
    beijaFlorImportPath, beijaFlorTitle, beijaFlorDisplayedTitle, expectImportedPolyrhythmSong, expectPlaybackToMove,
    readStoredCurrentScore, routeApi,
} from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Snapshot compatibility polyrhythm flow", () => {
    test("reloads the imported song from persisted snapshot state", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        const storedCurrentScore = await readStoredCurrentScore(page);
        const storedSnapshot = tryParsePackedArrangement(storedCurrentScore);
        expect(storedSnapshot).toBeDefined();

        expect(storedSnapshot!.version).toBe(4);
        expect(storedSnapshot!.title).toBe(beijaFlorTitle);
        expect(storedSnapshot!.title).not.toBe(beijaFlorDisplayedTitle);
        expect(Array.isArray(storedSnapshot!.tracks)).toBeTruthy();
        expect(storedSnapshot!.tracks.length).toBeGreaterThan(0);

        await page.goto("/");

        await expectImportedPolyrhythmSong(page);
    });

    test("plays the persisted snapshot song without the import URL", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);
        await readStoredCurrentScore(page);

        await page.goto("/");

        await expectImportedPolyrhythmSong(page);
        await expectPlaybackToMove(page);
    });
});
