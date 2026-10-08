/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, IMeasureEvent } from "../../src/core/types/general.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

const meter = { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] };

const rangeToolButton = (page: Page, tooltip: string) => {
    return page.locator(`#rangeArticulationToolbarHost button[data-tooltip="${tooltip}"]`);
};

/** A point on the page, in viewport px. */
interface IPagePoint {
    x: number;
    y: number;
}

/** A box on the page, in viewport px. */
interface IPageBox extends IPagePoint {
    width: number;
    height: number;
}

/** Four quarter notes, which give a hairpin room to grow and to travel. */
const quarterEvents: IMeasureEvent[] = [0, 1, 2, 3].map((quarter) => {
    return {
        start: { numerator: quarter, denominator: 4 },
        duration: { numerator: 1, denominator: 4 },
        noteStyleId: "1",
    };
});

/** Two quarter notes and a half rest, which is where an f marking is dragged onto a rest. */
const eventsWithRest: IMeasureEvent[] = [
    { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
    { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
    { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
];

/**
 * @param events The events every measure holds.
 * @param bars The number of measures to build.
 *
 * @returns A snapshot with one track whose measures all hold those events.
 */
const snapshotOf = (events: IMeasureEvent[], bars = 3): IArrangementSnapshot => {
    return {
        version: arrangementSnapshotVersion,
        title: "E2E range articulations",
        timeParams: { timeSignature: "4/4", tempo: 120, length: bars, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 100,
            instrumentId: "0",
            measures: Array.from({ length: bars }, (entry, index) => {
                return {
                    number: index + 1,
                    meter,
                    events: events.map((event) => {
                        return { ...event };
                    }),
                    subdivisions: [],
                };
            }),
        }],
    };
};

/**
 * @param page The page under test.
 * @param snapshot The score to load.
 */
const seedScore = async (page: Page, snapshot: IArrangementSnapshot): Promise<void> => {
    await routeApi(page);
    await page.addInitScript((data: { packed: string; entryMode: number; }) => {
        const sessionId = "e2e-range-articulations";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * @param page The page under test.
 *
 * @returns Nothing, the notation toolbar is visible.
 */
const openToolbar = async (page: Page): Promise<void> => {
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#rangeArticulationToolbarHost .rangeArticulationToolbar")).toBeVisible();
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure.
 * @param selector The symbol to aim at, the noteheads or the rests of the row.
 * @param index The zero-based index of that symbol in the measure's first track row.
 *
 * @returns The point in the marking band below that symbol, which is where a marking is dropped.
 */
const bandPointOf = (page: Page, barNumber: number, selector: string, index: number): Promise<IPagePoint> => {
    return page.evaluate(({ bar, symbol, position }) => {
        const measure = document.querySelectorAll<HTMLElement>(".staff-measure-viewer")[bar - 1];
        const row = measure.querySelector<HTMLElement>(".staff-measure-track-row");
        const symbolElement = row?.querySelectorAll<HTMLElement>(symbol)[position];
        if (row === null || symbolElement === undefined) {
            throw new Error(`The measure ${bar} renders no ${symbol} at ${position}.`);
        }

        const symbolRect = symbolElement.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();

        // A marking stands in the band below its row, which is where the accent marks are placed.
        return { x: symbolRect.left + (symbolRect.width / 2), y: rowRect.bottom + 10 };
    }, { bar: barNumber, symbol: selector, position: index });
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure.
 * @param noteIndex The zero-based index of the note in the measure's first track row.
 *
 * @returns The point in the marking band below that note.
 */
const bandPointOfNote = (page: Page, barNumber: number, noteIndex: number): Promise<IPagePoint> => {
    return bandPointOf(page, barNumber, ".staff-note-head-symbol", noteIndex);
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure.
 * @param restIndex The zero-based index of the rest in the measure's first track row.
 *
 * @returns The point in the marking band below that rest.
 */
const bandPointOfRest = (page: Page, barNumber: number, restIndex: number): Promise<IPagePoint> => {
    return bandPointOf(page, barNumber, ".staff-note-viewer-rest-symbol", restIndex);
};

/**
 * @param page The page under test.
 *
 * @returns The box of the placed marking, measured in one go so a refresh between two calls cannot detach it.
 */
const markingBox = (page: Page): Promise<IPageBox | undefined> => {
    return page.evaluate(() => {
        const rect = document.querySelector<HTMLElement>(".range-articulation:not(.range-articulation-preview)")
            ?.getBoundingClientRect();
        if (rect === undefined) {
            return undefined;
        }

        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
};

/**
 * Loads a score, opens the notation toolbar and places one marking with a click.
 *
 * @param page The page under test.
 * @param snapshot The score to load.
 * @param tooltip The tooltip of the placing button to click.
 * @param barNumber The 1-based measure the marking is placed in.
 * @param noteIndex The note of that measure the click names.
 */
const placeMarking = async (page: Page, snapshot: IArrangementSnapshot, tooltip: string, barNumber: number,
    noteIndex: number): Promise<void> => {
    await seedScore(page, snapshot);
    await openToolbar(page);

    await rangeToolButton(page, tooltip).click();
    const point = await bandPointOfNote(page, barNumber, noteIndex);
    await page.mouse.click(point.x, point.y);

    // The click places the marking and ends the placing mode.
    await expect(page.locator("body")).not.toHaveClass(/range-articulation-mode/);
    await expect(page.locator(".range-articulation")).toHaveCount(1);
};

/**
 * @param page The page under test.
 * @param from The point the pointer grabs the marking at.
 * @param to The point the pointer drops it on.
 */
const dragMarking = async (page: Page, from: IPagePoint, to: IPagePoint): Promise<void> => {
    const box = await markingBox(page);
    if (box === undefined) {
        throw new Error("The marking has no box to grab.");
    }

    await page.mouse.move(from.x, box.y + (box.height / 2));
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();

    // The drop ends with the preview of the drag, so only the marking itself is left.
    await expect(page.locator(".range-articulation-preview")).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("places a hairpin on a clicked note and ends the placing mode", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    // The hairpin is drawn as the line geometry of the score, not as a stretched glyph.
    await expect(page.locator(".range-articulation svg")).toHaveCount(1);
});

test("ends the placing mode with escape, without placing anything", async ({ page }) => {
    await seedScore(page, snapshotOf(quarterEvents));
    await openToolbar(page);

    await rangeToolButton(page, "Draw crescendo / decrescendo hairpin").click();
    await expect(page.locator("body")).toHaveClass(/range-articulation-mode/);

    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/range-articulation-mode/);

    // The mode gave the pointer back, so the click now belongs to the score and places nothing.
    const point = await bandPointOfNote(page, 1, 0);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".range-articulation")).toHaveCount(0);
});

test("cancels the placing mode from its floating status", async ({ page }) => {
    await seedScore(page, snapshotOf(quarterEvents));
    await openToolbar(page);

    await rangeToolButton(page, "Place forte (f)").click();
    const modeStatus = page.locator(".rangeArticulationModeStatus");
    await expect(modeStatus).toContainText("Click a note or rest to place forte");

    await modeStatus.getByRole("button", { name: "Cancel" }).click();

    await expect(page.locator("body")).not.toHaveClass(/range-articulation-mode/);
    await expect(page.locator(".range-articulation")).toHaveCount(0);
    await expect(modeStatus).not.toBeVisible();
});

test("shows the handles of the selected marking and hands the selection back to the score", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    await page.locator(".range-articulation").click();
    await expect(page.locator(".range-articulation-handle")).toHaveCount(2);

    // A marking and a score selection are alternatives, so selecting a note takes the handles away.
    await page.locator(".staff-measure-viewer").first().locator(".staff-note-head-symbol").nth(1).click();
    await expect(page.locator(".range-articulation-handle")).toHaveCount(0);
});

test("deletes the selected marking and leaves its notes alone", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    await page.locator(".range-articulation").click();
    await page.keyboard.press("Delete");

    await expect(page.locator(".range-articulation")).toHaveCount(0);
    await expect(page.locator(".staff-measure-viewer").first().locator(".staff-note-viewer-note-run"))
        .toHaveCount(4);
});

test("grows a hairpin when its end handle is dragged to a later note", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    const marking = page.locator(".range-articulation");
    await marking.click();

    const before = await markingBox(page);
    const handle = await page.locator('.range-articulation-handle[data-end="to"]').boundingBox();
    const target = await bandPointOfNote(page, 1, 3);
    if (before === undefined || handle === null) {
        throw new Error("The selected hairpin shows no end handle.");
    }

    await page.mouse.move(handle.x + (handle.width / 2), handle.y + (handle.height / 2));
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".range-articulation-preview")).toHaveCount(0);

    // The end followed the pointer to the last note of the bar, so the hairpin became wider.
    await expect.poll(async () => {
        return (await markingBox(page))?.width ?? 0;
    }).toBeGreaterThan(before.width + 20);
});

test("moves a hairpin as a whole when its body is dragged", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    const marking = page.locator(".range-articulation");
    await marking.click();

    const before = await markingBox(page);
    const first = await bandPointOfNote(page, 1, 0);
    const second = await bandPointOfNote(page, 1, 1);
    const target = await bandPointOfNote(page, 1, 3);
    if (before === undefined) {
        throw new Error("The selected hairpin has no box.");
    }

    // The pointer grabs the hairpin between its two notes and drops it on the fourth one.
    await dragMarking(page, { x: (first.x + second.x) / 2, y: 0 }, target);

    const after = await markingBox(page);
    if (after === undefined) {
        throw new Error("The hairpin disappeared while it was moved.");
    }

    // The hairpin travelled to the notes the pointer named instead of growing from one of its ends: a resize would
    // have stretched it by the two notes between its old place and the drop.
    expect(after.x).toBeGreaterThan(before.x + 20);
    expect(Math.abs(after.width - before.width)).toBeLessThan(100);
});

test("leaves a hairpin untouched when the drag is cancelled", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    const marking = page.locator(".range-articulation");
    await marking.click();

    const before = await markingBox(page);
    const first = await bandPointOfNote(page, 1, 0);
    const second = await bandPointOfNote(page, 1, 1);
    const target = await bandPointOfNote(page, 1, 3);
    if (before === undefined) {
        throw new Error("The selected hairpin has no box.");
    }

    await page.mouse.move((first.x + second.x) / 2, before.y + (before.height / 2));
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });

    // Escape ends the drag of its own, so the marking stays where the model has it.
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".range-articulation-preview")).toHaveCount(0);

    const after = await markingBox(page);
    if (after === undefined) {
        throw new Error("The hairpin disappeared while the drag was cancelled.");
    }

    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.width - before.width)).toBeLessThan(2);
});

