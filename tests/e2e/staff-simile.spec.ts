/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode, TrackViewMode } from "../../src/core/types/general.js";
import type { IArrangementSnapshot, ITrackPieceSnapshot } from "../../src/core/types/general.js";
import {
    findStaffMeasure, readStoredCurrentScore, routeApi, selectTrackPiece, showEntryMode, showTrackView, toolbarButton,
} from "./e2e-test-helpers.js";

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
        timeParams: { timeSignature: "4/4", tempo: 120, length: measures.length, pulse: "1/4", stepResolution: 16 },
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
    return page.locator(".staff-measure-viewer").filter({
        has: page.locator(".staff-measure-number", { hasText: new RegExp(`^${barNumber}$`) }),
    });
};

/**
 * @param page The page under test.
 *
 * @returns The tray of the track-piece popup's card.
 */
const pieceTray = (page: Page): Locator => {
    return page.locator("#selectionEditPopup .selection-toolbar-actions");
};

/**
 * Resolves an action of the track-piece popup by the tooltip that names it, the way `toolbarButton` does it for
 * the subdivision toolbar.
 *
 * @param page The page under test.
 * @param tooltip The tooltip the button carries.
 *
 * @returns The action button.
 */
const pieceAction = (page: Page, tooltip: string): Locator => {
    return page.locator(`#selectionEditPopup .selection-toolbar-action[title="${tooltip}"]`);
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

    await page.locator("#editModeButton").click({ force: true });

    await staffBar(page, 1).locator(".staff-note-head-symbol").first().click();

    // A note selection carries the note tools, so the track-piece card and its mark are absent.
    await expect(page.locator("#selectionEditPopup .subdivision-toolbar")).toBeVisible();

    await expect(toolbarButton(page, "One-bar repeat (simile)")).toHaveCount(0);
    await expect(pieceAction(page, "One-bar repeat (simile)")).toHaveCount(0);
});

test("sets the mark on a track piece and clears it again", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, restPiece]));

    await page.locator("#editModeButton").click({ force: true });

    await selectTrackPiece(page, 2);

    // The card names the addressed piece and holds its two actions in one tray, which stays uncaptioned.
    const instrumentName = await page.locator(".track-instrument-name").first().textContent();
    await expect(pieceTray(page)).toBeVisible();
    await expect(page.locator("#selectionEditPopup .selection-toolbar-instrument"))
        .toHaveText(instrumentName!.trim());
    await expect(page.locator("#selectionEditPopup .selection-toolbar-position")).toHaveText("Bar 2");
    await expect(pieceTray(page).locator(".selection-toolbar-action")).toHaveCount(2);
    await expect(page.locator("#selectionEditPopup .selection-toolbar-section")).toHaveCount(0);

    const repeat = pieceAction(page, "One-bar repeat (simile)");
    await expect(repeat).toBeEnabled();
    await repeat.click({ force: true });

    const mark = staffBar(page, 2).locator(".staff-note-viewer-simile");
    await expect(mark).toBeVisible();

    // The score mutation replaces the popup's rendered anchor, so selecting the track piece again opens its card.
    await selectTrackPiece(page, 2);
    await expect(pieceTray(page)).toBeVisible();

    // The toggle clears the mark again, which leaves the piece empty rather than restoring its content.
    await pieceAction(page, "One-bar repeat (simile)").click({ force: true });
    await expect(mark).toHaveCount(0);
});

test("keeps the mark off a track piece of the first measure", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, restPiece]));

    await page.locator("#editModeButton").click({ force: true });

    await selectTrackPiece(page, 1);
    await expect(pieceTray(page)).toBeVisible();

    await expect(pieceAction(page, "Simile is not applicable in the first bar")).toBeDisabled();
});

