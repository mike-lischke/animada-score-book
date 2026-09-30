/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

/**
 * Builds one measure per track: a quarter, two eighths and a half note, all in the first style.
 *
 * @param instrumentIds The instrument of every track, in track order.
 *
 * @returns The packed arrangement snapshot.
 */
const buildPackedArrangement = (instrumentIds: string[]): string => {
    const snapshot: IArrangementSnapshot = {
        version: arrangementSnapshotVersion,
        title: "Symbol Test",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: instrumentIds.map((instrumentId, trackIndex) => {
            return {
                id: trackIndex + 1,
                instrumentId,
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 },
                            noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 4 }, duration: { numerator: 1, denominator: 8 },
                            noteStyleId: "1" },
                        { start: { numerator: 3, denominator: 8 }, duration: { numerator: 1, denominator: 8 },
                            noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 },
                            noteStyleId: "1" },
                    ],
                    subdivisions: [],
                }],
            };
        }),
    };

    return stringifyPackedArrangement(snapshot);
};

/**
 * Loads an arrangement into a fresh session and switches the arrangement view to staff mode.
 *
 * @param page The page to prepare.
 * @param packed The packed arrangement snapshot to load.
 */
const openStaffArrangement = async (page: Page, packed: string): Promise<void> => {
    await page.addInitScript((snapshotPacked: string) => {
        const sessionId = "e2e-symbols";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: snapshotPacked,
        }));
    }, packed);

    await page.goto("/");

    const trackViewToggle = page.locator("input.trackViewModeToggle").first();
    await expect(trackViewToggle).toBeVisible();
    if (!await trackViewToggle.isChecked()) {
        await trackViewToggle.check({ force: true });
    }

    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

test.describe("Notation symbols from the catalogue", () => {
    test("draws the percussion clef as a glyph of the music font", async ({ page }) => {
        await routeApi(page);
        await openStaffArrangement(page, buildPackedArrangement(["7"]));

        const clef = page.locator(".staff-prefix-clef .smufl-glyph-view text");
        await expect(clef).toBeVisible();

        // SMuFL places the percussion clef at U+E069.
        await expect(clef).toHaveText(String.fromCodePoint(0xE069));
    });

    test("ends a notehead on the right edge of its stem", async ({ page }) => {
        await routeApi(page);
        await openStaffArrangement(page, buildPackedArrangement(["7"]));

        const head = page.locator(".staff-note-head").first();
        await expect(head).toBeVisible();

        // The head's ink ends where its stem ends: a glyph anchored on the right edge of its box.
        const glyph = head.locator(".staff-note-head-symbol text");
        await expect(glyph).toHaveAttribute("text-anchor", "end");

        const edges = await page.evaluate(() => {
            const run = document.querySelector(".staff-note-viewer-run");
            const symbol = run?.querySelector(".staff-note-head-symbol");
            const stem = run?.querySelector(".staff-note-head-stem");
            if (!symbol || !stem) {
                return undefined;
            }

            return {
                symbolRight: symbol.getBoundingClientRect().right,
                stemRight: stem.getBoundingClientRect().right,
            };
        });

        expect(edges).toBeDefined();
        expect(edges!.symbolRight).toBeCloseTo(edges!.stemRight, 1);
    });

    test("draws the standard note values with the glyph of their length", async ({ page }) => {
        await routeApi(page);
        await openStaffArrangement(page, buildPackedArrangement(["7"]));

        const codepoints = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".staff-note-head-symbol text")).map((text) => {
                return text.textContent.codePointAt(0);
            });
        });

        // Quarter, eighth, eighth, half: the quarter and the eighths share the black head.
        expect(codepoints).toEqual([0xE0A4, 0xE0A4, 0xE0A4, 0xE0A3]);
    });

    test("draws a percussion head as the score's own path", async ({ page }) => {
        await routeApi(page);
        // 2 Tamborim (cross), 1 Chocalho (triangle), 6 Timbau (square)
        await openStaffArrangement(page, buildPackedArrangement(["2", "1", "6"]));

        const paths = page.locator(".staff-note-head-symbol path");
        await expect(paths).toHaveCount(12);

        // Every percussion head is a filled path of the score, stroked where the shape is drawn as lines.
        await expect(paths.first()).toHaveAttribute("stroke", "currentColor");
        await expect(page.locator(".staff-note-head-symbol text")).toHaveCount(0);
    });
});
