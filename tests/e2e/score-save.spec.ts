/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Four quarter notes, which give an edit something to remove. */
const snapshot = {
    version: arrangementSnapshotVersion,

    // A DB-backed id, which puts the model on its "update an existing score" path.
    scoreId: 10996,
    title: "E2E Score Save",
    timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
    tracks: [{
        id: 300,
        instrumentId: "0",
        measures: [{
            number: 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: Array.from({ length: 4 }, (_, index) => {
                return {
                    start: { numerator: index, denominator: 4 },
                    duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1",
                };
            }),
            subdivisions: [],
        }],
    }],
};

/** What the backend answers with for one action. */
interface IApiAnswer {
    status: number;
    body: unknown;
}

/**
 * @param answer The answer of an action: one for every call, or a sequence whose last entry repeats.
 * @param call The zero-based number of the call.
 *
 * @returns The answer that call receives.
 */
const answerAt = (answer: IApiAnswer | IApiAnswer[], call: number): IApiAnswer => {
    return Array.isArray(answer) ? answer[Math.min(call, answer.length - 1)] : answer;
};

/**
 * Opens the seeded score with the given answers in place. The catch-all of {@link routeApi} covers every other
 * action, so a test only states the one it exercises.
 *
 * @param page The page under test.
 * @param answers The action the backend answers how, keyed by the action name. A sequence answers call by call,
 *                which a test uses for a session that ends while the app runs.
 */
const openScore = async (page: Page, answers: Record<string, IApiAnswer | IApiAnswer[]>): Promise<void> => {
    await routeApi(page);

    const calls = new Map<string, number>();

    for (const action of Object.keys(answers)) {
        await page.route(`**/api?action=${action}`, async (route) => {
            const call = calls.get(action) ?? 0;
            calls.set(action, call + 1);

            const answer = answerAt(answers[action], call);
            await route.fulfill({
                status: answer.status,
                contentType: "application/json",
                body: JSON.stringify(answer.body),
            });
        });
    }

    await page.addInitScript((data: { packed: string; entryMode: number; sessionId: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.packed,
            entryMode: data.entryMode,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, {
        packed: stringifyPackedArrangement(snapshot),
        entryMode: EditEntryMode.Overwrite,
        sessionId: "e2e-score-save",
    });

    await page.goto("/");
    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * Enters edit mode and duplicates the bar, which is the edit a save is asked to store.
 *
 * @param page The page under test.
 */
const editSomething = async (page: Page): Promise<void> => {
    await expect(page.locator("#arrangementActionBar")).toBeVisible();
    await page.locator("#editModeButton").click({ force: true });

    await expect(page.locator(".bar-action-group")).toHaveCount(1);
    await expect(page.locator(".bar-action-button")).toHaveCount(5);
    await page.locator('.bar-action-button[data-action="duplicate"]').click();

    await expect(page.locator(".staff-measure-viewer")).toHaveCount(2);
};

test("reports the reason when the backend refuses the save", async ({ page }) => {
    await openScore(page, {
        lockScore: { status: 200, body: { success: true, token: "lock-token" } },
        updateScore: { status: 403, body: { error: "Forbidden" } },
    });
    await editSomething(page);

    await page.keyboard.press("ControlOrMeta+s");

    // The save states what the backend answered instead of claiming it returned no content.
    await expect(page.locator(".toast.error")).toContainText("You do not have permission to save this score.");
});

test("keeps edit mode off when the backend refuses the lock", async ({ page }) => {
    await openScore(page, {
        lockScore: { status: 403, body: { error: "Forbidden" } },
    });

    await page.locator("#editModeButton").click({ force: true });

    // Editing without the lock would only fail at the save, so the mode stays off and says why.
    await expect(page.locator(".toast.error")).toContainText("You do not have permission to edit this score.");
    await expect(page.locator("#trackViewerContainer")).not.toHaveClass(/edit-mode/);
});

test("asks for a login when the session cannot be renewed", async ({ page }) => {
    await openScore(page, {
        // The session is valid when the app starts and ends while it runs.
        refresh: [
            { status: 200, body: { token: "test-token" } },
            { status: 401, body: { error: "No refresh token" } },
        ],
        lockScore: { status: 401, body: { error: "Authentication required." } },
    });

    await page.locator("#editModeButton").click({ force: true });

    await expect(page.locator("#loginDialog")).toBeVisible();
});
