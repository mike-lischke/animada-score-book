/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot, IRepeatBar, ITrackPieceSnapshot } from "../../src/core/types/general.js";
import { routeApi, toolbarButton } from "./e2e-test-helpers.js";

const meter = { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] };

/** The codepoint of the glyph the repeat dots are drawn with. */
const repeatDots = String.fromCodePoint(0xE043);

/**
 * @param number The 1-based bar number.
 *
 * @returns A bar holding a quarter note and a rest.
 */
const notePiece = (number: number): ITrackPieceSnapshot => {
    return {
        number,
        meter,
        events: [
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ],
        subdivisions: [],
    };
};

/**
 * @param number The 1-based bar number.
 *
 * @returns A bar holding eight eighth notes, so its last note ends the bar.
 */
const eighthPiece = (number: number): ITrackPieceSnapshot => {
    return {
        number,
        meter,
        events: Array.from({ length: 8 }, (_, index) => {
            return {
                start: { numerator: index, denominator: 8 },
                duration: { numerator: 1, denominator: 8 },
                noteStyleId: "1",
            };
        }),
        subdivisions: [],
    };
};

/**
 * @param number The 1-based bar number.
 *
 * @returns A bar holding nothing but a whole-measure rest.
 */
const restPiece = (number: number): ITrackPieceSnapshot => {
    return {
        number,
        meter,
        events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
        subdivisions: [],
    };
};

/**
 * @param barCount The number of bars the score has.
 * @param repeats The repeat marks, keyed by 1-based bar number.
 * @param piece The content every bar of the score holds.
 *
 * @returns The snapshot that carries them.
 */
const snapshotWith = (barCount: number, repeats: Record<number, IRepeatBar>,
    piece = notePiece): IArrangementSnapshot => {
    return {
        version: arrangementSnapshotVersion,
        title: "E2E repeat barlines",
        timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 300,
            instrumentId: "0",
            measures: Array.from({ length: barCount }, (_, index) => {
                return piece(index + 1);
            }),
        }],
        extensions: { repeatBars: repeats },
    };
};

/**
 * Loads a score into the app through the session settings the app restores on start.
 *
 * @param page The page under test.
 * @param score The score to load.
 */
