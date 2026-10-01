/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * Builds a minimal 1-bar arrangement snapshot with a single track and one note.
 *
 * @param instrumentId The id of the instrument to bind to the single track.
 * @param title The arrangement title.
 * @param noteStyleId The id of the note style used for the single note.
 *
 * @returns A snapshot object suitable for `stringifyPackedArrangement`.
 */
const buildSnapshot = (instrumentId: string, title: string, noteStyleId = "1") => {
    return {
        version: arrangementSnapshotVersion,
        title,
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 100,
            instrumentId,
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
                        noteStyleId,
                    },
                    { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
                ],
                subdivisions: [],
            }],
        }],
    };
};

test.describe("Staff view multi-line rendering", () => {
    test("renders a single staff line for a 1-line instrument (Chocalho)", async ({ page }) => {
        const snapshot = buildSnapshot("1", "E2E Single Line", "1");

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-staff-single-line";
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

        const lineCount = await page.evaluate(() => {
            const viewer = document.querySelector(".staff-note-viewer");

            return viewer?.querySelectorAll(".staff-note-viewer-line").length ?? 0;
        });

        expect(lineCount).toBe(1);
    });

    test("renders two staff lines for a 2-line instrument (Agogô)", async ({ page }) => {
        const snapshot = buildSnapshot("0", "E2E Two Lines");

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-staff-two-lines";
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

        const { lineCount, offsets, barlineHeight } = await page.evaluate(() => {
            const viewer = document.querySelector(".staff-note-viewer");
            const lines = viewer?.querySelectorAll(".staff-note-viewer-line") ?? [];
            const barline = viewer?.querySelector(".staff-note-viewer-barline");

            return {
                lineCount: lines.length,
                offsets: Array.from(lines).map((l) => {
                    return (l as HTMLElement).style.getPropertyValue("--staff-line-offset");
                }),
                barlineHeight: barline === null || barline === undefined
                    ? null
                    : barline.getBoundingClientRect().height,
            };
        });

        expect(lineCount).toBe(2);
        // Half a staff space above and below the line the notes sit on.
        expect(offsets).toEqual(["-5px", "5px"]);

        // A staff of one space gets the two-space stub, the same as a staff of a single line. The barline also
        // covers the thickness of the lower line, so it reaches past the distance between the lines by it.
        expect(barlineHeight).toBe(21);
    });

    test("renders four staff lines for a 4-line instrument (4-Bell Agogo)", async ({ page }) => {
        const snapshot = buildSnapshot("a", "E2E Four Lines");

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-staff-four-lines";
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

        const { lineCount, offsets, barlineHeight } = await page.evaluate(() => {
            const viewer = document.querySelector(".staff-note-viewer");
            const lines = viewer?.querySelectorAll(".staff-note-viewer-line") ?? [];
            const barline = viewer?.querySelector(".staff-note-viewer-barline");

            return {
                lineCount: lines.length,
                offsets: Array.from(lines).map((l) => {
                    return (l as HTMLElement).style.getPropertyValue("--staff-line-offset");
                }),
                barlineHeight: barline === null || barline === undefined
                    ? null
                    : barline.getBoundingClientRect().height,
            };
        });

        expect(lineCount).toBe(4);
        // One and a half, half a space above and below the line the notes sit on.
        expect(offsets).toEqual(["-15px", "-5px", "5px", "15px"]);

        // A staff of three spaces is taller than the stub, so the closing barline spans its outer lines.
        expect(barlineHeight).toBe(31);
    });

    test("draws stems of equal length for notes on different staff lines", async ({ page }) => {
        // Four eighths on the four lines of the 4-Bell Agogo, each followed by a rest so that they
        // stay unbeamed and are drawn with a flag on a stem of their own.
        const snapshot = {
            version: arrangementSnapshotVersion,
            title: "E2E Stem Length",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 100,
                instrumentId: "a",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        // One eighth per pulse, alternating with a rest, from the lowest to the highest line.
                        ...[1, 2, 3, 4].flatMap((noteStyleId, index) => {
                            return [
                                {
                                    start: { numerator: index * 4, denominator: 16 },
                                    duration: { numerator: 2, denominator: 16 },
                                    noteStyleId: noteStyleId.toString(),
                                },
                                {
                                    start: { numerator: (index * 4) + 2, denominator: 16 },
                                    duration: { numerator: 2, denominator: 16 },
                                },
                            ];
                        }),
                    ],
                    subdivisions: [],
                }],
            }],
        };

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-staff-stem-length";
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

        const stems = await page.evaluate(() => {
            const row = document.querySelector(".staff-measure-track-row");
            const runs = [...(row?.querySelectorAll(".staff-note-viewer-note-run") ?? [])];

            return runs.map((run) => {
                const head = run.querySelector<HTMLElement>(".staff-note-head");
                const stem = run.querySelector<HTMLElement>(".staff-note-head-stem");
                if (!head || !stem) {
                    return null;
                }

                const stemRect = stem.getBoundingClientRect();
                const headRect = head.getBoundingClientRect();

                return {
                    lineOffset: getComputedStyle(head).getPropertyValue("--note-line-offset").trim(),
                    height: Math.round(stemRect.height),
                    top: Math.round((stemRect.top - headRect.top) * 10) / 10,
                };
            });
        });

        // A stem is a rigid part of its notehead: it keeps its length on every line and moves with
        // the head instead of reaching up to a fixed height above the row. Its tip sits where a beam
        // sits, and its length is the distance from there down to the anchor the font states.
        expect(stems.map((stem) => {
            return stem?.height;
        })).toEqual([33, 33, 33, 33]);

        const tops = stems.map((stem) => {
            return stem?.top ?? 0;
        });
        expect(tops[1] - tops[0]).toBeCloseTo(0, 1);
        expect(tops[2] - tops[0]).toBeCloseTo(0, 1);
        expect(tops[3] - tops[0]).toBeCloseTo(0, 1);

        // The four notes sit on the four lines of the 4-bell agogo, lowest first.
        expect(stems.map((stem) => {
            return stem?.lineOffset;
        })).toEqual(["15px", "5px", "-5px", "-15px"]);
    });

    test("staff prefix viewer renders matching lines for multi-line instruments", async ({ page }) => {
        const snapshot = buildSnapshot("a", "E2E Prefix Lines");

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-staff-prefix-lines";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: packed,
                viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
            }));
        }, stringifyPackedArrangement(snapshot));

        await page.goto("/");
        await expect(page.locator("#trackViewerHost")).toBeVisible();

        // Prefix row for the 4-line instrument must have matching staff lines, and they must sit on the
        // same pixel as the lines of the note row: both draw around the line the viewer states.
        const { prefixLineCount, prefixLineTop, noteLineTop } = await page.evaluate(() => {
            const row = document.querySelector(".staff-prefix-row");
            const prefixLine = row?.querySelector(".staff-note-viewer-line");
            const noteLine = document.querySelector(".staff-measure-track-row .staff-note-viewer-line");

            return {
                prefixLineCount: row?.querySelectorAll(".staff-note-viewer-line").length ?? 0,
                prefixLineTop: prefixLine?.getBoundingClientRect().top ?? null,
                noteLineTop: noteLine?.getBoundingClientRect().top ?? null,
            };
        });

        expect(prefixLineCount).toBe(4);
        expect(prefixLineTop).toBe(noteLineTop);
    });
});
