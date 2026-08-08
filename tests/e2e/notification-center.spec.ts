/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { beijaFlorImportPath, expectImportedPolyrhythmSong, routeApi } from "./helpers.js";

/**
 * Calls requisitions.execute("showInfo", text) inside the browser page.
 *
 * @param page The Playwright page.
 * @param text The notification text.
 * @returns A promise that resolves when the evaluate completes.
 */
const showInfo = (page: import("@playwright/test").Page, text: string): Promise<void> => {
    return page.evaluate((t) => {
        void window.__e2e!.requisitions.execute("showInfo", t);
    }, text);
};

/**
 * Calls requisitions.execute("showWarning", text) inside the browser page.
 *
 * @param page The Playwright page.
 * @param text The notification text.
 * @returns A promise that resolves when the evaluate completes.
 */
const showWarning = (page: import("@playwright/test").Page, text: string): Promise<void> => {
    return page.evaluate((t) => {
        void window.__e2e!.requisitions.execute("showWarning", t);
    }, text);
};

/**
 * Calls requisitions.execute("showError", text) inside the browser page.
 *
 * @param page The Playwright page.
 * @param text The notification text.
 * @returns A promise that resolves when the evaluate completes.
 */
const showError = (page: import("@playwright/test").Page, text: string): Promise<void> => {
    return page.evaluate((t) => {
        void window.__e2e!.requisitions.execute("showError", t);
    }, text);
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test.describe("NotificationCenter", () => {
    test("renders the notification center in the DOM", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        await expect(page.locator(".notificationCenter")).toBeAttached();
    });

    test("shows a notification when showInfo is called", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        await showInfo(page, "E2E test notification");

        const toast = page.locator(".toast.info");
        await expect(toast).toBeVisible();
        await expect(toast).toContainText("E2E test notification");
        await expect(toast.locator("svg.icon[data-icon='Info']")).toBeVisible();
    });

    test("closes a toast when the close button is clicked", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        await showInfo(page, "Close me via click");

        const toast = page.locator(".toast.info");
        await expect(toast).toBeVisible();

        await toast.locator(".closeButton").click();

        // Wait for the closing animation to finish.
        await expect(toast).not.toBeAttached({ timeout: 5000 });
    });

    test("closes a toast when Escape key is pressed", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        await showInfo(page, "Close me via Escape");

        const toast = page.locator(".toast.info");
        await expect(toast).toBeVisible();

        await page.keyboard.press("Escape");

        // The toast should transition to "removing" and then be detached.
        await expect(toast).toHaveClass(/removing/);
        await expect(toast).not.toBeAttached({ timeout: 5000 });
    });

    test("shows warning and error notifications with correct icons", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        await showWarning(page, "E2E warning");
        await showError(page, "E2E error");

        const warningToast = page.locator(".toast.warning");
        await expect(warningToast).toBeVisible();
        await expect(warningToast).toContainText("E2E warning");
        await expect(warningToast.locator("svg.icon[data-icon='Warning']")).toBeVisible();

        const errorToast = page.locator(".toast.error");
        await expect(errorToast).toBeVisible();
        await expect(errorToast).toContainText("E2E error");
        await expect(errorToast.locator("svg.icon[data-icon='Error']")).toBeVisible();
    });

    test("toggles history view via the status bar bell icon", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        // Show a notification first so there is content in the history.
        await showInfo(page, "History test");
        await expect(page.locator(".toast.info")).toBeVisible();

        // Click the bell icon while the toast is still visible. Closing a toast
        // removes it from both main and history lists, so we open history first.
        const bellButton = page.locator("#showNotificationHistory");
        await expect(bellButton).toBeVisible();
        await bellButton.click();

        const nc = page.locator(".notificationCenter.history");
        await expect(nc).toBeVisible();
        await expect(nc.locator("#historyHeader")).toBeVisible();
        await expect(nc.locator("#historyContainer .toast")).toContainText("History test");

        // Close history via Escape.
        await page.keyboard.press("Escape");
        await expect(nc).not.toBeVisible({ timeout: 3000 });
    });

    test("clears all notifications from history", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        // Show a notification first (so the history is not empty).
        await showInfo(page, "Clear test");
        await expect(page.locator(".toast.info")).toBeVisible();

        // Open history while the toast is still visible.
        await page.locator("#showNotificationHistory").click();

        const nc = page.locator(".notificationCenter.history");
        await expect(nc).toBeVisible();
        await expect(nc.locator("#historyContainer .toast")).toHaveCount(1);

        // Click "Clear All Notifications" (first button in the history header).
        await nc.locator("#historyHeader .du-btn").first().click();

        await expect(nc.locator("#historyHeader")).toContainText("NO NOTIFICATIONS");
        await expect(nc.locator("#historyContainer .toast")).toHaveCount(0);
    });

    test("toggles silent mode and suppresses non-error toasts", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        // Open history and enable silent mode (second button in the header).
        await page.locator("#showNotificationHistory").click();

        const nc = page.locator(".notificationCenter.history");
        await expect(nc).toBeVisible();
        await nc.locator("#historyHeader .du-btn").nth(1).click();

        // Close history.
        await page.locator("#showNotificationHistory").click();

        // The status bar bell item should now show a slash icon.
        const bellItem = page.locator("#showNotificationHistory");
        await expect(bellItem.locator("svg.icon[data-icon^='BellSlash']")).toBeVisible();

        // Info notifications should be suppressed in silent mode.
        await showInfo(page, "Should not appear");
        await expect(page.locator(".toast")).toHaveCount(0);

        // But they should still land in history.
        await page.locator("#showNotificationHistory").click();
        await expect(nc.locator("#historyContainer .toast")).toContainText("Should not appear");
    });

    test("shows error notifications even in silent mode", async ({ page }) => {
        await page.goto(beijaFlorImportPath);
        await expectImportedPolyrhythmSong(page);

        // Enable silent mode via history header.
        await page.locator("#showNotificationHistory").click();
        const nc = page.locator(".notificationCenter.history");
        await nc.locator("#historyHeader .du-btn").nth(1).click();
        await page.locator("#showNotificationHistory").click();

        // Error must bypass silent mode.
        await showError(page, "Critical error");

        const errorToast = page.locator(".toast.error");
        await expect(errorToast).toBeVisible();
        await expect(errorToast).toContainText("Critical error");
    });
});
