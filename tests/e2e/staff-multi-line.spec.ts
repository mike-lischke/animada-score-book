/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./helpers.js";

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
        version: 3,
        title,
        timeParams: {
            timeSignature: "4/4",
            tempo: 120,
            length: 1,
            pulse: "1/4",
            stepResolution: 16,
        },
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
                steps: [
                    { index: 0, noteStyleId },
                    ...Array.from({ length: 15 }, (_, i) => {
                        return { index: i + 1 };
                    }),
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
        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

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
        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const { lineCount, positions } = await page.evaluate(() => {
            const viewer = document.querySelector(".staff-note-viewer");
            const lines = viewer?.querySelectorAll(".staff-note-viewer-line") ?? [];

            return {
                lineCount: lines.length,
                positions: Array.from(lines).map((l) => {
                    return (l as HTMLElement).style.top;
                }),
            };
        });

        expect(lineCount).toBe(2);
        // Two lines centred: offset = (line - centerLine) * 10 + 31.5
        // centerLine = 1.5: line 1 → -5+31.5=26.5, line 2 → +5+31.5=36.5
        expect(positions[0]).toBe("calc(50% + 26.5px)");
        expect(positions[1]).toBe("calc(50% + 36.5px)");
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
        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const { lineCount, positions } = await page.evaluate(() => {
            const viewer = document.querySelector(".staff-note-viewer");
            const lines = viewer?.querySelectorAll(".staff-note-viewer-line") ?? [];

            return {
                lineCount: lines.length,
                positions: Array.from(lines).map((l) => {
                    return (l as HTMLElement).style.top;
                }),
            };
        });

        expect(lineCount).toBe(4);
        // Four lines centred: offset = (line - centerLine) * 10 + 31.5
        // centerLine = 2.5: lines → 16.5, 26.5, 36.5, 46.5
        expect(positions[0]).toBe("calc(50% + 16.5px)");
        expect(positions[1]).toBe("calc(50% + 26.5px)");
        expect(positions[2]).toBe("calc(50% + 36.5px)");
        expect(positions[3]).toBe("calc(50% + 46.5px)");
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

        // Prefix row for the 4-line instrument must have matching staff lines.
        const prefixLineCount = await page.evaluate(() => {
            const row = document.querySelector(".staff-prefix-row");

            return row?.querySelectorAll(".staff-note-viewer-line").length ?? 0;
        });

        expect(prefixLineCount).toBe(4);
    });
});
