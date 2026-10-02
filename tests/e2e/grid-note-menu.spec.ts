/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import {
    stringifyPackedArrangement, tryParsePackedArrangement,
} from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { ITrackSnapshot } from "../../src/core/types/general.js";
import { readStoredCurrentScore, routeApi } from "./e2e-test-helpers.js";

/**
 * Reads the track of the stored score.
 *
 * @param page The page under test.
 *
 * @returns The stored track snapshot.
 */
const storedTrack = async (page: Page): Promise<ITrackSnapshot> => {
    const stored = tryParsePackedArrangement(await readStoredCurrentScore(page));

    return stored!.tracks[0];
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
    const snapshot = {
        version: arrangementSnapshotVersion,
        title: "E2E Grid Note Menu",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: [{
            id: 210,
            instrumentId: "0",
            measures: [{
                number: 1,
                meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
                events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
                subdivisions: [],
            }],
        }],
    };

    await page.addInitScript((snapshotPacked: string) => {
        const sessionId = "e2e-grid-note-menu";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: snapshotPacked,
        }));
    }, stringifyPackedArrangement(snapshot));

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();

    // The note menu is an edit, so the editor only reacts in edit mode.
    await page.locator(".editSaveGooey button").nth(1).click({ force: true });
});

test("the secondary button opens the note menu and writes the picked style", async ({ page }) => {
    await page.locator(".grid-measure-row .note-viewer").nth(2).click({ button: "right" });

    const items = page.locator(".radial-menu .radial-btn");
    await expect(items.first()).toBeVisible();

    // The first item carries the instrument's first note style, so a note replaces the rest there.
    await items.first().click({ force: true });

    // The addressed cell keeps its own length, so the note takes the step the cell covers.
    await expect.poll(async () => {
        const measure = (await storedTrack(page)).measures[0];
        const note = measure.events.find((event) => {
            return event.noteStyleId !== undefined;
        });

        return note === undefined
            ? undefined
            : `${note.start.numerator}/${note.start.denominator}:${note.noteStyleId}`;
    }).toBe("1/8:1");
});
