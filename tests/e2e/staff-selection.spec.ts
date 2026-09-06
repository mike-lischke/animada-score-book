/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { routeApi } from "./e2e-test-helpers.js";

const bolero3Url = "/?t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS";

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
