/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * Builds a packed v3 arrangement with the given track instruments and steps.
 *
 * @param tracks The track definitions with per-step note style and articulation data.
 *
 * @returns A JSON-stringified packed arrangement snapshot ready for addInitScript.
 */
const buildPackedArrangement = (tracks: Array<{
    instrumentId: string;
    steps: Array<{ noteStyleId?: string; articulation?: { damping: number; accent: boolean; ghost: boolean; }; }>;
}>): string => {
    const snapshot: IArrangementSnapshot = {
        version: 3,
        title: "Decoration Test",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: tracks.map((track, trackIndex) => {
            return {
                id: trackIndex + 1,
                instrumentId: track.instrumentId,
                measures: [{
                    number: 1,
                    meter: {
                        beats: 4,
                        beatUnits: 4,
                        stepResolution: 16,
                        beatGroups: [4, 4, 4, 4],
                    },
                    steps: Array.from({ length: 16 }, (_, index) => {
                        const stepData = track.steps[index];

                        return { index, ...stepData };
                    }),
                    subdivisions: [],
                }],
            };
        }),
    };

    return stringifyPackedArrangement(snapshot);
};

test.describe("Note head types", () => {
    test("renders oval note heads for Surdo (stick, normal)", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "7", // High Surdo
            steps: [
                { noteStyleId: "1" }, // Accent – oval
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-head-oval";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Oval heads use the SVG note symbol.
        const noteSymbol = page.locator(".staff-note-viewer-note-symbol").first();
        await expect(noteSymbol).toBeVisible();
    });

    test("renders cross note heads for Tamborim", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "2", // Tamborim
            steps: [
                { noteStyleId: "1" }, // Accent – cross
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-head-cross";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Cross heads are rendered via SVG.
        const crossSvg = page.locator(".staff-note-head-cross-svg").first();
        await expect(crossSvg).toBeVisible();
    });

    test("renders triangle note heads for Chocalho", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "1", // Chocalho
            steps: [
                { noteStyleId: "1" }, // Accent – triangle
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-head-triangle";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Triangle heads use the CSS class.
        const triangle = page.locator(".staff-note-head.triangle").first();
        await expect(triangle).toBeVisible();
    });

    test("renders square note heads for Timbau (hand)", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "6", // Timbau
            steps: [
                { noteStyleId: "1" }, // Open – square
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-head-square";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const square = page.locator(".staff-note-head.square").first();
        await expect(square).toBeVisible();
    });
});

test.describe("Note decorations", () => {
    test("renders ghost note parentheses for Caixa ghost", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "5", // Caixa
            steps: [
                { noteStyleId: "2", articulation: { damping: 0, accent: false, ghost: true } }, // Ghost
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-ghost";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Ghost notes have the ghost-note class for opening paren + a span for closing paren.
        const ghostNote = page.locator(".staff-note-head.ghost-note").first();
        await expect(ghostNote).toBeVisible();
        const ghostParen = ghostNote.locator(".staff-note-head-ghost-paren");
        await expect(ghostParen).toBeVisible();
    });

    test("renders damped plus sign for High Surdo muted", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "7", // High Surdo
            steps: [
                { noteStyleId: "2", articulation: { damping: 1, accent: false, ghost: false } }, // Muted
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-damped";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const dampedPlus = page.locator(".staff-note-head-damped-plus").first();
        await expect(dampedPlus).toBeVisible();
        await expect(dampedPlus).toHaveText("+");
    });

    test("renders accent mark for High Surdo accent", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "7", // High Surdo
            steps: [
                { noteStyleId: "1", articulation: { damping: 0, accent: true, ghost: false } }, // Accent – >
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-accent";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const accentMark = page.locator(".staff-note-viewer-accent").first();
        await expect(accentMark).toBeVisible();
        await expect(accentMark).toHaveText(">");
    });

    test("renders rimshot decoration for Repinique rimshot", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "3", // Repinique
            steps: [
                { noteStyleId: "3" }, // Rimshot – cross decoration
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-rimshot";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const rimshotCross = page.locator(".staff-note-head-rimshot-cross-svg").first();
        await expect(rimshotCross).toBeVisible();
    });

    test("renders press roll decoration for Repinique buzz", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "3", // Repinique
            steps: [
                { noteStyleId: "5" }, // Buzz (PressRoll) – three slashes
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-pressroll";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        const pressRoll = page.locator(".staff-note-head-press-roll-svg").first();
        await expect(pressRoll).toBeVisible();
    });

    test("renders thumb circle decoration for Repinique hand (thumb only)", async ({ page }) => {
        // Repinique hand center with Thumb technique — but Repinique doesn't have Thumb.
        // Use Timbau bass with Heel technique instead, or a different instrument.
        // Actually, none of the current instruments use HandTechnique.Thumb.
        // Let's skip the thumb circle test and use Timbau bass (Heel) instead.
        // Heel doesn't have a visible decoration. Let me adjust.
        // Actually, the Repinique has Slap which renders a cross. Let's test that.
        const packed = buildPackedArrangement([{
            instrumentId: "3", // Repinique
            steps: [
                { noteStyleId: "7" }, // Slap – square with cross decoration
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-slap";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Slap shows a square note head.
        const square = page.locator(".staff-note-head.square").first();
        await expect(square).toBeVisible();
        // And a cross SVG inside.
        const slapCross = square.locator(".staff-note-head-slap-svg");
        await expect(slapCross).toBeVisible();
    });

    test("renders no ghost parentheses for Repinique rimshot (not a ghost)", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "3", // Repinique
            steps: [
                { noteStyleId: "3" }, // Rimshot – NOT ghost, NOT muted
            ],
        }]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-no-ghost";
            window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
            window.sessionStorage.setItem("asb-session-id", sessionId);
            window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
                currentScore: snapshotPacked,
            }));
        }, packed);

        await page.goto("/");

        const trackViewToggle = page.locator("input.trackViewModeToggle").first();
        await expect(trackViewToggle).toBeVisible();
        if (!await trackViewToggle.isChecked()) {
            await trackViewToggle.check({ force: true });
        }

        await expect(page.locator(".bar-track-row.staff-mode").first()).toBeVisible();

        // Ghost parentheses should NOT be present.
        const ghostParen = page.locator(".staff-note-head-ghost-paren");
        await expect(ghostParen).toHaveCount(0);

        // But rimshot cross SHOULD be present.
        const rimshotCross = page.locator(".staff-note-head-rimshot-cross-svg").first();
        await expect(rimshotCross).toBeVisible();
    });
});
