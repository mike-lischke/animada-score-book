/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Staff view 1:2 subdivision", () => {
    test("renders three notes with a 1:2 subdivision in between", async ({ page }) => {
        // A single 4/4 bar, 16th grid.  First note, then a 1:2 subdivision
        // containing a press-roll (one note spanning two normal steps), then a
        // third note after the subdivision.  Steps 3–15 are rests.
        const snapshot = {
            version: 3,
            title: "E2E 1:2 Subdivision",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 16,
            },
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
                    steps: [
                        { index: 0, noteStyleId: "1" },
                        { index: 1, noteStyleId: "1" },
                        { index: 2, noteStyleId: "1" },
                        ...Array.from({ length: 13 }, (_, offset) => {
                            return { index: offset + 3 };
                        }),
                    ],
                    subdivisions: [{
                        id: 1,
                        startStep: 1,
                        actual: 1,
                        normal: 2,
                        isTuplet: false,
                    }],
                }],
            }],
        };

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-staff-1-2-subdivision";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, stringifyPackedArrangement(snapshot as IArrangementSnapshot));

        await page.goto("/");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        // Switch to staff (track) view.
        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Count the rendered slots in the first bar.
        const slotCount = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode");
            if (!row) {
                return 0;
            }

            return row.querySelectorAll(".staff-note-viewer-runs > .staff-note-viewer-run").length;
        });

        // 16 steps total: step 0 (run), subdivision container (not a run), steps 2–15 (14 runs)
        // = 15 direct children of .staff-note-viewer-runs.
        expect(slotCount).toBe(15);

        // All three note-style steps must render a note symbol (not a rest).
        const noteSlots = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode");
            if (!row) {
                return [];
            }

            const runs = row.querySelectorAll<HTMLElement>(".staff-note-viewer-run");
            const result: Array<{ hasNote: boolean; hasRest: boolean; stepIndex: string | null; }> = [];
            for (const run of runs) {
                result.push({
                    hasNote: run.querySelector(".staff-note-viewer-note-symbol") !== null,
                    hasRest: run.querySelector(".staff-note-viewer-rest-symbol") !== null,
                    stepIndex: run.getAttribute("data-step-index"),
                });
            }

            // Also look inside subdivisions.
            const subDivs = row.querySelectorAll<HTMLElement>(
                ".staff-note-viewer-runs > div[style*='display: flex']"
            );
            for (const sub of subDivs) {
                const subRuns = sub.querySelectorAll<HTMLElement>(".staff-note-viewer-run");
                for (const run of subRuns) {
                    result.push({
                        hasNote: run.querySelector(".staff-note-viewer-note-symbol") !== null,
                        hasRest: run.querySelector(".staff-note-viewer-rest-symbol") !== null,
                        stepIndex: run.getAttribute("data-step-index"),
                    });
                }
            }

            return result;
        });

        // Steps 0, 1, 2 should all have notes.
        const step0 = noteSlots.find((s) => {
            return s.stepIndex === "0";
        });
        const step1 = noteSlots.find((s) => {
            return s.stepIndex === "1";
        });
        const step2 = noteSlots.find((s) => {
            return s.stepIndex === "2";
        });

        expect(step0).toBeDefined();
        expect(step0!.hasNote).toBe(true);
        expect(step1).toBeDefined();
        expect(step1!.hasNote).toBe(true);
        expect(step2).toBeDefined();
        expect(step2!.hasNote).toBe(true);

        // Step 2 must NOT be a rest — it must be a real note outside the subdivision.
        expect(step2!.hasRest).toBe(false);

        // The subdivision container must exist and contain exactly one child run.
        const subdivisionChildCount = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode");
            if (!row) {
                return -1;
            }

            // Find the flex container that is NOT .staff-note-viewer-run.
            const children = row.querySelectorAll<HTMLElement>(
                ".staff-note-viewer-runs > :not(.staff-note-viewer-run)"
            );
            for (const c of children) {
                return c.querySelectorAll(".staff-note-viewer-run").length;
            }

            return 0;
        });

        expect(subdivisionChildCount).toBe(1);
    });
});
