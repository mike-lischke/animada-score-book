/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import {
    beijaFlorImportPath, ensureGridMode,
    expectGridModePolyrhythmNotes, expectImportedPolyrhythmSong, expectPlaybackToMove,
    routeApi,
} from "./helpers.js";

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

    test("Bolero 3: renders nested tuplet containers correctly in grid mode", async ({ page }) => {
        await page.goto(bolero3ImportPath);

        // Wait for the imported song to load.
        await expect(page.locator("#trackViewerHost")).toBeVisible();
        await expect(page.locator(".grid-measure-row").first()).toBeVisible();

        await ensureGridMode(page);

        // Measure 1 of Bolero 3 (6/8, 13 visible steps):
        //   Base step 0: 1 regular note
        //   Base step 1: T1 (triplet, 3:1) containing:
        //     - 2 regular note slots
        //     - T2 (nested triplet, 3:1 inside T1 slot 2) with 3 children
        //   Base steps 2–3: 2 regular notes
        //   Base step 4: T3 (4-tuplet) with 4 children
        //   Base step 5: 1 regular note
        const barDom = await page.evaluate(() => {
            const row = document.querySelector(".grid-measure-viewer[data-bar='1'] .grid-measure-row");
            if (!row) {
                return null;
            }

            const directChildren = Array.from(row.children);

            return directChildren.map((child) => {
                const isSubdivision = child.classList.contains("subdivision");
                if (!isSubdivision) {
                    return { type: "step" };
                }

                // Subdivision container: collect its direct children and nested subdivisions.
                const subChildren = Array.from(child.children);

                return {
                    type: "subdivision",
                    flex: (child as HTMLElement).style.flex,
                    childCount: subChildren.length,
                    children: subChildren.map((tc) => {
                        const isNested = tc.classList.contains("subdivision");

                        return isNested
                            ? {
                                type: "subdivision",
                                flex: (tc as HTMLElement).style.flex,
                                childCount: tc.children.length,
                            }
                            : { type: "step" };
                    }),
                };
            });
        });

        expect(barDom).not.toBeNull();
        if (!barDom) {
            throw new Error("Grid measure row not found");
        }

        // 6 direct children: step, subdivision(T1), step, step, subdivision(T3), step
        expect(barDom).toHaveLength(6);

        // Child 0: regular step
        expect(barDom[0]).toEqual({ type: "step" });

        // Child 1: T1 subdivision container with 3 children (steps 0-1 of T1 + T2 nested)
        expect(barDom[1].type).toBe("subdivision");
        const t1 = barDom[1] as { type: "subdivision"; childCount: number; children: Array<{ type: string; }>; };
        expect(t1.childCount).toBe(3);
        expect(t1.children[0]).toEqual({ type: "step" });
        expect(t1.children[1]).toEqual({ type: "step" });
        // Child 2 of T1: nested T2 subdivision with 3 children
        expect(t1.children[2].type).toBe("subdivision");
        const t2 = t1.children[2] as { type: "subdivision"; childCount: number; };
        expect(t2.childCount).toBe(3);

        // Child 2–3: regular steps (base steps 2, 3)
        expect(barDom[2]).toEqual({ type: "step" });
        expect(barDom[3]).toEqual({ type: "step" });

        // Child 4: T3 subdivision container with 4 children
        expect(barDom[4].type).toBe("subdivision");
        const t3 = barDom[4] as { type: "subdivision"; childCount: number; };
        expect(t3.childCount).toBe(4);

        // Child 5: regular step (base step 5)
        expect(barDom[5]).toEqual({ type: "step" });
    });

    /* cspell:disable */
    const repiSoloQuery = "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
        "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
        "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
        "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
        "hyCTb4ybOeMH73m6PPjB4En3PUu";
    /* cspell:enable */

    const repiSoloImportPath = `/?${repiSoloQuery}`;

    test("Repi Solo: renders 32nd-note subdivisions correctly in bars 6-8 (grid + staff)", async ({ page }) => {
        await page.goto(repiSoloImportPath);

        // Wait for the imported song to load.
        await expect(page.locator("#trackViewerHost")).toBeVisible();
        await expect(page.locator(".grid-measure-row").first()).toBeVisible();

        // Repi Solo is 4/4, 13 bars, 16th-note grid.
        // First track (instrument "3") has non-tuplet binary subdivisions:
        //   Bar 6: 2:1 @ step 9 → 17 expanded steps. 2 32nd notes.
        //   Bar 7: 2:1 @ step 9 → 17 expanded steps. 2 32nd notes.
        //   Bar 8: 4:2 @ step 14 → 18 expanded steps. 4 32nd notes.
        //
        // In grid mode, the subdivision container replaces N actual steps with
        // 1 container div, so DOM child count = steps.length - actual + 1.

        // ==================== GRID MODE ====================

        await ensureGridMode(page);

        // --- Bar 6: 16 children (17 - 2 + 1), subdivision @ index 9 ---
        const bar6Grid = await page.evaluate(() => {
            const row = document.querySelector(
                ".grid-measure-viewer[data-bar='6'] .grid-measure-row",
            );
            if (!row) {
                return null;
            }

            return Array.from(row.children).map((child) => {
                if (child.classList.contains("subdivision")) {
                    return {
                        type: "subdivision",
                        flex: (child as HTMLElement).style.flex,
                        childCount: child.children.length,
                    };
                }

                return { type: "step" };
            });
        });

        expect(bar6Grid).not.toBeNull();
        if (!bar6Grid) {
            throw new Error("Bar 6 grid row not found");
        }
        expect(bar6Grid).toHaveLength(16);
        expect(bar6Grid[9].type).toBe("subdivision");
        const bar6Sub = bar6Grid[9] as { type: "subdivision"; flex: string; childCount: number; };
        // Grid layout: subdivisions use gridColumn + nested grid, no flex.
        expect(bar6Sub.flex).toBe("");
        expect(bar6Sub.childCount).toBe(2);

        // --- Bar 7: same structure ---
        const bar7Grid = await page.evaluate(() => {
            const row = document.querySelector(
                ".grid-measure-viewer[data-bar='7'] .grid-measure-row",
            );
            if (!row) {
                return null;
            }

            return Array.from(row.children).map((child) => {
                if (child.classList.contains("subdivision")) {
                    return {
                        type: "subdivision",
                        flex: (child as HTMLElement).style.flex,
                        childCount: child.children.length,
                    };
                }

                return { type: "step" };
            });
        });

        expect(bar7Grid).not.toBeNull();
        if (!bar7Grid) {
            throw new Error("Bar 7 grid row not found");
        }
        expect(bar7Grid).toHaveLength(16);
        expect(bar7Grid[9].type).toBe("subdivision");
        const bar7Sub = bar7Grid[9] as { type: "subdivision"; childCount: number; };
        expect(bar7Sub.childCount).toBe(2);

        // --- Bar 8: 15 children (18 - 4 + 1), subdivision @ index 14 ---
        const bar8Grid = await page.evaluate(() => {
            const row = document.querySelector(
                ".grid-measure-viewer[data-bar='8'] .grid-measure-row",
            );
            if (!row) {
                return null;
            }

            return Array.from(row.children).map((child) => {
                if (child.classList.contains("subdivision")) {
                    return {
                        type: "subdivision",
                        flex: (child as HTMLElement).style.flex,
                        childCount: child.children.length,
                    };
                }

                return { type: "step" };
            });
        });

        expect(bar8Grid).not.toBeNull();
        if (!bar8Grid) {
            throw new Error("Bar 8 grid row not found");
        }
        expect(bar8Grid).toHaveLength(15);
        expect(bar8Grid[14].type).toBe("subdivision");
        const bar8Sub = bar8Grid[14] as { type: "subdivision"; flex: string; childCount: number; };
        expect(bar8Sub.flex).toBe("");
        expect(bar8Sub.childCount).toBe(4);

        // ==================== STAFF MODE ====================

        // Switch to staff mode by checking the toggle.
        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!(await trackViewToggle.isChecked())) {
            await trackViewToggle.check({ force: true });
        }
        await expect(trackViewToggle).toBeChecked();
        await expect(page.locator(".bar-viewer.staff-mode").first()).toBeVisible();

        // Helper: query staff bar DOM for a given measure number.
        const getStaffBar = async (barNumber: number) => {
            return page.evaluate((bar) => {
                const viewer = document.querySelector(
                    `.bar-viewer.staff-mode[data-bar="${bar}"]`,
                );
                if (!viewer) {
                    return null;
                }

                // Find the staff-note-viewer-runs container.
                const runs = viewer.querySelector(".staff-note-viewer-runs");
                if (!runs) {
                    return null;
                }

                // Check for tuplet labels — there should be none.
                const tupletContainer = viewer.querySelector(".staff-note-viewer-tuplets");
                const hasTupletLabels = tupletContainer !== null
                    && tupletContainer.children.length > 0;

                // Collect direct children of the runs container and identify subdivisions.
                const children = Array.from(runs.children).map((child) => {
                    const el = child as HTMLElement;
                    // Subdivision containers lack the "staff-note-viewer-run" class
                    // that all individual note/rest/empty slots carry.
                    const isSubdivision = !el.classList.contains("staff-note-viewer-run");

                    if (isSubdivision) {
                        // Count note symbols inside the subdivision.
                        const noteSymbols = el.querySelectorAll(
                            ".staff-note-viewer-note-symbol",
                        );

                        // Count beam segments (across all inner notes + container beam).
                        const beamSegments = el.querySelectorAll(
                            ".staff-note-viewer-beam",
                        );

                        return {
                            type: "subdivision",
                            flex: el.style.flex,
                            noteCount: noteSymbols.length,
                            beamCount: beamSegments.length,
                        };
                    }

                    const hasNote = el.querySelector(
                        ".staff-note-viewer-note-symbol",
                    ) !== null;

                    return { type: hasNote ? "note" : "other" };
                });

                return { hasTupletLabels, runsChildCount: children.length, children };
            }, barNumber);
        };

        // --- Staff Bar 6 ---
        const staff6 = await getStaffBar(6);
        expect(staff6).not.toBeNull();
        if (!staff6) {
            throw new Error("Staff bar 6 not found");
        }
        // No tuplet labels — 2:1 is not a tuplet.
        expect(staff6.hasTupletLabels).toBe(false);

        // Find the subdivision container among runs children.
        const staff6Sub = staff6.children.find((c) => {
            return c.type === "subdivision";
        });
        expect(staff6Sub).toBeDefined();
        if (!staff6Sub) {
            throw new Error("Missing subdivision in bar 6 staff view");
        }
        expect(staff6Sub.noteCount).toBe(2);
        // 32nd notes have 3 beam segments (levels 1, 2, 3).
        expect(staff6Sub.beamCount).toBeGreaterThanOrEqual(3);

        // --- Staff Bar 7 ---
        const staff7 = await getStaffBar(7);
        expect(staff7).not.toBeNull();
        if (!staff7) {
            throw new Error("Staff bar 7 not found");
        }
        expect(staff7.hasTupletLabels).toBe(false);

        const staff7Sub = staff7.children.find((c) => {
            return c.type === "subdivision";
        });
        expect(staff7Sub).toBeDefined();
        if (!staff7Sub) {
            throw new Error("Missing subdivision in bar 7 staff view");
        }
        expect(staff7Sub.noteCount).toBe(2);
        expect(staff7Sub.beamCount).toBeGreaterThanOrEqual(3);

        // --- Staff Bar 8 ---
        const staff8 = await getStaffBar(8);
        expect(staff8).not.toBeNull();
        if (!staff8) {
            throw new Error("Staff bar 8 not found");
        }
        expect(staff8.hasTupletLabels).toBe(false);

        const staff8Sub = staff8.children.find((c) => {
            return c.type === "subdivision";
        });
        expect(staff8Sub).toBeDefined();
        if (!staff8Sub) {
            throw new Error("Missing subdivision in bar 8 staff view");
        }
        expect(staff8Sub.noteCount).toBe(4);
        expect(staff8Sub.beamCount).toBeGreaterThanOrEqual(3);
    });
});
