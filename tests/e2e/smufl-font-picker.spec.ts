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

/** The number of fonts the catalogue ships. */
const shippedFontCount = 7;

/**
 * Opens the app on a one-bar score in the staff view.
 *
 * @param page The page to drive.
 * @param sessionId The session the score is seeded into.
 * @param barCount The number of bars the score has.
 */
const openScore = async (page: Page, sessionId: string, barCount = 1): Promise<void> => {
    const stepResolution = 16;
    const meter = {
        beats: 4,
        beatUnits: 4,
        stepResolution,
        beatGroups: new Array<number>(4).fill(stepResolution / 4),
    };
    const bars = Array.from({ length: barCount }, (_, index) => {
        return {
            number: index + 1,
            meter,
            events: index === 0
                ? [{
                    start: { numerator: 0, denominator: 16 },
                    duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "1",
                }, { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } }]
                : [],
            subdivisions: [],
        };
    });
    const snapshot = {
        version: arrangementSnapshotVersion,
        title: "E2E music font",
        timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution },
        tracks: [{ id: 100, instrumentId: "1", measures: bars }],
    };

    await page.addInitScript(({ packed, id }: { packed: string; id: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: id }, "");
        window.sessionStorage.setItem("asb-session-id", id);
        window.localStorage.setItem(`asb-ui-settings-session-${id}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), id: sessionId });

    await page.goto("/");
    await expect(page.locator(".staff-prefix-time-signature")).toBeVisible();
};

/**
 * @param page The page to read from.
 *
 * @returns The font family the score's time signature is drawn with.
 */
const timeSignatureFontFamily = (page: Page): Promise<string> => {
    return page.evaluate(() => {
        const glyph = document.querySelector(".staff-prefix-time-signature .smufl-glyph-view");

        return glyph === null ? "" : getComputedStyle(glyph).fontFamily;
    });
};

/** The strokes one barline is drawn from, and the band it spans, in px. */
interface IBarlineStrokes {
    thin: number;

    thick: number;

    height: number;
}

/**
 * Reads the strokes the barline closing the given bar is drawn from and the band they span.
 *
 * @param page The page to read from.
 * @param barNumber The 1-based bar number whose closing barline is read.
 *
 * @returns The width of the barline's strokes and the height of the barline, all in px. A stroke the barline
 * does not have is read as zero.
 */
const barlineStrokes = (page: Page, barNumber: number): Promise<IBarlineStrokes> => {
    return page.evaluate((bar: number): IBarlineStrokes => {
        // The list is indexed without a bounds check, so the column may be missing.
        const column = document.querySelectorAll(".staff-measure-viewer")[bar - 1] as Element | undefined;
        const barline = column?.querySelector(".staff-note-viewer-barline") ?? null;
        const widthOf = (selector: string): number => {
            const stroke = barline === null ? null : barline.querySelector(selector);

            return stroke === null ? 0 : stroke.getBoundingClientRect().width;
        };

        return {
            thin: widthOf(".barline-view-thin"),
            thick: widthOf(".barline-view-thick"),
            height: barline === null ? 0 : barline.getBoundingClientRect().height,
        };
    }, barNumber);
};

test.describe("SMuFL music font", () => {
    test("offers every shipped font with a sample and a licence", async ({ page }) => {
        await openScore(page, "e2e-smufl-font-picker");

        await page.locator('[data-tutorial="display-options"]').click();
        await expect(page.locator("#settingsDialog")).toBeVisible();

        await page.locator("#settingsDialog .music-font-dropdown button").click();

        const items = page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li");
        await expect(items).toHaveCount(shippedFontCount);

        // Every entry shows its name and a sample that draws the font's own glyphs on two staff lines.
        await expect(items.first()).toContainText("Bravura");
        await expect(items.first().locator(".music-font-sample .smufl-glyph-view")).toHaveCount(6);
        await expect(items.first().locator(".music-font-sample-staff line")).toHaveCount(2);

        // The picker has to be closed again, because its popover covers the info button.
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await expect(page.locator("#settingsDialog .music-font-dropdown .dropdown-popup")).toBeHidden();

        await page.locator(".music-font-info-button").hover();
        await expect(page.locator("#musicFontInfo")).toBeVisible();
        await expect(page.locator("#musicFontInfo")).toContainText("OFL-1.1");
    });

    test("draws the score with the picked font, also after a reload", async ({ page }) => {
        await openScore(page, "e2e-smufl-font-choice");

        expect(await timeSignatureFontFamily(page)).toContain("Bravura");

        await page.locator('[data-tutorial="display-options"]').click();
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li")
            .filter({ hasText: "Leipzig" }).click();

        // The font is previewed while the dialog is open.
        await expect.poll(() => {
            return timeSignatureFontFamily(page);
        }).toContain("Leipzig");

        await page.locator("#settings-button-save").click();
        await expect(page.locator("#settingsDialog")).toBeHidden();

        // Waiting for the reload proves that the choice survives a restart, not just the session.
        await page.reload();
        await expect(page.locator(".staff-prefix-time-signature")).toBeVisible();

        expect(await timeSignatureFontFamily(page)).toContain("Leipzig");
    });

    test("draws the printed score with the picked font", async ({ page }) => {
        await openScore(page, "e2e-smufl-print-font");

        await page.locator('[data-tutorial="display-options"]').click();
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li")
            .filter({ hasText: "Leipzig" }).click();
        await page.locator("#settings-button-save").click();
        await expect(page.locator("#settingsDialog")).toBeHidden();

        // Keep the print DOM in place: the browser would tear it down on afterprint.
        await page.evaluate(() => {
            window.print = () => {
                // No-op.
            };
        });

        await page.locator("#printButton").click();
        const dialog = page.locator("#printDialog");
        await expect(dialog).toBeVisible();
        await dialog.locator("#print-button-print").click();

        await expect(page.locator(".print-root")).toBeAttached();

        // The printed score draws its symbols with the same font the score on screen uses.
        await expect.poll(() => {
            return page.evaluate(() => {
                const glyph = document.querySelector(".print-root .smufl-glyph-view");

                return glyph === null ? "" : getComputedStyle(glyph).fontFamily;
            });
        }).toContain("Leipzig");

        // Printing to a PDF embeds the font, so the pages carry the score's symbols and not a substitute.
        const pdf = await page.pdf({ format: "A4" });
        expect(pdf.toString("latin1")).toContain("Leipzig");

        await page.evaluate(() => {
            window.dispatchEvent(new Event("afterprint"));
        });
    });

    test("draws a barline in the stroke thickness the font states", async ({ page }) => {
        // Two bars, so the bar the test reads closes the score and draws both strokes of a final barline.
        await openScore(page, "e2e-smufl-barline-strokes", 2);

        // Bravura states a thin stroke of 0.16 staff spaces and a thick one of 0.5: at ten px per staff space that
        // is 1.6 and 5 px, and the drawing rounds every stroke to a whole pixel.
        const bravura = await barlineStrokes(page, 2);
        expect({ thin: bravura.thin, thick: bravura.thick }).toEqual({ thin: 2, thick: 5 });

        await page.locator('[data-tutorial="display-options"]').click();
        await page.locator("#settingsDialog .music-font-dropdown button").click();
        await page.locator("#settingsDialog .music-font-dropdown .dropdown-popup li")
            .filter({ hasText: "Leland" }).click();

        // The switch loads the font and publishes its metrics, which the score then draws with.
        await expect.poll(() => {
            return timeSignatureFontFamily(page);
        }).toContain("Leland");

        // Leland states 0.18 and 0.55 staff spaces, so its thick stroke is 6 px wide. The band the strokes span is
        // the staff's, not the font's, so it stays the same: that is how a barline reaches the staff lines whichever
        // font draws the score.
        const leland = await barlineStrokes(page, 2);
        expect({ thin: leland.thin, thick: leland.thick }).toEqual({ thin: 2, thick: 6 });
        expect(leland.height).toBe(bravura.height);
    });
});
