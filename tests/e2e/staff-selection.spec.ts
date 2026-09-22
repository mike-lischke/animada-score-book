/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { routeApi } from "./e2e-test-helpers.js";

const bolero3Url = "/?t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS";

/**
 * Clicks the centre of an element. Beams and tuplet markers are drawn with `pointer-events: none`,
 * so they can only be hit by coordinate.
 *
 * @param page The page to click in.
 * @param locator The element to click.
 */
const clickCenter = async (page: Page, locator: Locator): Promise<void> => {
    const box = await locator.boundingBox();
    if (!box) {
        throw new Error("Element has no bounding box.");
    }

    await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));
};

/**
 * Counts the noteheads the selection overlays cover.
 *
 * @param page The page to inspect.
 *
 * @returns The number of covered noteheads.
 */
const selectedNoteCount = async (page: Page): Promise<number> => {
    return page.evaluate(() => {
        const overlays = [...document.querySelectorAll<HTMLElement>(".selection-overlay")].map((element) => {
            return element.getBoundingClientRect();
        });
        const noteheads = [...document.querySelectorAll<HTMLElement>(
            ".staff-note-viewer-note-run .note-image",
        )].map((element) => {
            return element.getBoundingClientRect();
        });

        return noteheads.filter((notehead) => {
            const center = notehead.left + (notehead.width / 2);

            return overlays.some((overlay) => {
                return overlay.left <= center && center <= overlay.right;
            });
        }).length;
    });
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Staff view selection", () => {
    test.beforeEach(async ({ page }) => {
        // Use the Beija Flor arrangement which has tuplets, beams, and regular notes.
        await page.goto("/?a2=4-4.100.4.1-4.16.ancT9sB~3cD5eiVZCPtZ8-g0q8s2zbqX1uH.1wkTlpVed1IXUvNs1E");

        await expect(page.locator("#trackViewerHost")).toBeVisible();

        // Switch to staff mode.
        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
    });

    test("clicking a single note selects it with the note-selected CSS class", async ({ page }) => {
        // Find the first note symbol in the first bar of the first track.
        const firstNote = page.locator(".staff-measure-viewer").first()
            .locator(".staff-measure-track-row .staff-note-viewer-note-symbol").first();

        await expect(firstNote).toBeVisible();
        await firstNote.click();

        // The parent run should have the note-selected class.
        const selectedRun = page.locator(".staff-note-viewer-run.note-selected").first();
        await expect(selectedRun).toBeVisible();
    });

    test("clicking a beam selects the beamed note group", async ({ page }) => {
        // Find a beam element in the staff view. Beams have pointer-events: none,
        // so we must click by coordinates, not via element.click().
        const beam = page.locator(".staff-note-viewer-beam").first();
        await expect(beam).toBeVisible();

        const box = await beam.boundingBox();
        if (!box) {
            test.fail(true, "Could not get beam bounding box");

            return;
        }

        // Click at the center of the beam.
        await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));

        // A selection overlay should appear.
        const overlay = page.locator(".selection-overlay").first();
        await expect(overlay).toBeVisible();
    });

    test("clicking a subdivision-crossing beam selects the beamed note group", async ({ page }) => {
        // Bolero 3 has a nested subdivision. Beams are anchored at each note's onset, so a beam
        // connecting a subdivision's last inner note to the next note outside spans the boundary
        // without exceeding its own run's width.
        await page.goto(bolero3Url);
        await expect(page.locator("#trackViewerHost")).toBeVisible();

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        // Find a shared beam whose run sits inside a subdivision container (not a direct child of
        // the top-level runs container), i.e. a beam that crosses a subdivision boundary.
        const crossingBeamBox = await page.evaluate(() => {
            const nestedRun = Array.from(document.querySelectorAll<HTMLElement>(".staff-note-viewer-run"))
                .find((run) => {
                    return run.parentElement !== null
                        && !run.parentElement.classList.contains("staff-note-viewer-runs");
                });

            const beam = nestedRun?.querySelector<HTMLElement>(".staff-note-viewer-beam");

            if (!beam) {
                return null;
            }

            const rect = beam.getBoundingClientRect();

            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        });

        if (!crossingBeamBox) {
            test.skip(true, "No nested-subdivision beam found in this arrangement");

            return;
        }

        // Click at the center of the beam for a stable hit.
        await page.mouse.click(
            crossingBeamBox.x + (crossingBeamBox.width / 2),
            crossingBeamBox.y + (crossingBeamBox.height / 2),
        );

        // A selection overlay should appear for the beam group.
        const overlay = page.locator(".selection-overlay").first();
        await expect(overlay).toBeVisible();
    });

    test("clicking a tuplet bracket selects the tuplet note group", async ({ page }) => {
        // Find a tuplet bracket or number. These have pointer-events: none,
        // so we click by coordinates.
        const tupletEl = page.locator(
            ".staff-note-viewer-tuplet-bracket, .staff-note-viewer-tuplet-number",
        ).first();

        await expect(tupletEl).toBeVisible();

        const box = await tupletEl.boundingBox();
        if (!box) {
            test.fail(true, "Could not get tuplet bounding box");

            return;
        }

        // Click at the center of the tuplet element.
        await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));

        // A selection overlay should appear.
        const overlay = page.locator(".selection-overlay").first();
        await expect(overlay).toBeVisible();

        // The click means the whole tuplet, so the overlays together span its slots and not just the
        // one run that happens to sit under the cursor.
        const overlayWidth = await page.evaluate(() => {
            return [...document.querySelectorAll<HTMLElement>(".selection-overlay")]
                .reduce((total, element) => {
                    return total + element.getBoundingClientRect().width;
                }, 0);
        });
        const runWidth = await page.evaluate(() => {
            return document.querySelector<HTMLElement>(".staff-note-viewer-run")?.getBoundingClientRect().width ?? 0;
        });

        expect(overlayWidth).toBeGreaterThan(runWidth * 1.5);
    });

    test("clicking a beam group whose notes start off the grid selects the whole group", async ({ page }) => {
        // A 32nd rest opens the bar, so every following note starts between two grid steps. The old
        // step-based group search dropped such notes and left the row without a group at all.
        const snapshot = {
            version: 4,
            title: "E2E Off-Grid Beam Group",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 200,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 } },
                        ...[0, 1, 2, 3].map((index) => {
                            return {
                                start: { numerator: 1 + (index * 2), denominator: 32 },
                                duration: { numerator: 1, denominator: 16 },
                                noteStyleId: "1",
                            };
                        }),
                        { start: { numerator: 9, denominator: 32 }, duration: { numerator: 23, denominator: 32 } },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-off-grid-beam";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: packed,
                viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
            }));
        }, stringifyPackedArrangement(snapshot));
        await page.goto("/");
        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        const beam = page.locator(".staff-note-viewer-beam").first();
        await expect(beam).toBeVisible();

        const box = await beam.boundingBox();
        if (!box) {
            test.fail(true, "Could not get beam bounding box");

            return;
        }

        await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));

        // The beam connects four sixteenths, so the selection spans all four runs and not just the one
        // whose segment was clicked.
        const overlayWidth = await page.evaluate(() => {
            return [...document.querySelectorAll<HTMLElement>(".selection-overlay")]
                .reduce((total, element) => {
                    return total + element.getBoundingClientRect().width;
                }, 0);
        });
        const runWidth = await page.evaluate(() => {
            return document.querySelector<HTMLElement>(".staff-note-viewer-run")?.getBoundingClientRect().width ?? 0;
        });

        expect(overlayWidth).toBeGreaterThan(runWidth * 2);
    });

    test("clicking a nested tuplet's marker selects the tuplet the marker belongs to", async ({ page }) => {
        // A triplet over a quarter whose first slot holds another triplet. The inner marker is drawn
        // below the notes and the outer one above, so a click addresses the tuplet whose marker sits
        // under the cursor instead of the row as a whole.
        const innerSlot = { numerator: 1, denominator: 36 };
        const outerSlot = { numerator: 1, denominator: 12 };
        const snapshot = {
            version: 4,
            title: "E2E Nested Tuplets",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 300,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        { start: { numerator: 0, denominator: 1 }, duration: innerSlot, noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 36 }, duration: innerSlot, noteStyleId: "1" },
                        { start: { numerator: 2, denominator: 36 }, duration: innerSlot, noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 12 }, duration: outerSlot, noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 9 }, duration: outerSlot, noteStyleId: "1" },
                        { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
                    ],
                    subdivisions: [
                        { startIndex: 0, actual: 3, normal: 4, isTuplet: true },
                        { startIndex: 0, actual: 3, normal: 1, isTuplet: true },
                    ],
                }],
            }],
        };

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-nested-tuplets";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: packed,
                viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
            }));
        }, stringifyPackedArrangement(snapshot));
        await page.goto("/");
        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        const innerNumber = page.locator(".staff-note-viewer-tuplet-below .staff-note-viewer-tuplet-text").first();
        await expect(innerNumber).toBeVisible();

        // The digit sits below the notes, where it cannot collide with a notehead.
        await clickCenter(page, innerNumber);

        // Selects the inner triplet (three slots) and neither the row as a whole nor the outer tuplet
        // with its five events.
        expect(await selectedNoteCount(page)).toBe(3);
    });

    test("dragging a rect across group markers selects those groups", async ({ page }) => {
        // Two beamed groups of four sixteenths, separated by quarter rests.
        const sixteenth = { numerator: 1, denominator: 16 };
        const snapshot = {
            version: 4,
            title: "E2E Two Beam Groups",
            timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
            tracks: [{
                id: 400,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [
                        ...[0, 1, 2, 3].map((step) => {
                            return {
                                start: { numerator: step, denominator: 16 },
                                duration: sixteenth,
                                noteStyleId: "1",
                            };
                        }),
                        { start: { numerator: 4, denominator: 16 }, duration: { numerator: 1, denominator: 4 } },
                        ...[8, 9, 10, 11].map((step) => {
                            return {
                                start: { numerator: step, denominator: 16 },
                                duration: sixteenth,
                                noteStyleId: "1",
                            };
                        }),
                        { start: { numerator: 12, denominator: 16 }, duration: { numerator: 1, denominator: 4 } },
                    ],
                    subdivisions: [],
                }],
            }],
        };

        await page.addInitScript((packed: string) => {
            const sessionId = "e2e-two-beam-groups";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: packed,
                viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
            }));
        }, stringifyPackedArrangement(snapshot));
        await page.goto("/");
        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        // Drag through the beam band alone: it lies above the noteheads and above the part of a stem
        // a click addresses, so the rectangle meets markers and no notes.
        const band = await page.evaluate(() => {
            const beams = [...document.querySelectorAll<HTMLElement>(".staff-note-viewer-beam")];
            const first = beams[0].getBoundingClientRect();
            const last = beams[beams.length - 1].getBoundingClientRect();
            let top = first.top;
            let bottom = first.bottom;

            for (const element of beams) {
                const rect = element.getBoundingClientRect();
                top = Math.min(top, rect.top);
                bottom = Math.max(bottom, rect.bottom);
            }

            return { left: first.left, top: top + 1, right: last.right, bottom: bottom - 1 };
        });

        await page.mouse.move(band.left, band.top);
        await page.mouse.down();
        await page.mouse.move(band.right, band.bottom, { steps: 10 });
        await page.mouse.up();

        // The rectangle covers markers of both groups and no notes, so each group becomes a selection of
        // its own: one overlay per group, and no note-level highlight.
        await expect(page.locator(".selection-overlay")).toHaveCount(2);
        await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(0);
    });

    test("dragging a selection rect across notes selects them individually", async ({ page }) => {
        // Find two adjacent note runs.
        const runs = page.locator(
            ".staff-measure-track-row .staff-note-viewer-run:has(.staff-note-viewer-note-symbol)",
        );
        const count = await runs.count();
        if (count < 2) {
            test.skip(true, "Not enough note runs for drag test");
        }

        const firstRun = runs.nth(0);
        const secondRun = runs.nth(1);

        const firstBox = await firstRun.boundingBox();
        const secondBox = await secondRun.boundingBox();
        if (!firstBox || !secondBox) {
            test.fail(true, "Could not get bounding boxes");

            return;
        }

        // Drag from top-left of first run to bottom-right of second run.
        await page.mouse.move(firstBox.x, firstBox.y);
        await page.mouse.down();
        await page.mouse.move(secondBox.x + secondBox.width, secondBox.y + secondBox.height, { steps: 10 });
        await page.mouse.up();

        // Both runs should now have the note-selected class.
        const selectedCount = await page.locator(".staff-note-viewer-run.note-selected").count();
        expect(selectedCount).toBeGreaterThanOrEqual(2);
    });

    test("deselecting by clicking empty space clears all selections", async ({ page }) => {
        // First select a note.
        const firstNote = page.locator(
            ".staff-measure-track-row .staff-note-viewer-note-symbol",
        ).first();
        await expect(firstNote).toBeVisible();
        await firstNote.click();

        // Verify it was selected.
        await expect(page.locator(".staff-note-viewer-run.note-selected").first()).toBeVisible();

        // Click on empty space (the track viewer host).
        const host = page.locator("#trackViewerHost");
        await host.click({ position: { x: 10, y: 10 } });

        // The note-selected class should be gone.
        await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(0);
    });
});
