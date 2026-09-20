/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Two quarter notes followed by a rest, so a subdivision has room in the bar. */
const snapshot = {
    version: 4,
    title: "E2E Staff Subdivision",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [
                {
                    start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1"
                },
                {
                    start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1"
                },
                { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
            ],
            subdivisions: [],
        }],
    }],
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-staff-subdivision";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, stringifyPackedArrangement(snapshot));

    await page.goto("/");
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .subdivisionToolbar")).toBeVisible();
});

test("creates a subdivision from the notes selected in the staff view", async ({ page }) => {
    await page.locator(".staff-measure-track-row .staff-note-viewer-note-symbol").first().click();
    const runsBefore = await page.locator(".staff-note-viewer-run").count();

    await page.locator(".subdivisionToolbar button").click();
    const quadruplet = page.locator(".subdivisionToolbar .du-dropdown li", { hasText: "Quadruplet" }).locator("a");

    // A quarter note is four grid steps long, so a 4:1 split must be offered for it.
    await expect(quadruplet).toBeVisible();
    await quadruplet.click({ force: true });

    // The quarter note becomes the subdivision's four slots, so the measure holds three runs more.
    await expect.poll(() => {
        return page.locator(".staff-note-viewer-run").count();
    }).toBe(runsBefore + 3);
});

test("applies a length to a note beside a subdivision", async ({ page }) => {
    await page.locator(".staff-measure-track-row .staff-note-viewer-note-symbol").first().click();
    await page.locator(".subdivisionToolbar button").click();
    const quadruplet = page.locator(".subdivisionToolbar .du-dropdown li", { hasText: "Quadruplet" }).locator("a");
    await quadruplet.click({ force: true });

    // The quarter note behind the subdivision is an event of its own, so it takes a new length even
    // though its track holds a subdivision. The marks come from the model, so the dot only lights up
    // when the edit really reached it.
    const noteSymbols = page.locator(".staff-measure-track-row .staff-note-viewer-note-symbol");
    await expect(noteSymbols).toHaveCount(2);
    await noteSymbols.nth(1).click();
    await expect(page.locator(".noteLengthToolbar .noteLengthButton").first()).toBeEnabled();

    await page.locator(".noteLengthToolbar .noteDotButton").click();

    await expect(page.locator(".noteLengthToolbar .noteDotButton.du-btn-primary")).toBeVisible();
});
