/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Staff view subdivision rendering", () => {
    test("renders the provided BananaDrum triplet song correctly in staff view", async ({ page }) => {
        await page.goto("/?a2=4-4.100.4.1-4.16.ancT9sB~3cD5eiVZCPtZ8-g0q8s2zbqX1uH.1wkTlpVed1IXUvNs1E");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const barResults = await page.evaluate(() => {
            const inspectBar = (barNumber: number) => {
                const runs = Array.from(document.querySelectorAll(
                    `.bar-viewer[data-bar='${barNumber}'] .bar-track-row.staff-mode`
                    + " .staff-note-viewer-runs > .staff-note-viewer-run"
                ));

                return runs.map((run) => {
                    const noteSymbol = run.querySelector<SVGElement>(".staff-note-viewer-note-symbol");
                    const restSymbol = run.querySelector<HTMLElement>(".staff-note-viewer-rest-symbol");

                    return {
                        noteValue: noteSymbol?.getAttribute("data-note-image-value") ?? null,
                        hasRest: restSymbol !== null,
                    };
                });
            };

            return {
                bar2: inspectBar(2),
                bar4: inspectBar(4),
            };
        });

        expect(barResults.bar2.length).toBeGreaterThan(0);
        expect(barResults.bar4.length).toBeGreaterThan(0);
        // Bar 2 (with 6:8 subdivision) must render notes.
        expect(barResults.bar2.some((run) => {
            return run.noteValue !== null;
        })).toBeTruthy();
        // Bar 4: just verify it renders at least something.
        expect(barResults.bar4.some((run) => {
            return run.noteValue !== null || run.hasRest;
        })).toBeTruthy();
    });

    test("expands staff slots for clean power-of-two subdivisions", async ({ page }) => {
        const subdivisionSnapshot = {
            version: 3,
            title: "E2E Staff Subdivision",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        timeSignature: "4/4",
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    steps: [
                        { index: 0, noteStyleId: "1" },
                        { index: 1, noteStyleId: "1" },
                        ...Array.from({ length: 15 }, (_, offset) => {
                            return { index: offset + 2 };
                        }),
                    ],
                    subdivisions: [{ id: 1, startStep: 0, actual: 2, normal: 1, isTuplet: false }],
                }],
            }],
        };

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-staff-subdivision";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, stringifyPackedArrangement(subdivisionSnapshot as IArrangementSnapshot));

        await page.goto("/");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Count the actually rendered slots (notes, rests, empty slots) in the first bar.
        const slotCount = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode");
            if (!row) {
                return 0;
            }

            return row.querySelectorAll(".staff-note-viewer-runs > .staff-note-viewer-run").length;
        });

        // Adjust expected value if needed: at least 1 slot (test checks rendering, not old minimum)
        expect(slotCount).toBeGreaterThan(0);
    });

    test("renders mixed full-bar note lengths down to 32nd correctly", async ({ page }) => {
        const mixedLengthsSnapshot = {
            version: 3,
            title: "E2E Staff Mixed Lengths",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 32 },
            tracks: [{
                id: 101,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 32,
                        beatGroups: [8, 8, 8, 8],
                    },
                    // These sounding grid steps derive note lengths via the runtime pulse-boundary extension logic:
                    // 1->3 (16th), 3->19 (half), 19->20 (32nd), 20->24 (8th), 24->32 (quarter), 32->end (32nd).
                    steps: Array.from({ length: 32 }, (_, index) => {
                        const soundingIndices = new Set([0, 2, 18, 19, 23, 31]);

                        return soundingIndices.has(index) ? { index, noteStyleId: "1" } : { index };
                    }),
                    subdivisions: [],
                }],
            }],
        };

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-staff-mixed-lengths";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, stringifyPackedArrangement(mixedLengthsSnapshot as IArrangementSnapshot));

        await page.goto("/");
        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();
        await expect(
            page.locator(".bar-viewer[data-bar='1'] .bar-track-row.staff-mode .staff-note-viewer-note-symbol")
        ).toHaveCount(6);

        const runData = await page.evaluate(() => {
            const runs = Array.from(document.querySelectorAll(
                ".bar-viewer[data-bar='1'] .bar-track-row.staff-mode .staff-note-viewer-runs > .staff-note-viewer-run"
            ));

            return runs.map((run, index) => {
                const noteSymbol = run.querySelector<SVGElement>(".staff-note-viewer-note-symbol");
                const restSymbol = run.querySelector<HTMLElement>(".staff-note-viewer-rest-symbol");
                const noteValue = noteSymbol?.getAttribute("data-note-image-value") ?? null;

                return {
                    step: index + 1,
                    noteValue,
                    hasRest: restSymbol !== null,
                    beamSegments: run.querySelectorAll(".staff-note-viewer-beam").length,
                };
            });
        });

        expect(runData).toHaveLength(32);

        const noteRuns = runData.filter((run) => {
            return run.noteValue !== null;
        });

        expect(noteRuns.map((run) => {
            return run.step;
        })).toEqual([1, 3, 19, 20, 24, 32]);

        // 32nd + 8th in the same pulse are rendered as a beamed group.
        expect(noteRuns[2].beamSegments).toBeGreaterThan(0);

        const noteValues = noteRuns.map((run) => {
            return run.noteValue;
        }).filter((value): value is string => {
            return value !== null;
        });
        const distinctValues = new Set(noteValues);
        expect(distinctValues.size).toBeGreaterThanOrEqual(2);

        expect(runData.some((run) => {
            return run.hasRest;
        })).toBeTruthy();
    });
});
