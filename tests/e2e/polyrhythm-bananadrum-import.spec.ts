/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import {
    beijaFlorImportPath, ensureGridMode, expectGridModePolyrhythmNotes, expectImportedPolyrhythmSong,
    expectPlaybackToMove, routeApi,
} from "./e2e-test-helpers.js";

const bolero3ImportPath = "/?t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("BananaDrum polyrhythm import", () => {
    test("loads the imported song title and polyrhythm fragments", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
    });

    test("plays the imported polyrhythm song", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
        await expectPlaybackToMove(page);
    });

    test("shows regular and polyrhythm notes in grid mode", async ({ page }) => {
        await page.goto(beijaFlorImportPath);

        await expectImportedPolyrhythmSong(page);
        await ensureGridMode(page);
        await expectGridModePolyrhythmNotes(page);
    });

    test("Bolero 3: renders the 4:1 tuplet as a single subdivision container in grid mode", async ({ page }) => {
        await page.goto(bolero3ImportPath);

        // Wait for the imported song to load.
        await expect(page.locator("#trackViewerHost")).toBeVisible();
        await expect(page.locator(".grid-measure-row").first()).toBeVisible();

        await ensureGridMode(page);

        // Measure 1 of Bolero 3 (6/8): the two 3:1 subdivisions are binary in 6/8
        // (S={3}), so they become plain subdivision groups; only the asymmetric 4:1
        // subdivision is a true tuplet.
        const barDom = await page.evaluate(() => {
            const row = document.querySelector(".grid-measure-viewer .grid-measure-row");
            if (!row) {
                return null;
            }

            const children = Array.from(row.children)
                .filter((c) => {
                    return !c.classList.contains("grid-beat-overlay");
                });

            const subdivisions = children.filter((c) => {
                return c.classList.contains("subdivision");
            });

            return {
                childCount: children.length,
                subdivisionCount: subdivisions.length,
                subdivisionSizes: subdivisions.map((c) => {
                    return c.children.length;
                }),
                noteCellCount: row.querySelectorAll(".note-viewer").length,
            };
        });

        expect(barDom).not.toBeNull();
        if (!barDom) {
            throw new Error("Grid measure row not found");
        }

        // 4 plain note cells + 2 subdivision containers = 6 top-level children.
        expect(barDom.childCount).toBe(6);

        // Two subdivision groups: the 3:1 pair and the 4:1 tuplet.
        expect(barDom.subdivisionCount).toBe(2);
        expect(barDom.subdivisionSizes).toEqual([3, 4]);

        // 13 visible notes in total.
        expect(barDom.noteCellCount).toBe(13);
    });

    /* cspell:disable */
    const repiSoloQuery = "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
        "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
        "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
        "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
        "hyCTb4ybOeMH73m6PPjB4En3PUu";
    /* cspell:enable */

    const repiSoloImportPath = `/?${repiSoloQuery}`;

    test("Repi Solo: renders binary 32nd-note subdivisions as containers without tuplet brackets", async ({ page }) => {
        await page.goto(repiSoloImportPath);

        // Wait for the imported song to load.
        await expect(page.locator("#trackViewerHost")).toBeVisible();
        await expect(page.locator(".grid-measure-row").first()).toBeVisible();

        // The 2:1 and 4:2 subdivisions are binary (powers of 2), so they render as plain
        // subdivision containers in grid mode — one per affected bar.
        await ensureGridMode(page);

        const gridSubdivisionCounts = await page.evaluate(() => {
            const result: Record<string, number> = {};
            for (const bar of ["6", "7", "8"]) {
                const viewer = document.querySelectorAll(".grid-measure-viewer")[Number(bar) - 1];
                result[bar] = viewer.querySelectorAll(".grid-measure-row .subdivision").length;
            }

            return result;
        });

        expect(gridSubdivisionCounts["6"]).toBe(1);
        expect(gridSubdivisionCounts["7"]).toBe(1);
        expect(gridSubdivisionCounts["8"]).toBe(1);

        // Staff mode: binary subdivisions produce no tuplet bracket/number labels.
        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!(await trackViewToggle.isChecked())) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".staff-measure-viewer").first()).toBeVisible();

        const staffTupletLabelCount = await page.evaluate(() => {
            const viewer = document.querySelectorAll(".staff-measure-viewer")[5];
            const container = viewer.querySelector(".staff-note-viewer-tuplets");

            return container ? container.children.length : 0;
        });

        expect(staffTupletLabelCount).toBe(0);
    });
});
