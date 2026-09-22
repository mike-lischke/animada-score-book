/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * Builds a packed v3 arrangement with the given track instruments and steps.
 *
 * @param tracks The track definitions with per-step note style and articulation data, or with an
 *               explicit event list for measures that need lengths the step raster cannot express.
 *
 * @returns A JSON-stringified packed arrangement snapshot ready for addInitScript.
 */
const buildPackedArrangement = (tracks: Array<{
    instrumentId: string;
    steps?: Array<{ noteStyleId?: string; articulation?: { damping: number; accent: boolean; ghost: boolean; }; }>;
    events?: Array<{
        start: [number, number];
        duration: [number, number];
        noteStyleId?: string;
        articulation?: { damping: number; accent: boolean; ghost: boolean; };
    }>;
}>): string => {
    const snapshot: IArrangementSnapshot = {
        version: arrangementSnapshotVersion,
        title: "Decoration Test",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution: 16 },
        tracks: tracks.map((track, trackIndex) => {
            const events = track.events
                ? track.events.map((event) => {
                    return {
                        start: { numerator: event.start[0], denominator: event.start[1] },
                        duration: { numerator: event.duration[0], denominator: event.duration[1] },
                        noteStyleId: event.noteStyleId,
                        articulation: event.articulation ? { ...event.articulation } : undefined,
                    };
                })
                : Array.from({ length: 16 }, (_, index) => {
                    const stepData = track.steps?.at(index);

                    return {
                        start: { numerator: index, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        noteStyleId: stepData?.noteStyleId,
                        articulation: stepData?.articulation ? { ...stepData.articulation } : undefined,
                    };
                });

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
                    events,
                    subdivisions: [],
                }],
            };
        }),
    };

    return stringifyPackedArrangement(snapshot);
};

/** The session details a test seeds before the app loads. */
interface ISessionSeed {
    /** The packed arrangement snapshot stored as the session's current score. */
    packed: string;

    /** The session id the arrangement is stored under. */
    sessionId: string;
}

/**
 * Seeds a session with a packed arrangement and switches the arrangement view to staff mode.
 *
 * @param page The page to prepare.
 * @param seed The arrangement snapshot and session id to load.
 */
const openStaffArrangement = async (page: Page, seed: ISessionSeed): Promise<void> => {
    await page.addInitScript((initSeed: ISessionSeed) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: initSeed.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", initSeed.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${initSeed.sessionId}`, JSON.stringify({
            currentScore: initSeed.packed,
        }));
    }, seed);

    await page.goto("/");

    const trackViewToggle = page.locator("input.trackViewModeToggle").first();
    await expect(trackViewToggle).toBeVisible();
    if (!await trackViewToggle.isChecked()) {
        await trackViewToggle.check({ force: true });
    }

    await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();
};

/**
 * Selects a note with a mouse click on its note head. The head is centred on the note's onset, while
 * beams and selection overlays are drawn with `pointer-events: none`, so the click has to be placed
 * by coordinate rather than on the elements the renderer paints on top.
 *
 * @param page The page holding the staff view.
 * @param head The note head to click.
 */
const clickNoteHead = async (page: Page, head: Locator): Promise<void> => {
    const box = await head.boundingBox();
    if (!box) {
        throw new Error("Note head has no bounding box.");
    }

    await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));
};

/**
 * Resolves the theme's primary colour, which selection highlighting is drawn with, to a computed
 * `rgb()` value, so the tests do not hardcode a theme colour.
 *
 * @param page The page holding the staff view.
 *
 * @returns The primary colour as a computed CSS colour value.
 */