for (const view of [TrackViewMode.Grid, TrackViewMode.Staff]) {
    test(`navigates through consecutive similes and scrolls in ${view} view`, async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 800 });
        await seedScore(page, snapshotWith([
            notePiece, { ...restPiece, simile: true }, { ...restPiece, number: 3, simile: true },
            { ...notePiece, number: 4 },
        ]));
        await showTrackView(page, view);

        const rowClass = view === TrackViewMode.Grid ? ".grid-measure-row" : ".staff-measure-track-row";
        const firstBar = view === TrackViewMode.Grid ? page.locator(".grid-measure-viewer").first() : staffBar(page, 1);
        const lastEvent = view === TrackViewMode.Grid
            ? firstBar.locator(".note-viewer").last() : firstBar.locator(".staff-note-viewer-rest-symbol");
        await lastEvent.click();
        const before = await page.locator("#trackViewerHost").evaluate((host) => {
            return host.scrollLeft;
        });

        for (const barNumber of [2, 3]) {
            await page.keyboard.press("ArrowRight");
            const bar = view === TrackViewMode.Grid
                ? page.locator(".grid-measure-viewer").nth(barNumber - 1) : staffBar(page, barNumber);
            await expect.poll(async () => {
                const row = await bar.locator(rowClass).boundingBox();
                const overlay = await page.locator(".selection-overlay").first().boundingBox();

                return row && overlay ? Math.abs(row.x - overlay.x) : Infinity;
            }).toBeLessThan(5);
            await expect.poll(async () => {
                return page.locator("#trackViewerHost").evaluate((host) => {
                    return host.scrollLeft;
                });
            }).toBeGreaterThan(before);
        }

        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".selection-cursor")).toBeVisible();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        const secondBar = view === TrackViewMode.Grid
            ? page.locator(".grid-measure-viewer").nth(1) : staffBar(page, 2);
        await expect.poll(async () => {
            const row = await secondBar.locator(rowClass).boundingBox();
            const overlay = await page.locator(".selection-overlay").first().boundingBox();

            return row && overlay ? Math.abs(row.x - overlay.x) : Infinity;
        }).toBeLessThan(5);
    });

    test(`shows the played simile content only during playback in ${view} view`, async ({ page }) => {
        await page.setViewportSize({ width: 2800, height: 800 });
        const score = snapshotWith([notePiece, { ...restPiece, simile: true }, {
            ...restPiece, number: 3, simile: true,
        }]);
        score.timeParams.tempo = 30;
        await seedScore(page, score);
        await showTrackView(page, view);
        const stored = await readStoredCurrentScore(page);
        const mark = view === TrackViewMode.Grid ? ".grid-simile-overlay" : ".staff-note-viewer-simile";
        await expect(page.locator(mark)).toHaveCount(2);

        await page.getByTitle("Play the score", { exact: true }).click();
        const previews = page.locator(".simile-playback-preview");
        await expect(previews).toHaveCount(2);
        await expect(page.locator(mark)).toHaveCount(0);
        if (view === TrackViewMode.Staff) {
            await expect(previews.first().locator(".staff-note-head")).toHaveCount(1);
            await expect(previews.first().locator(".staff-note-viewer-rest-symbol")).toHaveCount(1);
            await expect(previews.first().locator(".staff-note-viewer-runs")).toHaveCSS("opacity", "0.6");
        } else {
            await expect(previews.first().locator(".note-viewer")).toHaveCount(16);
            await expect(previews.first().locator(".note-viewer").first()).toHaveCSS("opacity", "0.6");
        }

        await page.getByTitle("Stop playback", { exact: true }).click();
        await expect(previews).toHaveCount(0);
        await expect(page.locator(mark)).toHaveCount(2);
        expect(await readStoredCurrentScore(page)).toBe(stored);
    });
}

test("places the insert cursor on a clicked simile without selecting a note", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, { ...restPiece, simile: true }]));
    await page.locator("#editModeButton").click({ force: true });
    await showEntryMode(page, "insert");
    const bar = await findStaffMeasure(page, 2);
    await bar.locator(".staff-note-viewer-simile text").click();

    await expect(page.locator(".selection-cursor")).toBeVisible();
    await expect(page.locator(".selection-overlay")).toHaveCount(0);
    const cursor = await page.locator(".selection-cursor").boundingBox();
    const glyph = await bar.locator(".staff-note-viewer-simile svg").boundingBox();
    expect(cursor).toBeDefined();
    expect(glyph).toBeDefined();
    expect(Math.abs(cursor!.x - glyph!.x)).toBeLessThan(10);
});

test("rejects note and rest input at a simile insert cursor without changing the score", async ({ page }) => {
    await seedScore(page, snapshotWith([notePiece, { ...restPiece, simile: true }]));
    await page.locator("#editModeButton").click({ force: true });
    await showEntryMode(page, "insert");
    const bar = await findStaffMeasure(page, 2);
    await bar.locator(".staff-note-viewer-simile text").click();
    const stored = await readStoredCurrentScore(page);

    for (const key of ["1", "0"]) {
        await page.keyboard.press(key);
        await expect(page.getByText("Delete the simile before entering notes or rests.").first()).toBeVisible();
        await expect(bar.locator(".staff-note-viewer-simile")).toBeVisible();
        expect(await readStoredCurrentScore(page)).toBe(stored);
    }
});
