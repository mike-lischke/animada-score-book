/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { test } from "@playwright/test";

import {
    beijaFlorImportPath, ensureGridMode, expectGridBarSignature, expectGridBarDomSnapshot,
    expectGridModePolyrhythmNotes, expectImportedPolyrhythmSong, expectPlaybackToMove, type IBarTrackGridSignature,
    routeApi,
} from "./helpers.js";

const beijaFlorBar3GridSignature: IBarTrackGridSignature[] = [
    { baseCount: 16, basePattern: "x--xx-x-x-x-x---", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "xxxxxxxxxxxxxxxx", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "----------------", fragmentCount: 1, fragmentPatterns: ["xxxxxxxxxxxx"] },
    { baseCount: 16, basePattern: "xxxxxxxxxxxxxxxx", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "xxxxxxxxxxxxxxxx", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "x---x-x-x---xx-x", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "x---x---x---x---", fragmentCount: 0, fragmentPatterns: [] },
    { baseCount: 16, basePattern: "x---x---x---x---", fragmentCount: 0, fragmentPatterns: [] },
];

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("BananaDrum polyrhythm import", () => {
    test("loads the imported song title and polyrhythm fragments", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
    });

    test("plays the imported polyrhythm song", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
        await expectPlaybackToMove(page);
    });

    test("shows regular and polyrhythm notes in grid mode", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
        await ensureGridMode(page);
        await expectGridModePolyrhythmNotes(page);
        await expectGridBarSignature(page, 3, beijaFlorBar3GridSignature);
        await expectGridBarDomSnapshot(
            page,
            3,
            "./polyrhythm-bananadrum-import.spec.ts-snapshots/beija-flor-bar-3-grid-dom.txt"
        );
    });
});
