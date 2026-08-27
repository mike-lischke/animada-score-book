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

test.describe("Staff view two-step note", () => {
    test("renders a note spanning two grid steps as a single run", async ({ page }) => {
        // A single 4/4 bar, 16th grid. A press-roll note of two grid steps in duration,
        // flanked by single-step notes. The remaining steps are a single rest.
        const snapshot = {
            version: 4,
            title: "E2E Two-Step Note",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 200,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    events: [
                        {
                            start: { numerator: 0, denominator: 16 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 1, denominator: 16 },
                            duration: { numerator: 2, denominator: 16 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 3, denominator: 16 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "1",
                        },
                        { start: { numerator: 4, denominator: 16 }, duration: { numerator: 12, denominator: 16 } },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-staff-two-step-note";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, stringifyPackedArrangement(snapshot));

        await page.goto("/");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        // Switch to staff (track) view.
        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // The two-step note must render as a single note symbol, giving three notes in total.
        const noteSymbolCount = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode");
            if (!row) {
                return -1;
            }

            return row.querySelectorAll(".staff-note-viewer-note-symbol").length;
        });

        expect(noteSymbolCount).toBe(3);
    });
});
