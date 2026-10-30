/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import {
    stringifyPackedArrangement, tryParsePackedArrangement,
} from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { readStoredCurrentScore, routeApi } from "./e2e-test-helpers.js";

/** One bar holding nothing but a whole rest, so every entry shifts the rest to the right. */
const wholeRestSnapshot: IArrangementSnapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Staff Auto Extend",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
            subdivisions: [],
        }],
    }],
};

/**
 * Opens the staff view of the fixture in edit mode, in the insert entry mode the view starts with.
 *
 * @param page The page under test.
 * @param sessionId The session id, which keeps the stored settings of a spec apart.
 */
const openInEditMode = async (page: Page, sessionId: string): Promise<void> => {
    await routeApi(page);
    await page.addInitScript((data: { packed: string; sessionId: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(wholeRestSnapshot), sessionId });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

    await page.locator("#editModeButton").click({ force: true });
};

/**
 * Describes where the rest of the last rendered measure sits: its own centre and the centre of the viewport.
 *
 * @param page The page under test.
 *
 * @returns The horizontal centres in viewport coordinates, plus the current scroll position.
 */
const measureCentres = async (page: Page) => {
    return page.evaluate(() => {
        const host = document.querySelector<HTMLElement>("#trackViewerHost")!;
        const columns = [...document.querySelectorAll<HTMLElement>(".staff-measure-viewer")];
        const rest = columns.at(-1)?.querySelector<HTMLElement>(".staff-note-viewer-rest-symbol");
        const hostBox = host.getBoundingClientRect();
        const restBox = rest?.getBoundingClientRect();
        const centre = (box: DOMRect): number => {
            return Math.round(box.left + (box.width / 2));
        };

        return {
            columns: columns.length,
            scrollLeft: host.scrollLeft,
            viewportCentre: centre(hostBox),
            restCentre: restBox === undefined ? undefined : centre(restBox),
        };
    });
};

test.describe("staff entry at the end of the last measure", () => {
    test("adds the measure and centres the rest the cursor moved to", async ({ page }) => {
        await openInEditMode(page, "e2e-staff-auto-extend");

        const runs = page.locator(".staff-measure-track-row").first().locator(".staff-note-viewer-run");
        await runs.first().click();

        // The eighth value, then eight entries: the last one fills the bar, which adds the measure after it.
        await page.keyboard.press("Alt+4");
        for (let index = 0; index < 8; index++) {
            await page.keyboard.press("1");
        }

        await expect.poll(async () => {
            const stored = tryParsePackedArrangement(await readStoredCurrentScore(page));

            return stored?.timeParams.length;
        }).toBe(2);

        const stored = tryParsePackedArrangement(await readStoredCurrentScore(page))!;
        expect(stored.tracks[0].measures[0].events).toHaveLength(8);
        expect(stored.tracks[0].measures[1].events).toEqual([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } },
        ]);

        // The new measure is mounted by the re-render the entry caused, and the deferred scroll lands right after.
        await expect.poll(async () => {
            return (await measureCentres(page)).columns;
        }).toBe(2);

        // The whole rest is drawn in the middle of its measure, so a scroll that anchors the measure at the left
        // edge would leave it well right of the viewport middle.
        const centres = await measureCentres(page);
        expect(centres.restCentre).toBeDefined();
        expect(Math.abs((centres.restCentre ?? 0) - centres.viewportCentre)).toBeLessThan(80);
    });
});
