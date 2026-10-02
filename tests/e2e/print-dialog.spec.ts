/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test, type Page } from "@playwright/test";

import { MeasureLayout, barActionStripWidth } from "../../src/core/MeasureLayout.js";
import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { routeApi } from "./e2e-test-helpers.js";

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

const openPrintDialog = async (page: Page) => {
    const printButton = page.locator("#printButton");
    await expect(printButton).toBeVisible();
    await printButton.click();

    const dialog = page.locator("#printDialog");
    await expect(dialog).toBeVisible();

    return dialog;
};

test("print button opens the print dialog", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    // Title contains "Print / Export to PDF".
    await expect(dialog).toContainText("Print / Export to PDF");
});

test("print dialog shows expected option rows", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    // The form card contains labels for the supported options.
    const card = dialog.locator(".form-card");

    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card).toContainText("Bars per line");
    await expect(card).toContainText("Include legend");
    await expect(card).toContainText("Tracks");

    // Removed options must not be present.
    await expect(card).not.toContainText("Orientation");
    await expect(card).not.toContainText("Paper Size");
    await expect(card).not.toContainText("Theme");
});

test("print dialog defaults: bars per line = Auto, include legend = checked", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    // Bars per line dropdown caption.
    await expect(dialog.getByText("Auto", { exact: true }).first()).toBeVisible();

    // Include legend defaults to checked.
    const legendCheckbox = dialog.locator("#print-show-legend");
    await expect(legendCheckbox).toBeChecked();
});

test("print dialog lists all arrangement tracks, all selected by default", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    const trackCheckboxes = dialog.locator("input[id^='print-track-']");
    const count = await trackCheckboxes.count();
    expect(count).toBeGreaterThan(0);

    // All tracks should be checked initially.
    for (let i = 0; i < count; i++) {
        await expect(trackCheckboxes.nth(i)).toBeChecked();
    }

    // Each track row should display a non-empty label next to the checkbox.
    const trackLabels = dialog.locator("input[id^='print-track-'] + span");
    const labelCount = await trackLabels.count();
    expect(labelCount).toBe(count);

    for (let i = 0; i < labelCount; i++) {
        const text = (await trackLabels.nth(i).textContent())?.trim() ?? "";
        expect(text.length).toBeGreaterThan(0);
    }
});

test("toggling a track updates its checkbox state", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    const firstTrack = dialog.locator("input[id^='print-track-']").first();
    await expect(firstTrack).toBeChecked();

    await firstTrack.click({ force: true });
    await expect(firstTrack).not.toBeChecked();

    await firstTrack.click({ force: true });
    await expect(firstTrack).toBeChecked();
});

test("toggling include legend updates the checkbox state", async ({ page }) => {
    await page.goto("/");

    const dialog = await openPrintDialog(page);

    const legendCheckbox = dialog.locator("#print-show-legend");
    await expect(legendCheckbox).toBeChecked();

    await legendCheckbox.click({ force: true });
    await expect(legendCheckbox).not.toBeChecked();

    await legendCheckbox.click({ force: true });
    await expect(legendCheckbox).toBeChecked();
});

test("cancel closes the dialog without triggering print", async ({ page }) => {
    await page.goto("/");

    // Stub window.print so a real print dialog is never invoked.
    await page.evaluate(() => {
        (window as unknown as { __printCalled: boolean; }).__printCalled = false;
        window.print = () => {
            (window as unknown as { __printCalled: boolean; }).__printCalled = true;
        };
    });

    const dialog = await openPrintDialog(page);

    await dialog.locator("#print-button-cancel").click();
    await expect(dialog).not.toBeVisible();

    const printCalled = await page.evaluate(() => {
        return (window as unknown as { __printCalled: boolean; }).__printCalled;
    });
    expect(printCalled).toBe(false);
});

