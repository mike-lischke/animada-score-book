/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

/** Background the default theme (Light+) paints. */
const lightPlusBackground = "rgb(255, 255, 255)";

/** Background Quiet Light paints. A name with a space used to fall back to the default theme. */
const quietLightBackground = "rgb(245, 245, 245)";

/** Background Monokai paints. */
const monokaiBackground = "rgb(39, 40, 34)";

/**
 * Opens the app on a one-bar score in grid mode, with the default color theme.
 *
 * @param page The page to drive.
 * @param sessionId The session the score is seeded into.
 */
const openScore = async (page: Page, sessionId: string): Promise<void> => {
    const stepResolution = 16;
    const meter = {
        beats: 4,
        beatUnits: 4,
        stepResolution,
        beatGroups: new Array<number>(4).fill(stepResolution / 4),
    };
    const snapshot = {
        version: arrangementSnapshotVersion,
        title: "E2E color theme",
        timeParams: { timeSignature: "4/4", tempo: 120, length: 1, pulse: "1/4", stepResolution },
        tracks: [{
            id: 100,
            instrumentId: "1",
            measures: [{
                number: 1,
                meter,
                events: [{
                    start: { numerator: 0, denominator: 16 },
                    duration: { numerator: 1, denominator: 16 },
                    noteStyleId: "1",
                }],
                subdivisions: [],
            }],
        }],
    };

    await page.addInitScript(({ packed, id }: { packed: string; id: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: id }, "");
        window.sessionStorage.setItem("asb-session-id", id);
        window.localStorage.setItem(`asb-ui-settings-session-${id}`, JSON.stringify({
            currentScore: packed,
            viewSettings: { arrangementViewSettings: { displayMode: "grid" } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), id: sessionId });

    await page.goto("/");
    await expect(page.locator('[data-tutorial="display-options"]')).toBeVisible();
};

/**
 * @param page The page to read from.
 *
 * @returns The theme the document currently renders with.
 */
const appliedTheme = (page: Page): Promise<string> => {
    return page.evaluate(() => {
        return document.documentElement.getAttribute("data-theme") ?? "";
    });
};

/**
 * Resolves a design token to the color it paints, so the assertion does not depend on the notation the theme
 * file uses for it.
 *
 * @param page The page to read from.
 * @param token The name of the CSS custom property to resolve.
 *
 * @returns The resolved color in `rgb()` notation.
 */
const resolvedTokenColor = (page: Page, token: string): Promise<string> => {
    return page.evaluate((name: string) => {
        const probe = document.createElement("div");
        probe.style.color = `var(${name})`;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();

        return color;
    }, token);
};

/**
 * @param page The page to read from.
 *
 * @returns The row of the open settings dialog that carries the color theme picker.
 */
const themeRow = (page: Page): Locator => {
    return page.locator("#settingsDialog .form-row").filter({
        has: page.locator(".form-row-label", { hasText: "Color theme" }),
    });
};

/**
 * Picks a color theme in the open settings dialog. The dialog previews the choice right away.
 *
 * @param page The page to drive.
 * @param theme The theme to pick.
 */
const pickTheme = async (page: Page, theme: string): Promise<void> => {
    const row = themeRow(page);
    await row.locator(".dropdown-host button").click();

    // An exact match, because one theme name is the prefix of another ("Monokai" / "Monokai Dimmed").
    await row.locator(".dropdown-popup").getByText(theme, { exact: true }).click();
    await expect.poll(() => {
        return appliedTheme(page);
    }).toBe(theme);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("Color themes", () => {
    test("paints the document with the picked theme", async ({ page }) => {
        await openScore(page, "e2e-theme-switching");

        await page.locator('[data-tutorial="display-options"]').click();
        await expect(page.locator("#settingsDialog")).toBeVisible();

        // The app starts on the default theme.
        expect(await appliedTheme(page)).toBe("Light+");
        expect(await resolvedTokenColor(page, "--color-base-100")).toBe(lightPlusBackground);

        // A theme whose name holds a space or a plus used to be emitted with a broken selector, which left the
        // document on the default theme.
        await pickTheme(page, "Quiet Light");
        expect(await resolvedTokenColor(page, "--color-base-100")).toBe(quietLightBackground);

        await pickTheme(page, "Monokai");
        expect(await resolvedTokenColor(page, "--color-base-100")).toBe(monokaiBackground);

        // Switching back proves the color follows the theme instead of drifting away from the default once.
        await pickTheme(page, "Light+");
        expect(await resolvedTokenColor(page, "--color-base-100")).toBe(lightPlusBackground);
    });

    test("keeps the picked theme over a reload", async ({ page }) => {
        await openScore(page, "e2e-theme-persistence");

        await page.locator('[data-tutorial="display-options"]').click();
        await pickTheme(page, "Quiet Light");
        await page.locator("#settings-button-save").click();
        await expect(page.locator("#settingsDialog")).toBeHidden();

        // Waiting for the reload proves that the choice is stored, not just previewed.
        await page.reload();
        await expect.poll(() => {
            return appliedTheme(page);
        }).toBe("Quiet Light");

        expect(await resolvedTokenColor(page, "--color-base-100")).toBe(quietLightBackground);
    });
});
