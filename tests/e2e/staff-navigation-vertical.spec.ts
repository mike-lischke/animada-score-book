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

test("vertical navigation from a rest picks the note directly below its glyph", async ({ page }) => {
    const snapshot = {
        version: 4,
        title: "E2E Vertical Navigation",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [
            {
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
                        // Half rest spanning steps 0..8 — its glyph sits at the centre (step 4),
                        // far from the run's left edge.
                        { start: { numerator: 0, denominator: 16 }, duration: { numerator: 8, denominator: 16 } },
                        {
                            start: { numerator: 8, denominator: 16 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "1",
                        },
                    ],
                    subdivisions: [],
                }],
            },
            {
                id: 200,
                instrumentId: "0",
                measures: [{
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    events: Array.from({ length: 16 }, (_, index) => {
                        return {
                            start: { numerator: index, denominator: 16 },
                            duration: { numerator: 1, denominator: 16 },
                            noteStyleId: "1",
                        };
                    }),
                    subdivisions: [],
                }],
            },
        ],
    };

    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-vertical-navigation";
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

    // Select the half rest in the first track.
    const rest = page.locator(".staff-measure-track-row").first()
        .locator(".staff-note-viewer-rest-symbol").first();
    await rest.click();
    await expect(page.locator(".staff-note-viewer-run.note-selected").first()).toBeVisible();

    const glyphCenterX = (selector: string): number => {
        const symbol = document.querySelector<HTMLElement>(selector);
        if (!symbol) {
            return Number.NaN;
        }

        const rect = symbol.getBoundingClientRect();

        return rect.left + (rect.width / 2);
    };

    const restX = await page.evaluate(glyphCenterX, ".staff-note-viewer-rest-symbol");

    await page.keyboard.press("ArrowDown");

    const selectedX = await page.evaluate(
        glyphCenterX,
        ".staff-note-viewer-run.note-selected .staff-note-viewer-note-symbol",
    );

    expect(selectedX).not.toBeNaN();
    // The selected note must sit within one grid step (80px) of the rest's glyph centre.
    expect(Math.abs(selectedX - restX)).toBeLessThan(80);
});
