/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    const snapshot = {
        version: 4,
        title: "E2E Grid Two-Step Note",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 200,
            instrumentId: "0",
            measures: [{
                number: 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [
                    { start: { numerator: 0, denominator: 16 }, duration: { numerator: 1, denominator: 16 } },
                    {
                        start: { numerator: 1, denominator: 16 },
                        duration: { numerator: 2, denominator: 16 },
                        noteStyleId: "1",
                    },
                    { start: { numerator: 3, denominator: 16 }, duration: { numerator: 13, denominator: 16 } },
                ],
                subdivisions: [],
            }],
        }],
    };

    await page.addInitScript((snapshotPacked: string) => {
        const sessionId = "e2e-grid-two-step-note";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: snapshotPacked,
        }));
    }, stringifyPackedArrangement(snapshot));
    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();
});

test("clicking a trailing cell of a spanning note selects that cell", async ({ page }) => {
    const trailingCell = page.locator(".grid-measure-row .note-viewer").nth(2);
    await trailingCell.click();

    const cellBox = await trailingCell.boundingBox();
    const overlayBox = await page.locator(".selection-overlay").boundingBox();

    expect(cellBox).not.toBeNull();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox!.x).toBeLessThanOrEqual(cellBox!.x);
    expect(overlayBox!.x + overlayBox!.width).toBeGreaterThanOrEqual(cellBox!.x + cellBox!.width);
    await expect(page.locator(".selection-delete-button")).toHaveCount(0);
});
