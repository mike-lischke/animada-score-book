/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { openSeededStaffScore, routeApi } from "./e2e-test-helpers.js";

/** Tracks of the seeded score. They make the score taller than the small viewport, so it can scroll. */
const seededTracks = 16;

/** Measures of the seeded score. */
const seededMeasures = 2;

/** Viewport sizes the edge alignment is checked in. The small one scrolls, the tall one need not. */
const viewports = [
    { width: 1236, height: 823 },
    { width: 1236, height: 1400 },
];

/** Where the scroll host is set to before the edges are measured. */
type ScrollPosition = "top" | "bottom";

interface IPanelEdges {
    spacerLeft: number;
    spacerRight: number;
    spacerTop: number;
    spacerBottom: number;
    mixerRight: number;
    mixerBottom: number;
    sidebarLeft: number | null;
    sidebarBottom: number | null;
    footerTop: number;
    borderLeftWidth: number;
    borderRightWidth: number;
}

/**
 * Scrolls the score to the given end and reads the rectangle edges of the bottom spacer and the panels it
 * continues. Two frames are awaited, so the layout has settled on the new scroll position.
 *
 * @param page The page under test.
 * @param position The scroll end to set.
 *
 * @returns The measured edges, in viewport px.
 */
const readPanelEdges = async (page: Page, position: ScrollPosition): Promise<IPanelEdges> => {
    return page.evaluate(async (where) => {
        const host = document.querySelector<HTMLElement>("#viewerScrollHost");
        if (host) {
            host.scrollTop = where === "bottom" ? host.scrollHeight : 0;
        }

        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    resolve();
                });
            });
        });

        const box = (selector: string): DOMRect => {
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error(`Missing element: ${selector}`);
            }

            return element.getBoundingClientRect();
        };

        const spacerElement = document.querySelector<HTMLElement>(".viewer-bottom-spacer");
        if (!spacerElement) {
            throw new Error("Missing element: .viewer-bottom-spacer");
        }

        const spacerStyle = getComputedStyle(spacerElement);
        const spacer = spacerElement.getBoundingClientRect();
        const mixer = box(".track-controls-list");
        const sidebar = document.querySelector(".track-edit-sidebar")?.getBoundingClientRect() ?? null;
        const footer = box("#appFooter");

        return {
            spacerLeft: spacer.left,
            spacerRight: spacer.right,
            spacerTop: spacer.top,
            spacerBottom: spacer.bottom,
            mixerRight: mixer.right,
            mixerBottom: mixer.bottom,
            sidebarLeft: sidebar?.left ?? null,
            sidebarBottom: sidebar?.bottom ?? null,
            footerTop: footer.top,
            borderLeftWidth: parseFloat(spacerStyle.borderLeftWidth),
            borderRightWidth: parseFloat(spacerStyle.borderRightWidth),
        };
    }, position);
};

/**
 * Asserts that two edges are the same within the one pixel a border adds.
 *
 * @param actual The measured edge.
 * @param expected The edge it has to line up with.
 * @param label A description used when the assertion fails.
 */
const expectWithinOnePixel = (actual: number, expected: number, label: string): void => {
    expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

for (const viewport of viewports) {
    test(`lines the bottom spacer up with the panels at ${viewport.height}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openSeededStaffScore(page, seededTracks, seededMeasures);
        await page.locator("#editModeButton").click({ force: true });
        await expect(page.locator(".track-edit-sidebar")).toBeVisible();

        for (const position of ["top", "bottom"] as ScrollPosition[]) {
            const edges = await readPanelEdges(page, position);
            expect(edges.sidebarLeft).not.toBeNull();
            expect(edges.sidebarBottom).not.toBeNull();

            // The spacer's left edge sits on the mixer's right border, its right edge on the sidebar's left border.
            expectWithinOnePixel(edges.spacerLeft, edges.mixerRight - 1, `spacer left (${position})`);
            expectWithinOnePixel(edges.spacerRight, edges.sidebarLeft! + 1, `spacer right (${position})`);

            // Both panels end exactly where the spacer begins.
            expectWithinOnePixel(edges.spacerTop, edges.sidebarBottom!, `spacer top vs sidebar (${position})`);
            expectWithinOnePixel(edges.spacerTop, edges.mixerBottom, `spacer top vs mixer (${position})`);

            // Each divider continues a panel's own border.
            expect(edges.borderLeftWidth).toBe(1);
            expect(edges.borderRightWidth).toBe(1);

            // At the end of the scroll the spacer reaches down to the footer.
            if (position === "bottom") {
                expectWithinOnePixel(edges.spacerBottom, edges.footerTop, "spacer bottom vs footer");
            }
        }
    });
}

test("draws the spacer's right divider only while editing", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    // Outside edit mode the sidebar is gone, so the spacer only carries the mixer's divider on the left.
    const outside = await readPanelEdges(page, "top");
    expect(outside.borderLeftWidth).toBe(1);
    expect(outside.borderRightWidth).toBe(0);

    await page.locator("#editModeButton").click({ force: true });
    await expect(page.locator(".track-edit-sidebar")).toBeVisible();

    const inside = await readPanelEdges(page, "top");
    expect(inside.borderLeftWidth).toBe(1);
    expect(inside.borderRightWidth).toBe(1);
});
