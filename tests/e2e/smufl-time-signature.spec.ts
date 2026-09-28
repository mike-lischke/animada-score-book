/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * Builds a minimal 1-bar arrangement snapshot with the given time signature.
 *
 * @param timeSignature The time signature to notate, e.g. "4/4".
 *
 * @returns A snapshot object suitable for `stringifyPackedArrangement`.
 */
const buildSnapshot = (timeSignature: string) => {
    const [beats, beatUnits] = timeSignature.split("/").map(Number);
    const stepResolution = 16;

    return {
        version: arrangementSnapshotVersion,
        title: `E2E ${timeSignature}`,
        timeParams: { timeSignature, tempo: 120, length: 1, pulse: "1/4", stepResolution },
        tracks: [{
            id: 100,
            instrumentId: "1",
            measures: [{
                number: 1,
                meter: {
                    beats,
                    beatUnits,
                    stepResolution,
                    beatGroups: new Array<number>(beats).fill(stepResolution / beatUnits),
                },
                events: [
                    {
                        start: { numerator: 0, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    },
                    { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
                ],
                subdivisions: [],
            }],
        }],
    };
};

/**
 * Opens the app on a one-bar score in the staff view.
 *
 * @param page The page to drive.
 * @param timeSignature The time signature of the score.
 * @param sessionId The session the score is seeded into.
 */
const openScore = async (page: Page, timeSignature: string, sessionId: string): Promise<void> => {
    await page.addInitScript(({ packed, id }: { packed: string; id: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: id }, "");
        window.sessionStorage.setItem("asb-session-id", id);
        window.localStorage.setItem(`asb-ui-settings-session-${id}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(buildSnapshot(timeSignature)), id: sessionId });

    await page.goto("/");
    await expect(page.locator(".staff-prefix-time-signature")).toBeVisible();
};

/**
 * Reads the codepoints of the glyph characters the time signature draws.
 *
 * @param page The page to read from.
 *
 * @returns The codepoints in document order.
 */
const timeSignatureCodepoints = (page: Page): Promise<number[]> => {
    return page.evaluate(() => {
        const glyphs = [...document.querySelectorAll(".staff-prefix-time-signature text")];

        return glyphs.map((glyph) => {
            // SMuFL glyphs live in the BMP private use area, so the UTF-16 code unit is the codepoint.
            return glyph.textContent.charCodeAt(0);
        });
    });
};

test.describe("SMuFL time signature", () => {
    test("draws 4/4 as the common time glyph of the loaded music font", async ({ page }) => {
        await openScore(page, "4/4", "e2e-smufl-common-time");

        expect(await timeSignatureCodepoints(page)).toEqual([0xE08A]);

        const glyph = await page.evaluate(() => {
            const svg = document.querySelector(".staff-prefix-time-signature .smufl-glyph-view");
            const text = document.querySelector(".staff-prefix-time-signature text");
            const box = svg?.getBoundingClientRect();

            return {
                fontLoaded: document.fonts.check("1em Bravura"),
                fontFamily: svg === null ? "" : getComputedStyle(svg).fontFamily,
                fontSize: text === null ? "" : getComputedStyle(text).fontSize,
                textAnchor: text?.getAttribute("text-anchor") ?? "",
                boxWidth: box?.width ?? 0,
                boxHeight: box?.height ?? 0,
            };
        });

        expect(glyph.fontLoaded).toBe(true);
        expect(glyph.fontFamily).toContain("Bravura");

        // Four staff spaces per em, in a box of two by two staff spaces.
        expect(glyph.fontSize).toBe("40px");
        expect(glyph.textAnchor).toBe("middle");
        expect(glyph.boxWidth).toBe(20);
        expect(glyph.boxHeight).toBe(20);
    });

    test("draws 3/4 as a digit glyph above a digit glyph", async ({ page }) => {
        await openScore(page, "3/4", "e2e-smufl-three-four");

        expect(await timeSignatureCodepoints(page)).toEqual([0xE083, 0xE084]);
    });
});
