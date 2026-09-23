/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import {
    stringifyPackedArrangement, tryParsePackedArrangement,
} from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, IMeasureEvent, ITrackSnapshot } from "../../src/core/types/general.js";
import { readStoredCurrentScore, routeApi } from "./e2e-test-helpers.js";

/** Four beamed sixteenths, a quarter rest, then eight sixteenths. */
const mixedBarSnapshot: IArrangementSnapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Staff Insert",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [
                ...Array.from({ length: 4 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
                { start: { numerator: 4, denominator: 16 }, duration: { numerator: 4, denominator: 16 } },
                ...Array.from({ length: 8 }, (_, index) => {
                    return {
                        start: { numerator: 8 + index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
            ],
            subdivisions: [],
        }],
    }],
};

/**
 * Opens the staff view with the given arrangement, in edit mode.
 *
 * @param page The page under test.
 * @param snapshot The arrangement to open.
 * @param sessionId The session id, which keeps the stored settings of a spec apart.
 */
const openInEditMode = async (page: Page, snapshot: IArrangementSnapshot, sessionId: string): Promise<void> => {
    await routeApi(page);
    await page.addInitScript((data: { packed: string; sessionId: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), sessionId });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .noteLengthToolbar")).toBeVisible();
};

/**
 * Describes a measure's events as "start+duration:style" entries.
 *
 * @param events The events to describe.
 *
 * @returns One entry per event, in measure order.
 */
const eventList = (events: IMeasureEvent[]): string[] => {
    return events.map((event) => {
        const start = `${event.start.numerator}/${event.start.denominator}`;
        const duration = `${event.duration.numerator}/${event.duration.denominator}`;

        return `${start}+${duration}:${event.noteStyleId ?? "-"}`;
    });
};

/**
 * Reads the track of the stored score.
 *
 * @param page The page under test.
 *
 * @returns The stored track snapshot.
 */
const storedTrack = async (page: Page): Promise<ITrackSnapshot> => {
    const stored = tryParsePackedArrangement(await readStoredCurrentScore(page));

    return stored!.tracks[0];
};

test.describe("staff insert mode", () => {
    test.beforeEach(async ({ page }) => {
        await openInEditMode(page, mixedBarSnapshot, "e2e-staff-insert");
    });

    test("writes a second note behind the first instead of in front of it", async ({ page }) => {
        const runs = page.locator(".staff-measure-track-row").first().locator(".staff-note-viewer-run");
        await expect(runs).toHaveCount(13);

        // Put the cursor on the quarter rest between the two beamed groups and write a quarter there.
        await runs.nth(4).click();
        await page.keyboard.press("1");

        // The next entry takes a half and follows the quarter, so both lengths tell them apart.
        await page.keyboard.press("Alt+2");
        await page.keyboard.press("1");

        await expect.poll(async () => {
            return eventList((await storedTrack(page)).measures[0].events);
        }).toEqual([
            "0/1+1/16:1",
            "1/16+1/16:1",
            "1/8+1/16:1",
            "3/16+1/16:1",
            "1/4+1/4:1",
            "1/2+1/2:1",
        ]);

        // The notes behind the entries were not replaced, they moved into the measure that grew for them.
        await expect.poll(async () => {
            return (await storedTrack(page)).measures.length;
        }).toBe(2);
        await expect.poll(async () => {
            return eventList((await storedTrack(page)).measures[1].events);
        }).toEqual([
            "0/1+1/4:-",
            "1/4+1/16:1",
            "5/16+1/16:1",
            "3/8+1/16:1",
            "7/16+1/16:1",
            "1/2+1/16:1",
            "9/16+1/16:1",
            "5/8+1/16:1",
            "11/16+1/16:1",
            "3/4+1/4:-",
        ]);
    });

    test("removes the addressed element with the delete key and pulls the rest left", async ({ page }) => {
        const runs = page.locator(".staff-measure-track-row").first().locator(".staff-note-viewer-run");
        await expect(runs).toHaveCount(13);

        // The cursor sits on the quarter rest; the delete key removes it together with its length.
        await runs.nth(4).click();
        await page.keyboard.press("Delete");

        await expect(runs).toHaveCount(13);
        await expect(runs.nth(4).locator(".staff-note-viewer-note-symbol")).toHaveCount(1);

        await expect.poll(async () => {
            return eventList((await storedTrack(page)).measures[0].events);
        }).toEqual([
            "0/1+1/16:1",
            "1/16+1/16:1",
            "1/8+1/16:1",
            "3/16+1/16:1",
            "1/4+1/16:1",
            "5/16+1/16:1",
            "3/8+1/16:1",
            "7/16+1/16:1",
            "1/2+1/16:1",
            "9/16+1/16:1",
            "5/8+1/16:1",
            "11/16+1/16:1",
            "3/4+1/4:-",
        ]);
    });
    test("draws no selection rectangle while the pointer drags across the bar", async ({ page }) => {
        const row = page.locator(".staff-measure-track-row").first();
        const box = await row.boundingBox();
        expect(box).not.toBeNull();

        await page.mouse.move(box!.x + 4, box!.y + 4);
        await page.mouse.down();
        await page.mouse.move(box!.x + box!.width - 4, box!.y + box!.height - 4, { steps: 8 });
        await page.mouse.up();

        // Insert mode holds only the cursor, so a drag selects neither notes nor groups.
        await expect(row.locator(".staff-note-viewer-run.note-selected")).toHaveCount(0);
        await expect(page.locator(".selection-rect")).toHaveCount(0);
        await expect(page.locator(".selection-overlay")).toHaveCount(0);
    });
});

test.describe("staff entry mode switch", () => {
    test.beforeEach(async ({ page }) => {
        await openInEditMode(page, mixedBarSnapshot, "e2e-staff-entry-mode");
    });

    test("marks the values of the selection the mode switches to", async ({ page }) => {
        const runs = page.locator(".staff-measure-track-row").first().locator(".staff-note-viewer-run");
        const marked = page.locator(".noteLengthToolbar .noteLengthButton.du-btn-primary");

        await runs.nth(0).click();

        // Insert mode marks the value the next entry uses, not what the cursor addresses.
        await expect(marked).toHaveAttribute("data-tooltip", /Quarter note/);

        await page.locator("label.entryModeButton").click({ force: true });
        await expect(page.locator("#entryModeButton")).toBeChecked();

        // The bar now shows what the selection carries, which is the addressed sixteenth.
        await expect(marked).toHaveAttribute("data-tooltip", /Sixteenth note/);
    });
});
