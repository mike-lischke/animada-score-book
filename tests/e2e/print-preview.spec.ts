/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { barActionStripWidth } from "../../src/core/MeasureLayout.js";
import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

/**
 * @param page The page to open the preview in.
 *
 * @returns The preview dialog.
 */
const openPreview = async (page: Page): Promise<Locator> => {
    const printButton = page.locator("#printButton");
    await expect(printButton).toBeVisible();
    await printButton.click();

    const preview = page.locator(".print-preview");
    await expect(preview).toBeVisible();

    return preview;
};

/**
 * Stubs `window.print`, so a test observes the print instead of the browser's dialog.
 *
 * @param page The page to stub the print in.
 * @param tearDown Whether the print tears the print DOM down again, as the browser does by default.
 */
const stubPrint = async (page: Page, tearDown = false): Promise<void> => {
    await page.evaluate((tearDownNow: boolean) => {
        const target = window as unknown as { __printCalled: boolean; };
        target.__printCalled = false;
        window.print = () => {
            target.__printCalled = true;
            if (tearDownNow) {
                window.dispatchEvent(new Event("afterprint"));
            }
        };
    }, tearDown);
};

/**
 * @param page The page to read.
 *
 * @returns Whether the stubbed print ran.
 */
const printWasCalled = (page: Page): Promise<boolean> => {
    return page.evaluate(() => {
        return (window as unknown as { __printCalled: boolean; }).__printCalled;
    });
};

/**
 * @param preview The preview dialog.
 *
 * @returns The track chooser with the button that states its caption.
 */
const trackChooser = (preview: Locator): { chooser: Locator; caption: Locator; items: Locator; } => {
    const chooser = preview.locator(".print-preview-tracks");
    const caption = chooser.locator("button").first();
    const items = chooser.locator(".dropdown-popup li:not(.dropdown-menu-header)");

    return { chooser, caption, items };
};

/**
 * Toggles the track at the given position of the track chooser, opening its menu if it has to.
 *
 * @param preview The preview dialog.
 * @param index Position of the track in the chooser.
 */
const toggleTrack = async (preview: Locator, index: number): Promise<void> => {
    const { chooser, caption, items } = trackChooser(preview);
    if (!await chooser.locator(".dropdown-popup").isVisible()) {
        await caption.click();
    }

    await items.nth(index).locator("a").click();
};

test("print button opens the preview of the arrangement", async ({ page }) => {
    await page.goto("/");

    const preview = await openPreview(page);

    await expect(preview.locator(".print-preview-sheet-frame").first()).toBeVisible();
    await expect(preview.locator(".print-preview-pager-label")).toContainText(/^Page 1 \/ \d+$/);
    await expect(preview.locator(".print-system").first()).toBeVisible();
});

test("preview shows the parts of the layout it lets the user change", async ({ page }) => {
    await page.goto("/");

    const preview = await openPreview(page);

    await expect(preview).toContainText("Layout");
    await expect(preview).toContainText("Borders");
    await expect(preview).toContainText("Print Details");
    await expect(preview).toContainText("Scale");
    await expect(preview).toContainText("Tracks");

    // Settings the preview does not offer must not be there either.
    await expect(preview).not.toContainText("Paper Size");
    await expect(preview).not.toContainText("Orientation");
    await expect(preview).not.toContainText("Theme");
});

test("preview prints every track and drops one that is toggled off", async ({ page }) => {
    await page.goto("/");

    const preview = await openPreview(page);
    const { caption, items } = trackChooser(preview);
    const captionText = await caption.textContent() ?? "";
    const match = /Tracks (\d+)\/(\d+)/.exec(captionText);
    expect(match).not.toBeNull();

    const total = Number(match![2]);
    expect(Number(match![1])).toBe(total);
    await expect(items).toHaveCount(total);

    await toggleTrack(preview, 0);
    await expect(caption).toContainText(`Tracks ${total - 1}/${total}`);
});

test("preview keeps the last selected track, so a page always has notes", async ({ page }) => {
    await page.goto("/");

    const preview = await openPreview(page);
    const { caption, items } = trackChooser(preview);
    const total = Number(/Tracks \d+\/(\d+)/.exec(await caption.textContent() ?? "")![1]);

    for (let index = 0; index < total - 1; index++) {
        await toggleTrack(preview, index);
    }

    await expect(caption).toContainText(`Tracks 1/${total}`);
    await toggleTrack(preview, total - 1);
    await expect(caption).toContainText(`Tracks 1/${total}`);
    await expect(items).toHaveCount(total);
});

test("closing the preview does not print", async ({ page }) => {
    await page.goto("/");
    await stubPrint(page);

    const preview = await openPreview(page);
    await preview.locator('.print-preview-tool-button[title="Close the preview (ESC)"]').click();

    await expect(page.locator(".print-preview")).toHaveCount(0);
    expect(await printWasCalled(page)).toBe(false);
});

test("print button prints and renders the print view", async ({ page }) => {
    await page.goto("/");
    await stubPrint(page, true);

    const preview = await openPreview(page);
    await preview.locator(".print-preview-emphasis").click();

    await expect.poll(() => {
        return printWasCalled(page);
    }).toBe(true);
});

test("preview keeps the print view attached while the browser prints", async ({ page }) => {
    await page.goto("/");
    await stubPrint(page);

    const preview = await openPreview(page);
    await preview.locator(".print-preview-emphasis").click();

    const printRoot = page.locator(".print-root");
    await expect(printRoot).toBeAttached();
    await expect(printRoot.locator(".print-title")).toHaveCount(1);
    expect(await printRoot.locator(".print-instrument-name").count()).toBeGreaterThan(0);

    await page.evaluate(() => {
        window.dispatchEvent(new Event("afterprint"));
    });
});

