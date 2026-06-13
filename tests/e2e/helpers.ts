/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, type Page } from "@playwright/test";

const normalizeWhitespace = (value: string): string => {
    return value.trim().replace(/\s+/g, " ");
};

export const beijaFlorTitle = "Beija Flor 2004  -  Bossa 1 (H-Break)";
export const beijaFlorDisplayedTitle = normalizeWhitespace(beijaFlorTitle);

/* cspell:disable */
export const beijaFlorQuery = "t=Beija%20Flor%202004%20%20-%20%20Bossa%201%20(H-Break)&a2=4-4.90.14.1-4.16.0L_az" +
    "YRUEbg3lJEpuOGUq3HknIaYTu3knddzjNwWDiPovBupb2boWJpOB729.11mHoK~57g6WSv9lg2~ICsMNOEMJMGdyMT9lUSOt5QCa_W9~YDH" +
    "yxvsmZPylI.2FYKNKqoq1_CZXkKPU1OhgKjE8VDrexqSXQds4sG785wNF4f7xoaAaNUq-yBlQcj1TQRSQyess.3avauavauavauavauauava" +
    "uavavauavauavauavauavauavauavauavauavauavau800080008o8o8r56avauavauavauavauavauavauavauavau.559SacD7t~UnpEVSd" +
    "86VLzz3PKMeym0tYxAx3YixVPHv36R0bTaaFmHXYp2O9mXW6CTLgoXh_APEOtac8YsqQgld.71nRqYFWTNepVXuthyG_FhAA5IpXSnhpz0Q6v" +
    "BN4PZ4fFP54miBwJwPPN0ZRt.8IIvqnHh~I9QnmI3WgBWEWB64O7pmRKugGX4Fk80p1_qwYN8deWdX3XrYNHE.91nNBOfFQhuq_wMwmUYct_rO" +
    "ihmvrXU2CaLCMmRQp80qXI3_QoOAsq_2UthSu";
/* cspell:enable */

export const beijaFlorImportPath = `/?${beijaFlorQuery}`;

export const routeApi = async (page: Page): Promise<void> => {
    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ status: "ok", initialized: true, engine: "mysql", hasData: true }),
            });

            return;
        }

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

export const expectImportedPolyrhythmSong = async (page: Page): Promise<void> => {
    await expect(page.locator("#appRoot")).toBeVisible();
    await expect.poll(async () => {
        const title = await page.locator("#mainArrangementTitle").first().textContent();

        return normalizeWhitespace(title ?? "");
    }).toBe(beijaFlorDisplayedTitle);
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();
};

export const ensureGridMode = async (page: Page): Promise<void> => {
    const trackViewToggle = page.locator("input.trackViewModeToggle").first();
    await expect(trackViewToggle).toBeVisible();

    if (await trackViewToggle.isChecked()) {
        await trackViewToggle.uncheck({ force: true });
    }

    await expect(trackViewToggle).not.toBeChecked();
    await expect(page.locator(".grid-measure-row").first()).toBeVisible();
};

export const expectGridModePolyrhythmNotes = async (page: Page): Promise<void> => {
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();
};

export interface IBarTrackGridSignature {
    baseCount: number;
    basePattern: string;
    fragmentCount: number;
    fragmentPatterns: string[];
}

export const expectGridBarSignature = async (page: Page, barNumber: number,
    expectedSignature: IBarTrackGridSignature[]): Promise<void> => {
    const actualSignature = await page.evaluate((currentBarNumber) => {
        const bar = document.querySelector(`.grid-measure-viewer[data-bar="${currentBarNumber}"]`);
        if (!bar) {
            return null;
        }

        const rows = Array.from(bar.querySelectorAll(".grid-measure-row"));

        return rows.map((row) => {
            const baseNotes = Array.from(row.querySelectorAll(":scope > .note-viewer"));
            const basePattern = baseNotes
                .map((noteElement) => {
                    return noteElement.querySelector(".note-style-symbol") ? "x" : "-";
                })
                .join("");

            const fragments = Array.from(row.querySelectorAll(":scope > .subdivision"));
            const fragmentPatterns = fragments.map((fragmentElement) => {
                const fragmentNotes = Array.from(
                    fragmentElement.querySelectorAll(":scope > .note-viewer")
                );

                return fragmentNotes
                    .map((noteElement) => {
                        return noteElement.querySelector(".note-style-symbol") ? "x" : "-";
                    })
                    .join("");
            });

            return {
                baseCount: baseNotes.length,
                basePattern,
                fragmentCount: fragments.length,
                fragmentPatterns,
            };
        });
    }, barNumber);

    expect(actualSignature).toEqual(expectedSignature);
};

