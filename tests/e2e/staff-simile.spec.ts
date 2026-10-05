/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import type { IArrangementSnapshot, ITrackPieceSnapshot } from "../../src/core/types/general.js";
import { routeApi, selectTrackPiece, toolbarButton } from "./e2e-test-helpers.js";

const meter = { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] };

/** A bar holding a quarter note and a rest. */
const notePiece: ITrackPieceSnapshot = {
    number: 1,
    meter,
    events: [
        { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
        { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
    ],
    subdivisions: [],
};

/** A bar holding nothing but a whole rest. */
const restPiece: ITrackPieceSnapshot = {
    number: 2,
    meter,
    events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
    subdivisions: [],
};

/**
 * @param measures The two bars of the score.
 *
 * @returns The snapshot that carries them.
 */
const snapshotWith = (measures: ITrackPieceSnapshot[]): IArrangementSnapshot => {
    return {
        version: arrangementSnapshotVersion,
        title: "E2E One-bar repeat",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 2, pulse: "1/4", stepResolution: 16 },
        tracks: [{ id: 200, instrumentId: "0", measures }],
    };
};

/**
 * Loads a score into the app through the session settings the app restores on start.
 *
 * @param page The page under test.
 * @param score The score to load, in the packed storage format.
 */
const seedScore = async (page: Page, score: IArrangementSnapshot): Promise<void> => {
    await routeApi(page);
    await page.addInitScript((data: { packed: string; entryMode: number; }) => {
        const sessionId = "e2e-one-bar-repeat";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(score), entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure number.
 *
 * @returns The rendered measure column.
 */
const staffBar = (page: Page, barNumber: number): Locator => {
    return page.locator(".staff-measure-viewer").nth(barNumber - 1);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("draws the one-bar repeat mark in place of the notes", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, { ...restPiece, simile: true }]));

    const bar = staffBar(page, 2);
    const mark = bar.locator(".staff-note-viewer-simile");

    await expect(mark).toBeVisible();
    await expect(mark.locator("text")).toHaveText(String.fromCodePoint(0xE500));
    await expect(bar.locator(".staff-note-viewer-note-run")).toHaveCount(0);
});

test("keeps a mark the snapshot puts on the first measure off", async ({ page }) => {
    await seedScore(page, snapshotWith([{ ...notePiece, simile: true }, restPiece]));

    const bar = staffBar(page, 1);
    await expect(bar.locator(".staff-note-viewer-simile")).toHaveCount(0);
    await expect(bar.locator(".staff-note-viewer-note-run")).toHaveCount(1);
});

test("does not offer the mark for a note selection", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, restPiece]));

    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .subdivisionToolbarHost")).toBeVisible();

    await staffBar(page, 1).locator(".staff-note-head-symbol").first().click();

    await expect(toolbarButton(page, "One-bar repeat (simile)")).toBeDisabled();
});

test("sets the mark on a track piece and clears it again", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, restPiece]));

    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .subdivisionToolbarHost")).toBeVisible();

    await selectTrackPiece(page, 2);

    const repeat = toolbarButton(page, "One-bar repeat (simile)");
    await expect(repeat).toBeEnabled();
    await repeat.click({ force: true });

    const mark = staffBar(page, 2).locator(".staff-note-viewer-simile");
    await expect(mark).toBeVisible();

    // The toggle clears the mark again, which leaves the piece empty rather than restoring its content.
    await repeat.click({ force: true });
    await expect(mark).toHaveCount(0);
});

test("keeps the mark off a track piece of the first measure", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, restPiece]));

    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .subdivisionToolbarHost")).toBeVisible();

    await selectTrackPiece(page, 1);

    await expect(toolbarButton(page, "One-bar repeat (simile)")).toBeDisabled();
});
