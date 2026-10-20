/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode, TrackViewMode, type IArrangementSnapshot } from "../../src/core/types/general.js";
import { ensureStaffBarRendered, playbackBars, routeApi, showTrackView } from "./e2e-test-helpers.js";

/** Three bars of quarter notes on two tracks, so the play head shows which bars a performance runs. */
const snapshot: IArrangementSnapshot = {
    version: arrangementSnapshotVersion,
    title: "E2E Play Focus",
    timeParams: { timeSignature: "4/4", tempo: 240, length: 3, pulse: "1/4", stepResolution: 16 },
    tracks: [0, 1].map((track) => {
        return {
            id: 400 + track,
            instrumentId: String(track % 2),
            measures: [1, 2, 3].map((number) => {
                return {
                    number,
                    meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                    events: [0, 1, 2, 3].map((beat) => {
                        return {
                            start: { numerator: beat, denominator: 4 },
                            duration: { numerator: 1, denominator: 4 },
                            noteStyleId: "1",
                        };
                    }),
                    subdivisions: [],
                };
            }),
        };
    }),
};

/**
 * Opens the app on the seeded score in the given view, outside Zen mode and outside edit mode.
 *
 * @param page The page under test.
 * @param mode The view the score is shown in.
 */
const openScore = async (page: Page, mode: TrackViewMode): Promise<void> => {
    await page.addInitScript((data: { packed: string; mode: TrackViewMode; entryMode: EditEntryMode; }) => {
        const sessionId = "e2e-play-focus";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            loop: false,
            countIn: false,
            tutorialEnabled: false,
            viewSettings: { arrangementViewSettings: { displayMode: data.mode } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), mode, entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator(`#trackViewerContainer.view-${mode}`)).toBeVisible();
    await expect(page.locator(".measure-focus-button")).not.toHaveCount(0);
};

/**
 * @param page The page under test.
 * @param bar The 1-based measure number whose focus switch is looked up.
 *
 * @returns The focus switch of that measure.
 */
const focusSwitch = (page: Page, bar: number): Locator => {
    return page.locator(`.measure-focus-button[data-bar="${bar}"]`);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

for (const mode of [TrackViewMode.Grid, TrackViewMode.Staff]) {
    test.describe(`Play focus in ${mode}`, () => {
        test("shows a focus switch on every measure without Zen mode", async ({ page }) => {
            await openScore(page, mode);

            // The staff view renders a window of its measures, so every column that is drawn carries a switch.
            const columns = page.locator(`.${mode}-measure-viewer`);
            const renderedColumns = await columns.count();

            // The switch belongs to the score, so it is there without Zen mode and without edit mode.
            await expect(page.locator("#zenModeButton")).toHaveAttribute("aria-pressed", "false");
            await expect(page.locator("#appContent")).not.toHaveClass(/score-editing/);
            await expect(page.locator(".measure-focus-button")).toHaveCount(renderedColumns);
            await expect(focusSwitch(page, 1)).toHaveAttribute("title", "Play Focus");
            await expect(focusSwitch(page, 1)).toHaveAttribute("aria-pressed", "false");
            await expect(focusSwitch(page, 1).locator(".measureFocusDot")).toHaveCount(1);
        });

        test("plays only the focused bar", async ({ page }) => {
            await openScore(page, mode);
            if (mode === TrackViewMode.Staff) {
                await ensureStaffBarRendered(page, 2);
            }

            const button = focusSwitch(page, 2);
            await button.scrollIntoViewIfNeeded();
            await button.click();
            await expect(button).toHaveAttribute("aria-pressed", "true");

            await page.locator("#playbackButton").click();
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

            expect(await playbackBars(page)).toEqual([2]);
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "false");

            // The focus outlives the performance, so the same bar plays again on the next start.
            await expect(button).toHaveAttribute("aria-pressed", "true");
        });
    });
}

test("keeps the focus when the view switches", async ({ page }) => {
    await openScore(page, TrackViewMode.Grid);
    await focusSwitch(page, 3).click();
    await expect(focusSwitch(page, 3)).toHaveAttribute("aria-pressed", "true");

    await showTrackView(page, "staff");
    await ensureStaffBarRendered(page, 3);

    await expect(focusSwitch(page, 3)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.measure-focus-button[aria-pressed="true"]')).toHaveCount(1);
});