export const expectGridBarDomSnapshot = async (
    page: Page,
    barNumber: number
): Promise<void> => {
    const barDomSnapshot = await page.evaluate((currentBarNumber) => {
        const bar = document.querySelector(`.grid-measure-viewer[data-bar="${currentBarNumber}"]`);
        if (!bar) {
            return null;
        }

        const barClone = bar.cloneNode(true) as HTMLElement;

        // IDs and inline styles are runtime-specific and make snapshots flaky.
        for (const element of Array.from(barClone.querySelectorAll<HTMLElement>("[id]"))) {
            element.removeAttribute("id");
        }

        for (const element of Array.from(barClone.querySelectorAll<HTMLElement>("[style]"))) {
            element.removeAttribute("style");
        }

        // Built asset URLs can change across builds; shape is what we care about.
        for (const image of Array.from(barClone.querySelectorAll<HTMLImageElement>("img"))) {
            image.removeAttribute("src");
        }

        const rows = Array.from(barClone.querySelectorAll<HTMLElement>(".grid-measure-row"));

        return rows.map((row) => {
            return row.outerHTML;
        }).join("\n");
    }, barNumber);

    expect(barDomSnapshot).not.toBeNull();
    expect(barDomSnapshot!.trimEnd()).toMatchSnapshot();
};

export const expectPlaybackToMove = async (page: Page): Promise<void> => {
    const playbackToggle = page.locator("#playbackButton");
    const playBeam = page.locator("#playBeam");

    await expect(playbackToggle).toBeVisible();
    await expect(playBeam).toBeVisible();

    const readBeamX = async (): Promise<number> => {
        return playBeam.evaluate((element) => {
            return (element as HTMLElement).getBoundingClientRect().left;
        });
    };

    const initialX = await readBeamX();
    expect(Number.isFinite(initialX)).toBeTruthy();

    await playbackToggle.check({ force: true });
    await expect(playbackToggle).toBeChecked();

    await expect.poll(async () => {
        const currentX = await readBeamX();

        return Math.abs(currentX - initialX);
    }).toBeGreaterThan(1);

    await playbackToggle.uncheck({ force: true });
    await expect(playbackToggle).not.toBeChecked();
};

export const readStoredCurrentScore = async (page: Page): Promise<string> => {
    await expect.poll(async () => {
        return page.evaluate(() => {
            const state = window.history.state as { sessionId?: string; } | null;
            const sessionId = state?.sessionId ?? window.sessionStorage.getItem("asb-session-id");
            if (!sessionId) {
                return null;
            }

            const sessionSettingsKey = `asb-ui-settings-session-${sessionId}`;
            const sessionSettings = window.localStorage.getItem(sessionSettingsKey);
            if (!sessionSettings) {
                return null;
            }

            const currentScore = (JSON.parse(sessionSettings) as { currentScore?: string; }).currentScore;

            return typeof currentScore === "string" ? currentScore : null;
        });
    }).not.toBeNull();

    return page.evaluate(() => {
        const state = window.history.state as { sessionId?: string; } | null;
        const sessionId = state?.sessionId ?? window.sessionStorage.getItem("asb-session-id");
        const sessionSettingsKey = `asb-ui-settings-session-${sessionId}`;
        const sessionSettings = window.localStorage.getItem(sessionSettingsKey);
        const currentScore = sessionSettings
            ? (JSON.parse(sessionSettings) as { currentScore?: string; }).currentScore
            : undefined;

        return currentScore ?? "";
    });
};
