/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode, type IArrangementSnapshot, type ITrackPieceSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

const meter = { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] };

/** A bar holding nothing but a whole rest, so a click on the staff addresses the track piece. */
const restPiece: ITrackPieceSnapshot = {
    number: 1,
    meter,
    events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
    subdivisions: [],
};

/** Two tracks of one bar, so the staff view renders two rows with a gap between their staffs. */
const twoTrackSnapshot: IArrangementSnapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Two Staff Rows",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [
        { id: 200, instrumentId: "a", measures: [restPiece] },
        { id: 201, instrumentId: "a", measures: [restPiece] },
    ],
};

/**
 * Loads a score into the app in the staff view.
 *
 * @param page The page under test.
 * @param snapshot The arrangement to open.
 * @param sessionId The session id, which keeps the stored settings of a spec apart.
 */
const openStaffScore = async (page: Page, snapshot: IArrangementSnapshot, sessionId: string): Promise<void> => {
    await page.addInitScript((data: { packed: string; sessionId: string; entryMode: number; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), sessionId, entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").nth(1)).toBeVisible();
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("clicking the margin below a track piece selects that piece", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-track-margin");

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // In the first piece's bottom margin, away from the centred rest glyph.
    await page.mouse.click(first!.x + (first!.width * 0.15), first!.y + first!.height + 10);

    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);

    // The rect reaches through the bottom margin but stops at the next piece's top edge.
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y - first!.y)).toBeLessThanOrEqual(2);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(first!.y + first!.height + 18);
    expect(box!.y + box!.height).toBeLessThanOrEqual(second!.y + 2);
});

test("clicking the edge between two track pieces selects the later piece only", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-track-seam");

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // The first piece ends where the second begins: the first row plus its bottom margin. The click rect
    // reaches into both, so only one of them may win. Away from the centred rest glyph.
    await page.mouse.click(first!.x + (first!.width * 0.15), second!.y);

    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);

    // Only the second piece is selected, the one the click's centre sits in.
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y - second!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs((box!.y + box!.height) - (second!.y + second!.height + 20))).toBeLessThanOrEqual(3);
});

test("clicking just below a track piece's top edge selects the track piece", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-track-top");

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    await page.mouse.click(first!.x + (first!.width / 2), first!.y + 4);

    // The track-piece rect covers the row and its bottom margin, not the measure.
    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y - first!.y)).toBeLessThanOrEqual(2);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(first!.y + first!.height + 18);
    expect(box!.y + box!.height).toBeLessThanOrEqual(second!.y + 2);
});

test("clicking above a staff selects the measure, not the track piece", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-track-above");

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // In the measure's head room, just above the first row's top edge.
    await page.mouse.click(first!.x + (first!.width / 2), first!.y - 5);

    // The measure rect goes from the first piece's top edge to the last piece's bottom edge, the bottom
    // margin of the last row included.
    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y - first!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs((box!.y + box!.height) - (second!.y + second!.height + 20))).toBeLessThanOrEqual(3);
});

test("the playhead spans exactly the height of the measure rect", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-playhead");

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    expect(first).not.toBeNull();

    // Select the whole measure through its head room.
    await page.mouse.click(first!.x + (first!.width / 2), first!.y - 5);

    const overlay = await page.locator(".selection-overlay").boundingBox();
    // The beam is hidden while no playback runs, so its rect is read straight from the DOM.
    const beam = await page.locator("#playBeam").evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    expect(overlay).not.toBeNull();

    // The overlay's 1px border extends one px past its content box on either side.
    expect(Math.abs(beam.y - (overlay!.y + 1))).toBeLessThanOrEqual(2);
    expect(Math.abs((beam.y + beam.height) - (overlay!.y + overlay!.height - 1))).toBeLessThanOrEqual(2);
});

test("a track-piece overlay reaches past the barline closing the staff", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-track-reach");

    const row = page.locator(".staff-measure-track-row").first();
    const rowBox = await row.boundingBox();
    const lineBox = await row.locator(".staff-note-viewer-line").first().boundingBox();
    expect(rowBox).not.toBeNull();
    expect(lineBox).not.toBeNull();

    await row.click({
        position: {
            x: Math.round(rowBox!.width * 0.15),
            y: Math.round(lineBox!.y - rowBox!.y + (lineBox!.height / 2)),
        },
    });

    const overlay = page.locator(".selection-overlay");
    await expect(overlay).toHaveCount(1);

    // The overlay reaches its own 2px inset plus 3px past the row, and its border adds one more px.
    const overlayBox = await overlay.boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox!.x + overlayBox!.width).toBeGreaterThanOrEqual(rowBox!.x + rowBox!.width + 5);
});

test("the clear button of a measure selection stays inside the overlay container", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-measure-clear");

    await page.locator("#editModeButton").click({ force: true });

    const rows = page.locator(".staff-measure-track-row");
    const first = await rows.nth(0).boundingBox();
    expect(first).not.toBeNull();

    // In the measure's head room, above the first staff: a measure selection in both the old and the new bounds.
    await page.mouse.click(first!.x + (first!.width / 2), first!.y - 20);

    const popup = page.locator("#selectionEditPopup");
    const button = popup.locator(".selectionDeleteButton");
    await expect(popup).toBeVisible();
    await expect(button).toBeVisible();

    const buttonBox = await button.boundingBox();
    const containerBox = await popup.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    expect(buttonBox!.y).toBeGreaterThanOrEqual(containerBox!.y);
});

test("the measure overlay starts where the track-piece overlay starts", async ({ page }) => {
    await openStaffScore(page, twoTrackSnapshot, "e2e-staff-measure-inset");

    const row = page.locator(".staff-measure-track-row").first();
    const rowBox = (await row.boundingBox())!;
    const overlay = page.locator(".selection-overlay");

    // A click inside the staff, away from the centred rest glyph, selects the track piece.
    await page.mouse.click(rowBox.x + (rowBox.width * 0.15), rowBox.y + (rowBox.height / 2));
    await expect(overlay).toHaveCount(1);
    const pieceBox = (await overlay.boundingBox())!;

    // A click in the measure's head room selects the whole measure.
    await page.mouse.click(rowBox.x + (rowBox.width / 2), rowBox.y - 5);
    await expect(overlay).toHaveCount(1);
    const measureBox = (await overlay.boundingBox())!;

    // Both overlays take their left edge from the staff rows, so the measure overlay keeps clear of the
    // time signature in the column's padding.
    expect(Math.abs(measureBox.x - pieceBox.x)).toBeLessThanOrEqual(2);
});
