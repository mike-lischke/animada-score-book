/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Four beamed sixteenths, a quarter rest, then two blocks of sixteenths. */
const snapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Rest Length",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 200,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: [
                ...Array.from({ length: 4 }, (_, index) => {
                    return {
                        start: { numerator: index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
                { start: { numerator: 4, denominator: 16 }, duration: { numerator: 4, denominator: 16 } },
                ...Array.from({ length: 8 }, (_, index) => {
                    return {
                        start: { numerator: 8 + index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: "1",
                    };
                }),
            ],
            subdivisions: [],
        }],
    }],
};

/**
 * Reads the share of the measure a run occupies, as the renderer lays it out.
 *
 * @param page The page holding the staff view.
 * @param index The index of the run within its row.
 *
 * @returns The run's flex-grow value.
 */
const growOf = (page: Page, index: number): Promise<string> => {
    return page.evaluate((runIndex) => {
        const row = document.querySelector(".staff-measure-track-row");
        const run = row?.querySelectorAll<HTMLElement>(".staff-note-viewer-run")[runIndex];

        return run?.style.flex.split(" ")[0] ?? "";
    }, index);
};

/**
 * Reads the left edge of a run in viewport pixels.
 *
 * @param page The page holding the staff view.
 * @param index The index of the run within its row.
 *
 * @returns The left edge in pixels.
 */
const leftOf = async (page: Page, index: number): Promise<number> => {
    const box = await page.locator(".staff-measure-track-row .staff-note-viewer-run").nth(index).boundingBox();

    return box?.x ?? Number.NaN;
};

/**
 * Sums the share of the measure all rest runs occupy, as the renderer lays them out. A rest that is
 * notated as more than one glyph adds up to the span the user asked for.
 *
 * @param page The page holding the staff view.
 *
 * @returns The share of the measure taken by rests, rounded for comparison.
 */
const restSpanOf = async (page: Page): Promise<string> => {
    const total = await page.evaluate(() => {
        const runs = [...document.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];

        return runs.reduce((sum, run) => {
            return run.querySelector(".staff-note-viewer-rest-symbol") === null
                ? sum
                : sum + Number.parseFloat(run.style.flex);
        }, 0);
    });

    return total.toFixed(3);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-rest-length";
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
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
    await expect(page.locator("#editControlsHost .noteLengthToolbar")).toBeVisible();

    // Select the quarter rest between the two beamed groups.
    await page.locator(".staff-measure-track-row .staff-note-viewer-run").nth(4).click();
    await expect(page.locator(".staff-note-viewer-run.note-selected .staff-note-viewer-rest-symbol"))
        .toHaveCount(1);
});

test("changes a rest's length with the length hotkey", async ({ page }) => {
    const noteBehind = await leftOf(page, 5);

    await page.keyboard.press("Alt+5");
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.0625");

    // The rest gives up three steps, so the note behind it moves left.
    expect(await leftOf(page, 5)).toBeLessThan(noteBehind - 40);
});

test("changes a rest's length with the length toolbar", async ({ page }) => {
    const noteBehind = await leftOf(page, 5);

    await page.locator(".noteLengthButton").nth(1).click({ force: true });
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.5");

    // The rest takes three more steps, so the following notes give way and move right.
    expect(await leftOf(page, 5)).toBeGreaterThan(noteBehind + 40);
});

test("grows a rest by the augmentation dot", async ({ page }) => {
    expect(await restSpanOf(page)).toBe("0.250");

    await page.locator(".noteDotButton").click({ force: true });

    // The dot makes the rest a dotted quarter, which stands as one glyph wherever it is: the notes
    // behind the rest give way.
    await expect.poll(() => {
        return restSpanOf(page);
    }).toBe("0.375");
    await expect(page.locator(".staff-note-viewer-rest-symbol")).toHaveCount(1);
});

test("restores a rest's length step by step on undo", async ({ page }) => {
    const runs = page.locator(".staff-measure-track-row .staff-note-viewer-run");

    await page.keyboard.press("Alt+2");
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.5");
    await expect(runs).toHaveCount(9);

    // A whole note does not fit behind the four leading sixteenths, so the rest takes what is left of
    // the measure and the notes behind it are cut off at the bar line.
    await page.keyboard.press("Alt+1");
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.75");
    await expect(runs).toHaveCount(5);

    // Each undo has to restore both the length of the rest and the events the growth removed.
    await page.keyboard.press("Control+z");
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.5");
    await expect(runs).toHaveCount(9);

    await page.keyboard.press("Control+z");
    await expect.poll(() => {
        return growOf(page, 4);
    }).toBe("0.25");
    await expect(runs).toHaveCount(13);
});
