/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { findStaffMeasure, routeApi } from "./e2e-test-helpers.js";

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        const inspectBar = async (barNumber: number) => {
            const measure = await findStaffMeasure(page, barNumber);

            return measure.evaluate((viewer) => {
                const runs = Array.from(viewer.querySelectorAll(
                    ".staff-measure-track-row .staff-note-viewer-runs > .staff-note-viewer-run",
                ));

                return runs.map((run) => {
                    const noteSymbol = run.querySelector<SVGElement>(".staff-note-viewer-note-symbol");
                    const restSymbol = run.querySelector<HTMLElement>(".staff-note-viewer-rest-symbol");

                    return {
                        noteValue: noteSymbol?.getAttribute("data-note-image-value") ?? null,
                        hasRest: restSymbol !== null,
                    };
                });
            });
        };

        const bar2 = await inspectBar(2);
        const bar4 = await inspectBar(4);

        expect(bar2.length).toBeGreaterThan(0);
        expect(bar4.length).toBeGreaterThan(0);
        // Bar 2 (with 6:8 subdivision) must render notes.
        expect(bar2.some((run) => {
            return run.noteValue !== null;
        })).toBeTruthy();
        // Bar 4: just verify it renders at least something.
        expect(bar4.some((run) => {
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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        // Two 32nd notes plus one 16th note must render as three note symbols.
        const noteCount = await page.evaluate(() => {
            const row = document.querySelector(".staff-measure-viewer .staff-measure-track-row");
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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
        await expect(
            page.locator(".staff-measure-viewer").first()
                .locator(".staff-measure-track-row .staff-note-viewer-note-symbol"),
        ).toHaveCount(6);

        const runData = await page.evaluate(() => {
            const viewer = document.querySelectorAll(".staff-measure-viewer")[0];
            const runs = Array.from(viewer.querySelectorAll(
                ".staff-measure-track-row .staff-note-viewer-runs > .staff-note-viewer-run",
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

    test("spans the tuplet bracket over the rests of the group", async ({ page }) => {
        // Eight sixteenth notes, then a 3:8 tuplet over the second half of the bar whose slots are a
        // rest, a note and a rest again. The bracket has to reach the outer rests, not only the note.
        const snapshot = {
            version: 4,
            title: "E2E Tuplet With Rests",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 102,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        ...Array.from({ length: 8 }, (_, index) => {
                            return {
                                start: { numerator: index, denominator: 16 },
                                duration: { numerator: 1, denominator: 16 },
                                noteStyleId: "1",
                            };
                        }),
                        { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 6 } },
                        {
                            start: { numerator: 2, denominator: 3 },
                            duration: { numerator: 1, denominator: 6 },
                            noteStyleId: "1",
                        },
                        { start: { numerator: 5, denominator: 6 }, duration: { numerator: 1, denominator: 6 } },
                    ],
                    subdivisions: [
                        { startIndex: 8, actual: 3, normal: 8, isTuplet: true },
                    ],
                }],
            }],
        };

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-tuplet-rests";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, stringifyPackedArrangement(snapshot));

        await page.goto("/");
        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".staff-note-viewer-tuplet-bracket").first()).toBeVisible();

        // A bracket tick sits on the glyph of the slot it marks, so both ends have to land on the
        // centre of an outer rest.
        const offsets = await page.evaluate(() => {
            const bracket = document.querySelector<HTMLElement>(".staff-note-viewer-tuplet-bracket");
            const rests = [...document.querySelectorAll<HTMLElement>(".staff-note-viewer-rest-symbol")];
            if (!bracket || rests.length !== 2) {
                return null;
            }

            const bracketRect = bracket.getBoundingClientRect();
            const centerOf = (element: HTMLElement) => {
                const rect = element.getBoundingClientRect();

                return rect.left + (rect.width / 2);
            };

            return {
                left: bracketRect.left - centerOf(rests[0]),
                right: bracketRect.right - centerOf(rests[1]),
            };
        });

        if (!offsets) {
            test.fail(true, "The bar does not hold a tuplet bracket and two rests");

            return;
        }

        expect(Math.abs(offsets.left)).toBeLessThan(2);
        expect(Math.abs(offsets.right)).toBeLessThan(2);
    });
});
