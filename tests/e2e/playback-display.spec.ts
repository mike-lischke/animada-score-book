import { expect, test, type Page } from "@playwright/test";

const routeApi = async (page: Page): Promise<void> => {
    await page.route("**/api.php**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "listSoundLib") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });

            return;
        }

        if (action === "listScoreFolderContent") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ folders: [], scores: [] }),
            });

            return;
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, id: 1 }),
        });
    });
};

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("renders arrangement UI and note grid", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#appRoot")).toBeVisible();
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".bar-track-row .note-viewer").first()).toBeVisible();
});

test("playback button starts and stops playback", async ({ page }) => {
    await page.goto("/");

    const playbackToggle = page.locator("#playbackButton");
    await expect(playbackToggle).toBeVisible();

    await playbackToggle.check({ force: true });
    await expect(playbackToggle).toBeChecked();

    await playbackToggle.uncheck({ force: true });
    await expect(playbackToggle).not.toBeChecked();
});

test("play beam moves while playback is running", async ({ page }) => {
    await page.goto("/");

    const playbackToggle = page.locator("#playbackButton");
    const playBeam = page.locator("#playBeam");

    await expect(playbackToggle).toBeVisible();
    await expect(playBeam).toBeVisible();

    const initialLeft = await playBeam.evaluate((element) => {
        const left = (element as HTMLElement).style.left;
        return Number.parseFloat(left || "0");
    });

    await playbackToggle.check({ force: true });
    await expect(playbackToggle).toBeChecked();

    await expect.poll(async () => {
        const left = await playBeam.evaluate((element) => {
            return Number.parseFloat((element as HTMLElement).style.left || "0");
        });

        return left !== initialLeft;
    }).toBeTruthy();

    await playbackToggle.uncheck({ force: true });
    await expect(playbackToggle).not.toBeChecked();
});