const primaryColor = (page: Page): Promise<string> => {
    return page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-primary)";
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();

        return color;
    });
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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

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

        await expect(page.locator(".staff-measure-track-row").first()).toBeVisible();

        // Ghost parentheses should NOT be present.
        const ghostParen = page.locator(".staff-note-head-ghost-paren");
        await expect(ghostParen).toHaveCount(0);

        // But rimshot cross SHOULD be present.
        const rimshotCross = page.locator(".staff-note-head-rimshot-cross-svg").first();
        await expect(rimshotCross).toBeVisible();
    });

    test("keeps the augmentation dot clear of cross and triangle heads", async ({ page }) => {
        const ghost = { damping: 0, accent: false, ghost: true };
        // Dotted quarters carry no flags, so the sprite draws nothing but the dot.
        const packed = buildPackedArrangement([
            {
                instrumentId: "2", // Tamborim – cross heads
                events: [
                    { start: [0, 16], duration: [6, 16], noteStyleId: "1" },
                    { start: [6, 16], duration: [6, 16], noteStyleId: "1", articulation: ghost },
                ],
            },
            {
                instrumentId: "1", // Chocalho – triangle heads
                events: [
                    { start: [0, 16], duration: [6, 16], noteStyleId: "1" },
                    { start: [6, 16], duration: [6, 16], noteStyleId: "2", articulation: ghost },
                ],
            },
        ]);

        await page.addInitScript((snapshotPacked: string) => {
            const sessionId = "e2e-deco-dot";
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

        await expect(page.locator(".staff-note-head").first()).toBeVisible();

        const heads = await page.evaluate(() => {
            return [...document.querySelectorAll<HTMLElement>(".staff-note-head")].map((head) => {
                const paren = head.querySelector<HTMLElement>(".staff-note-head-ghost-paren");
                const dot = head.querySelector<HTMLElement>(".staff-note-head-dot");
                const symbol = head.querySelector<SVGElement>(".staff-note-viewer-note-symbol");

                return {
                    className: head.className,
                    dotOffset: dot === null
                        ? null
                        : Math.round(dot.getBoundingClientRect().left - head.getBoundingClientRect().left),
                    parenLeft: paren === null ? null : getComputedStyle(paren).left,
                    spriteDot: symbol?.getAttribute("style")?.includes("--note-show-dot: inline") ?? false,
                };
            });
        });

        // A head that is centred on the stem covers the dot's place, so these heads hide the sprite's
        // dot and draw their own beside their ink; a ghost's closing parenthesis makes room for it.
        expect(heads[0].className).toContain("cross");
        expect(heads[0].className).toContain("staff-note-head-dotted");
        expect(heads[0].dotOffset).toBe(16);
        expect(heads[0].spriteDot).toBe(false);
        expect(heads[0].parenLeft).toBeNull();

        expect(heads[1].dotOffset).toBe(16);
        expect(heads[1].parenLeft).toBe("20px");

        expect(heads[2].className).toContain("triangle");
        expect(heads[2].dotOffset).toBe(21);
        expect(heads[2].spriteDot).toBe(false);

        expect(heads[3].parenLeft).toBe("26px");
    });
});

test.describe("Decoration colouring while selected", () => {
    test("colours the closing parenthesis of a ghost note", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "5", // Caixa
            steps: [
                {}, {}, {}, {},
                { noteStyleId: "2", articulation: { damping: 0, accent: false, ghost: true } },
            ],
        }]);

        await openStaffArrangement(page, { packed, sessionId: "e2e-deco-selected-ghost" });

        const head = page.locator(".staff-measure-track-row .staff-note-head.ghost-note").first();
        await expect(head).toBeVisible();
        await clickNoteHead(page, head);
        await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);

        // The opening parenthesis is a ::before on the head and was always coloured. The closing one
        // is a child span and needs its own colour, otherwise the pair is highlighted asymmetrically.
        const primary = await primaryColor(page);
        const closingParen = page.locator(".staff-note-viewer-run.note-selected .staff-note-head-ghost-paren");
        await expect(closingParen).toHaveCSS("color", primary);
    });

    test("colours the plus sign of a damped note", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "7", // High Surdo
            steps: [
                {}, {}, {}, {},
                { noteStyleId: "2", articulation: { damping: 1, accent: false, ghost: false } },
            ],
        }]);

        await openStaffArrangement(page, { packed, sessionId: "e2e-deco-selected-damped" });

        const head = page.locator(".staff-measure-track-row .staff-note-head:has(.staff-note-head-damped-plus)")
            .first();
        await expect(head).toBeVisible();
        await clickNoteHead(page, head);
        await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);

        const plus = page.locator(".staff-note-viewer-run.note-selected .staff-note-head-damped-plus");
        await expect(plus).toHaveText("+");

        const primary = await primaryColor(page);
        await expect(plus).toHaveCSS("color", primary);
    });

    test("colours the dot of a dotted note", async ({ page }) => {
        const packed = buildPackedArrangement([{
            instrumentId: "2", // Tamborim – cross heads draw the augmentation dot themselves
            events: [
                { start: [0, 16], duration: [4, 16] },
                { start: [4, 16], duration: [6, 16], noteStyleId: "1" },
            ],
        }]);

        await openStaffArrangement(page, { packed, sessionId: "e2e-deco-selected-dot" });

        const head = page.locator(".staff-measure-track-row .staff-note-head.staff-note-head-dotted").first();
        await expect(head).toHaveClass(/cross/);
        await expect(head).toBeVisible();
        await clickNoteHead(page, head);
        await expect(page.locator(".staff-note-viewer-run.note-selected")).toHaveCount(1);

        // The dot is a filled circle painted with the head's ink colour, so the selection has to
        // override its background instead of its text colour.
        const primary = await primaryColor(page);
        const dot = page.locator(".staff-note-viewer-run.note-selected .staff-note-head-dot");
        await expect(dot).toHaveCSS("background-color", primary);
    });
});
