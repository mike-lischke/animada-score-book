/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("horizontal navigation reaches a rest run", async ({ page }) => {
    const snapshot = {
        version: 4,
        title: "E2E Horizontal Navigation",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 200,
            instrumentId: "0",
            measures: [{
                number: 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [
                    // Four beamed sixteenths, a quarter rest, then two blocks of sixteenths: the
                    // rest sits between two beamed groups.
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

    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-horizontal-navigation";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, stringifyPackedArrangement(snapshot));

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

    // Start on the last sixteenth before the rest.
    const fourth = page.locator(".staff-note-viewer-run").nth(3);
    await fourth.click();
    await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);

    await page.keyboard.press("ArrowRight");

    // The cursor moves onto the rest run between the beamed groups.
    const selected = page.locator(".staff-note-viewer-run.note-selected");
    await expect(selected).toHaveCount(1);
    await expect(selected.locator(".staff-note-viewer-rest-symbol")).toHaveCount(1);
    await expect(selected).toHaveClass(/staff-note-viewer-run/);
});