test("accepting the dialog triggers window.print and adds the printing class", async ({ page }) => {
    await page.goto("/");

    // Stub window.print so we can observe it without opening a real print dialog.
    await page.evaluate(() => {
        (window as unknown as { __printCalled: boolean; }).__printCalled = false;
        window.print = () => {
            (window as unknown as { __printCalled: boolean; }).__printCalled = true;
            // Simulate the browser's afterprint event so cleanup runs.
            window.dispatchEvent(new Event("afterprint"));
        };
    });

    const dialog = await openPrintDialog(page);

    await dialog.locator("#print-button-print").click();

    // window.print was called.
    await expect.poll(async () => {
        return await page.evaluate(() => {
            return (window as unknown as { __printCalled: boolean; }).__printCalled;
        });
    }).toBe(true);

    // The dynamic @page style was injected (briefly) and the document title was updated.
    await expect.poll(async () => {
        return await page.evaluate(() => {
            return document.title;
        });
    }).toContain("Animada Score Book");
});

test("PrintView is rendered with a legend section after accepting the dialog", async ({ page }) => {
    await page.goto("/");

    // Stub window.print so we can observe the in-flight print DOM without a real print dialog,
    // and prevent the browser from immediately tearing it down.
    await page.evaluate(() => {
        window.print = () => {
            // No-op; the test will dispatch afterprint manually after inspecting the DOM.
        };
    });

    const dialog = await openPrintDialog(page);
    await dialog.locator("#print-button-print").click();

    // PrintView is only mounted while state.printing is true.
    const printRoot = page.locator(".print-root");
    await expect(printRoot).toBeAttached();

    // The legend section is rendered (default: showLegend = true).
    const legend = page.locator(".print-legend");
    await expect(legend).toBeAttached();
    await expect(page.locator(".print-legend-title")).toHaveText("Legend");
    const legendItems = page.locator(".print-legend-item");
    expect(await legendItems.count()).toBeGreaterThan(0);

    // Cleanup: dispatch afterprint so the app exits the printing state.
    await page.evaluate(() => {
        window.dispatchEvent(new Event("afterprint"));
    });
});

test("disabling include legend hides the legend section in the print view", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(() => {
        window.print = () => {
            // No-op.
        };
    });

    const dialog = await openPrintDialog(page);

    // Uncheck "Include legend".
    const legendCheckbox = dialog.locator("#print-show-legend");
    await legendCheckbox.click({ force: true });
    await expect(legendCheckbox).not.toBeChecked();

    await dialog.locator("#print-button-print").click();

    await expect(page.locator(".print-root")).toBeAttached();
    await expect(page.locator(".print-legend")).toHaveCount(0);

    // Cleanup.
    await page.evaluate(() => {
        window.dispatchEvent(new Event("afterprint"));
    });
});

test("print view lays measures out at their stored widths", async ({ page }) => {
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

    await page.evaluate(() => {
        window.print = () => {
            // No-op; the test inspects the print DOM and dispatches afterprint itself.
        };
    });

    const dialog = await openPrintDialog(page);
    await dialog.locator("#print-button-print").click();

    // The print stylesheet lays a measure out half as wide as on screen, so a stored width is halved with the
    // default and the measures keep their relative widths on paper.
    const printedMeasures = page.locator(".print-root .staff-measure-viewer");
    await expect(printedMeasures).toHaveCount(barCount);
    await expect(printedMeasures.nth(0)).toHaveCSS("flex-basis", `${MeasureLayout.defaultWidth() / 2}px`);
    await expect(printedMeasures.nth(1)).toHaveCSS("flex-basis", `${narrowWidth / 2}px`);

    // The narrow measures share the first row with the bar before them, instead of a fixed two-per-row grid.
    const blocks = page.locator(".print-root .print-bar-block");
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0).locator(".staff-measure-viewer")).toHaveCount(3);
    await expect(blocks.nth(1).locator(".staff-measure-viewer")).toHaveCount(1);

    // Cleanup.
    await page.evaluate(() => {
        window.dispatchEvent(new Event("afterprint"));
    });
});