test("preview lays the measures out at their stored widths", async ({ page }) => {
    // The floor of a measure of four quarter notes is the width of the bar action strip.
    const narrowWidth = barActionStripWidth;
    const barCount = 4;
    const measures = Array.from({ length: barCount }, (_, index) => {
        return {
            number: index + 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: Array.from({ length: 4 }, (_, beat) => {
                return {
                    start: { numerator: beat, denominator: 4 },
                    duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1",
                };
            }),
            subdivisions: [],
        };
    });

    const packed = stringifyPackedArrangement({
        version: arrangementSnapshotVersion,
        title: "E2E Print Widths",
        timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution: 16 },
        tracks: [{ id: 230, instrumentId: "0", measures }],
        extensions: { measureWidths: { 2: narrowWidth, 3: narrowWidth } },
    });

    await page.addInitScript((content: string) => {
        const sessionId = "e2e-print-widths";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: content,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, packed);

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();

    const preview = await openPreview(page);
    const columns = preview.locator(".staff-measure-viewer");
    await expect(columns).toHaveCount(barCount);

    // The two measures are stored narrower than the ones around them, and both are drawn with that width.
    const widths = await columns.evaluateAll((elements) => {
        return elements.map((element) => {
            return element.getBoundingClientRect().width;
        });
    });

    expect(widths[1]).toBeCloseTo(widths[2], 0);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[3]).toBeGreaterThan(widths[1]);
});

/**
 * Opens the view on a score whose measures are stored narrow enough that one printed system holds two of them.
 *
 * @param page The page to seed.
 * @param displayMode The view mode to open the score in.
 * @param sessionId The session the seeded settings are stored under, which has to differ between tests.
 */
const seedNarrowScore = async (page: Page, displayMode: string, sessionId: string): Promise<void> => {
    const barCount = 4;
    const narrowWidth = 500;
    const measures = Array.from({ length: barCount }, (_, index) => {
        return {
            number: index + 1,
            meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
            events: Array.from({ length: 4 }, (_, beat) => {
                return {
                    start: { numerator: beat, denominator: 4 },
                    duration: { numerator: 1, denominator: 4 },
                    noteStyleId: "1",
                };
            }),
            subdivisions: [],
        };
    });

    const measureWidths: Record<number, number> = {};
    for (let bar = 1; bar <= barCount; bar++) {
        measureWidths[bar] = narrowWidth;
    }

    const packed = stringifyPackedArrangement({
        version: arrangementSnapshotVersion,
        title: "E2E Print Resize",
        timeParams: { timeSignature: "4/4", tempo: 120, length: barCount, pulse: "1/4", stepResolution: 16 },
        tracks: [{ id: 231, instrumentId: "0", measures }],
        extensions: { measureWidths },
    });

    await page.addInitScript((data: { content: string; displayMode: string; sessionId: string; }) => {
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId: data.sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", data.sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${data.sessionId}`, JSON.stringify({
            currentScore: data.content,
            viewSettings: { arrangementViewSettings: { displayMode: data.displayMode } },
        }));
    }, { content: packed, displayMode, sessionId });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
};

test("dragging a boundary in the preview moves the lines of the measures after it", async ({ page }) => {
    await seedNarrowScore(page, "staff", "e2e-print-resize");

    const preview = await openPreview(page);
    const system = preview.locator(".print-system").first();

    /**
     * @returns The left edges of the lines that close the measures of the first system, in layout px.
     */
    const boundaries = (): Promise<number[]> => {
        return system.evaluate((element) => {
            return [...element.querySelectorAll<HTMLElement>(":scope > .print-system-barline")].map((line) => {
                return Number.parseFloat(line.style.left);
            });
        });
    };

    /**
     * @returns The widths of the printed measure columns, in layout px.
     */
    const measureWidths = (): Promise<number[]> => {
        return preview.evaluate((element) => {
            return [...element.querySelectorAll<HTMLElement>(".print-sheet .staff-measure-viewer")]
                .map((column) => {
                    return Number.parseFloat(column.style.flex.split(" ")[2]);
                });
        });
    };

    // Two measures share the first system, so the drag has a neighbour whose lines have to follow.
    const before = await boundaries();
    expect(before).toHaveLength(2);
    const widthsBefore = await measureWidths();

    // The gesture follows the pointer on the window, so the lines are read while it still runs.
    const handle = system.locator(".print-system-resize-handle").first();
    await handle.dispatchEvent("pointerdown", { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    await page.evaluate(() => {
        window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 460 }));
    });

    const flag = system.locator(".print-system-resize-flag");
    await expect(flag).toHaveCount(1);
    await expect(flag).toHaveText(/^\d+ px$/);

    const gained = (await measureWidths())[0] - widthsBefore[0];
    expect(gained).toBeGreaterThan(0);

    // Both lines of the system move with the column being dragged, so the measures stay closed up.
    const during = await boundaries();
    expect(during[0] - before[0]).toBeCloseTo(gained, 0);
    expect(during[1] - before[1]).toBeCloseTo(gained, 0);

    await page.evaluate(() => {
        window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 460 }));
    });

    // The host reflows the systems when the gesture ends, so the widened measure keeps its width.
    await expect.poll(async () => {
        return (await measureWidths())[0];
    }).toBeCloseTo(widthsBefore[0] + gained, 0);
});

test("offers no width dragging where the preview prints grid rows", async ({ page }) => {
    await seedNarrowScore(page, "grid", "e2e-print-resize-grid");

    const preview = await openPreview(page);
    await expect(preview.locator(".print-system").first()).toBeVisible();
    await expect(preview.locator(".print-system-resize-handle")).toHaveCount(0);
});