const seedScore = async (page: Page, score: IArrangementSnapshot): Promise<void> => {
    await routeApi(page);
    await page.addInitScript((packed: string) => {
        const sessionId = "e2e-repeat-barlines";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, stringifyPackedArrangement(score));

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure number.
 *
 * @returns The rendered measure column.
 */
const staffBar = (page: Page, barNumber: number): Locator => {
    return page.locator(".staff-measure-viewer").nth(barNumber - 1);
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure number.
 *
 * @returns The barline the measure column closes with, which the score draws itself: the dots are the font's
 * glyph and the strokes are drawn, so a repeat is recognised by the parts it is assembled from.
 */
const closingBarline = (page: Page, barNumber: number): Locator => {
    return staffBar(page, barNumber).locator(".staff-note-viewer-barline-end, .staff-note-viewer-barline-centred");
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure number.
 *
 * @returns The barline the measure column opens with.
 */
const openingBarline = (page: Page, barNumber: number): Locator => {
    return staffBar(page, barNumber).locator(".staff-note-viewer-barline-start");
};

interface IRepeatGaps {
    opening: number;

    closing: number;
}

/**
 * Measures the room a bar keeps from the repeat dots on either side of it.
 *
 * @param page The page to read from.
 * @param barNumber The 1-based bar number.
 *
 * @returns The distance from the dots of the barline the bar opens with to its first note and from its last note
 * to the dots of the barline it closes with, in px. A barline the bar does not carry is read as zero.
 */
const repeatGaps = (page: Page, barNumber: number): Promise<IRepeatGaps> => {
    return page.evaluate((bar: number): IRepeatGaps => {
        // The list is indexed without a bounds check, so the column may be missing.
        const column = document.querySelectorAll(".staff-measure-viewer")[bar - 1] as Element | undefined;
        const viewer = column?.querySelector(".staff-note-viewer") ?? null;
        if (viewer === null) {
            return { opening: 0, closing: 0 };
        }

        const heads = [...viewer.querySelectorAll(".staff-note-head")];
        const openingBox = viewer.querySelector(".staff-note-viewer-barline-start")?.getBoundingClientRect()
            ?? null;
        const closingBox = viewer
            .querySelector(".staff-note-viewer-barline-end, .staff-note-viewer-barline-centred")
            ?.getBoundingClientRect() ?? null;

        // The dots are the innermost part of a repeat barline, so the edge of its ink is the edge the notes face.
        return {
            opening: openingBox === null ? 0 : heads[0].getBoundingClientRect().left - openingBox.right,
            closing: closingBox === null
                ? 0
                : closingBox.left - heads[heads.length - 1].getBoundingClientRect().right,
        };
    }, barNumber);
};

/**
 * @param page The page to read from.
 * @param barNumber The 1-based bar number.
 *
 * @returns Where the whole-measure rest of the bar sits, as a fraction of the bar's width.
 */
const restCentre = (page: Page, barNumber: number): Promise<number> => {
    return page.evaluate((bar: number): number => {
        // The list is indexed without a bounds check, so the column may be missing.
        const column = document.querySelectorAll(".staff-measure-viewer")[bar - 1] as Element | undefined;
        const viewer = column?.querySelector(".staff-note-viewer") ?? null;
        const rest = viewer?.querySelector(".staff-note-viewer-rest-symbol") ?? null;
        if (viewer === null || rest === null) {
            return 0;
        }

        const viewerBox = viewer.getBoundingClientRect();
        const restBox = rest.getBoundingClientRect();

        return ((restBox.left + (restBox.width / 2)) - viewerBox.left) / viewerBox.width;
    }, barNumber);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("draws the barline a repeated section opens at on the bar it opens", async ({ page }) => {
    await seedScore(page, snapshotWith(3, { 2: { start: true } }));

    // A repeat that only opens is the opening barline of its own bar, so the bar before it draws none at all.
    await expect(closingBarline(page, 1)).toHaveCount(0);
    await expect(openingBarline(page, 2).locator(".barline-view-thin")).toHaveCount(1);
    await expect(openingBarline(page, 2).locator(".barline-view-dots")).toHaveCount(1);

    // The thick stroke faces away from the repeated section and the dots reach into the bar that opens.
    await expect(openingBarline(page, 2).locator(".barline-view-part").first())
        .toHaveClass(/barline-view-thick/);
    await expect(openingBarline(page, 2).locator(".barline-view-part").last())
        .toHaveClass(/barline-view-dots/);
});

test("draws the barline a repeated section closes at on the last bar", async ({ page }) => {
    await seedScore(page, snapshotWith(2, { 2: { end: true } }));

    // The mark wins over the final barline the bar would close the score with otherwise.
    await expect(closingBarline(page, 2).locator(".barline-view-dots")).toHaveCount(1);
    await expect(closingBarline(page, 2).locator(".barline-view-dots text")).toHaveText(repeatDots);

    // The thick stroke faces away from the repeated section, which is the right-hand side here.
    await expect(closingBarline(page, 2).locator(".barline-view-part").last())
        .toHaveClass(/barline-view-thick/);
});

test("draws one barline for a repeat that closes and opens at the same bar", async ({ page }) => {
    await seedScore(page, snapshotWith(2, { 1: { end: true }, 2: { start: true } }));

    // Both repeats share one barline, which straddles the boundary with the dots on both sides.
    await expect(closingBarline(page, 1)).toHaveCount(1);
    await expect(closingBarline(page, 1).locator(".barline-view-dots")).toHaveCount(2);
    await expect(openingBarline(page, 2)).toHaveCount(0);
});

test("opens the score with a repeat barline when the first bar starts a section", async ({ page }) => {
    await seedScore(page, snapshotWith(2, { 1: { start: true } }));

    // Nothing stands before the first bar, so it opens the score with a barline of its own.
    await expect(openingBarline(page, 1).locator(".barline-view-dots")).toHaveCount(1);
});

test("keeps the same room from a repeat barline on either side of a bar", async ({ page }) => {
    await seedScore(page, snapshotWith(3, { 1: { start: true, end: true } }, eighthPiece));

    // The barline a bar opens with keeps the room the bar's last note leaves before the one it closes with, so a
    // bar stands as far from the dots on either side of a repeated section.
    const gaps = await repeatGaps(page, 1);
    expect(gaps.opening).toBeGreaterThan(20);
    expect(Math.abs(gaps.opening - gaps.closing)).toBeLessThanOrEqual(gaps.closing * 0.1);
});

test("keeps the whole-measure rest of a bar centred under a repeat barline", async ({ page }) => {
    await seedScore(page, snapshotWith(2, { 1: { start: true, end: true } }, restPiece));

    // A rest sits centred in its slot and keeps the room of the barline by itself, so such a bar is not pushed.
    expect(await restCentre(page, 1)).toBeCloseTo(0.5, 2);
});

test("hides repeat marks for a note selection", async ({ page }) => {
    await seedScore(page, snapshotWith(3, {}));

    await page.locator("#editModeButton").click({ force: true });

    // A note is not a bar, so neither mark can be set on the selection.
    await staffBar(page, 2).locator(".staff-note-head-symbol").first().click();
    await expect(page.locator("#selectionEditPopup .subdivisionToolbarHost")).toBeVisible();

    await expect(toolbarButton(page, "Repeat start")).toHaveCount(0);
    await expect(toolbarButton(page, "Repeat end")).toHaveCount(0);
});