test("places an f marking and drags it onto a rest", async ({ page }) => {
    await placeMarking(page, snapshotOf(eventsWithRest), "Place forte (f)", 1, 1);

    const marking = page.locator(".range-articulation");
    await marking.click();

    const before = await markingBox(page);
    const rest = await bandPointOfRest(page, 1, 0);
    if (before === undefined) {
        throw new Error("The selected f marking has no box.");
    }

    // An f may sit on a rest, so the drag takes it off the note it was placed on.
    await dragMarking(page, { x: before.x + (before.width / 2), y: 0 }, rest);

    const after = await markingBox(page);
    if (after === undefined) {
        throw new Error("The f marking disappeared while it was moved.");
    }

    expect(Math.abs(after.x - before.x)).toBeGreaterThan(10);
});

test("clears the marking selection with escape", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);

    await page.locator(".range-articulation").click();
    await expect(page.locator(".range-articulation-handle")).toHaveCount(2);

    // Escape takes the selection back from the marking, the way it does from the notes.
    await page.keyboard.press("Escape");
    await expect(page.locator(".range-articulation-handle")).toHaveCount(0);
    await expect(page.locator(".range-articulation")).toHaveCount(1);
});

test("removes a hairpin when its anchor note is deleted", async ({ page }) => {
    await placeMarking(page, snapshotOf(quarterEvents), "Draw crescendo / decrescendo hairpin", 1, 0);
    await expect(page.locator(".range-articulation")).toHaveCount(1);

    // Delete the note the hairpin starts on; the marking loses its anchor and goes with it.
    await page.locator(".staff-measure-viewer").first().locator(".staff-note-head-symbol").first().click();
    await page.keyboard.press("Delete");

    await expect(page.locator(".range-articulation")).toHaveCount(0);
});
