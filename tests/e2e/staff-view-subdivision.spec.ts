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
                const viewer = document.querySelectorAll(".bar-viewer.staff-mode")[barNumber - 1];
                const runs = Array.from(viewer.querySelectorAll(
                    ".bar-track-row.staff-mode .staff-note-viewer-runs > .staff-note-viewer-run",
                ));

                return runs.map((run, index) => {
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

    test("renders 32nd notes split from a single grid step", async ({ page }) => {
        const subdivisionSnapshot = {
            version: 4,
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
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    events: [
                        {
                            start: { numerator: 0, denominator: 32 },
                            duration: { numerator: 1, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 1, denominator: 32 },
                            duration: { numerator: 1, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 2, denominator: 32 },
                            duration: { numerator: 2, denominator: 32 },
                            noteStyleId: "1",
                        },
                        { start: { numerator: 4, denominator: 32 }, duration: { numerator: 28, denominator: 32 } },
                    ],
                    subdivisions: [],
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
        }, stringifyPackedArrangement(subdivisionSnapshot));

        await page.goto("/");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Two 32nd notes plus one 16th note must render as three note symbols.
        const noteCount = await page.evaluate(() => {
            const row = document.querySelector(".bar-viewer.staff-mode .bar-track-row.staff-mode");
            if (!row) {
                return -1;
            }

            return row.querySelectorAll(".staff-note-viewer-note-symbol").length;
        });

        expect(noteCount).toBe(3);
    });

    test("renders mixed full-bar note lengths down to 32nd correctly", async ({ page }) => {
        const mixedLengthsSnapshot = {
            version: 4,
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
                    // Explicit note durations: 16th, half, 32nd, 8th, quarter, 32nd.
                    events: [
                        {
                            start: { numerator: 0, denominator: 32 },
                            duration: { numerator: 2, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 2, denominator: 32 },
                            duration: { numerator: 16, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 18, denominator: 32 },
                            duration: { numerator: 1, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 19, denominator: 32 },
                            duration: { numerator: 4, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 23, denominator: 32 },
                            duration: { numerator: 8, denominator: 32 },
                            noteStyleId: "1",
                        },
                        {
                            start: { numerator: 31, denominator: 32 },
                            duration: { numerator: 1, denominator: 32 },
                            noteStyleId: "1",
                        },
                    ],
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
        }, stringifyPackedArrangement(mixedLengthsSnapshot));

        await page.goto("/");
        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();
        await expect(
            page.locator(".bar-viewer.staff-mode").first()
                .locator(".bar-track-row.staff-mode .staff-note-viewer-note-symbol"),
        ).toHaveCount(6);

        const runData = await page.evaluate(() => {
            const viewer = document.querySelectorAll(".bar-viewer.staff-mode")[0];
            const runs = Array.from(viewer.querySelectorAll(
                ".bar-track-row.staff-mode .staff-note-viewer-runs > .staff-note-viewer-run",
            ));

            return runs.map((run) => {
                const noteSymbol = run.querySelector<SVGElement>(".staff-note-viewer-note-symbol");
                const noteValue = noteSymbol?.getAttribute("data-note-image-value") ?? null;

                return {
                    noteValue,
                    beamSegments: run.querySelectorAll(".staff-note-viewer-beam").length,
                };
            });
        });

        expect(runData).toHaveLength(6);

        // The 32nd + 8th pair in the same pulse is rendered as a beamed group.
        expect(runData[2].beamSegments).toBeGreaterThan(0);

        const noteValues = runData.map((run) => {
            return run.noteValue;
        }).filter((value): value is string => {
            return value !== null;
        });
        const distinctValues = new Set(noteValues);
        expect(distinctValues.size).toBeGreaterThanOrEqual(2);
    });
});
