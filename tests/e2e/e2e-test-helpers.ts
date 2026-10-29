/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";

const normalizeWhitespace = (value: string): string => {
    return value.trim().replace(/\s+/g, " ");
};

/**
 * Scrolls the staff viewer until the given measure is rendered. The staff view renders only the measures around
 * the viewport, so a test that inspects a measure has to bring it into that window first.
 *
 * @param page The page under test.
 * @param barNumber The 1-based measure number that has to be rendered.
 */
export const ensureStaffBarRendered = async (page: Page, barNumber: number): Promise<void> => {
    await expect.poll(async () => {
        return page.evaluate((bar) => {
            const host = document.querySelector<HTMLElement>("#trackViewerHost");
            const viewers = Array.from(document.querySelectorAll<HTMLElement>(".staff-measure-viewer"));
            const rendered = viewers.some((viewer) => {
                return viewer.querySelector(".staff-measure-number")?.textContent === String(bar);
            });
            if (rendered || !host || viewers.length === 0) {
                return rendered;
            }

            // Measure columns share their width, so the offset of an unknown measure follows from a rendered one.
            const first = Number(viewers[0].querySelector(".staff-measure-number")?.textContent ?? "0");
            host.scrollLeft = viewers[0].offsetLeft + ((bar - first) * viewers[0].offsetWidth);

            return false;
        }, barNumber);
    }, { message: `measure ${barNumber} should be rendered in the staff view` }).toBe(true);
};

/**
 * @param page The page under test.
 * @param barNumber The 1-based measure number to locate.
 *
 * @returns The rendered staff measure of the given measure number.
 */
export const findStaffMeasure = async (page: Page, barNumber: number): Promise<Locator> => {
    await ensureStaffBarRendered(page, barNumber);

    return page.locator(".staff-measure-viewer").filter({
        has: page.locator(".staff-measure-number", { hasText: new RegExp(`^${barNumber}$`) }),
    }).first();
};

/**
 * Selects the whole track piece of a bar by clicking its staff line, away from any note.
 *
 * @param page The page under test.
 * @param barNumber The 1-based measure number.
 */
export const selectTrackPiece = async (page: Page, barNumber: number): Promise<void> => {
    const row = (await findStaffMeasure(page, barNumber)).locator(".staff-measure-track-row").first();
    const rowBox = await row.boundingBox();
    const lineBox = await row.locator(".staff-note-viewer-line").first().boundingBox();
    if (!rowBox || !lineBox) {
        throw new Error("The track row has no bounding box.");
    }

    // Clicking through the locator scrolls the row into the viewport first, which a coordinate click does not.
    await row.click({
        position: {
            x: Math.round(rowBox.width * 0.15),
            y: Math.round(lineBox.y - rowBox.y + (lineBox.height / 2)),
        },
    });
};

/**
 * Resolves a button of the subdivision toolbar by the tooltip that names it, so adding a button to one of its groups
 * does not move the ones beside it.
 *
 * @param page The page under test.
 * @param tooltip The tooltip the button carries.
 *
 * @returns The button.
 */
export const toolbarButton = (page: Page, tooltip: string): Locator => {
    return page.locator(`.subdivision-toolbar button[title="${tooltip}"]`);
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

/**
 * Scrolls the score until the given element is clear of the floating tools bar. The bar overlaps the right end of
 * the action bar to save space, so a per-measure button underneath it has to be scrolled out from under it the way
 * a user would.
 *
 * @param page The page under test.
 * @param element The element that has to become clickable.
 */
export const scrollClearOfToolsBar = async (page: Page, element: Locator): Promise<void> => {
    for (let attempt = 0; attempt < 8; attempt++) {
        const bar = await page.locator("#toolsBarHost").boundingBox();
        const box = await element.boundingBox();
        if (!bar || !box || box.x + box.width <= bar.x) {
            return;
        }

        const overlap = Math.ceil((box.x + box.width) - bar.x);
        const scrolled = await page.evaluate(async (distance) => {
            const host = document.querySelector<HTMLElement>("#trackViewerHost");
            if (!host) {
                return false;
            }

            const before = host.scrollLeft;
            host.scrollLeft = before + distance;

            // The strip follows the scroll event, so the next two frames carry the buttons to their new place.
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            });

            return host.scrollLeft > before;
        }, overlap + 16);

        if (!scrolled) {
            return;
        }
    }
};

/**
 * Sets up API mocks so that the session appears already authenticated
 * (whoami returns an admin user, refresh returns a token).
 * The login dialog will not appear.
 *
 * @param page The Playwright page.
 */
export const setupAuthenticatedSession = async (page: Page): Promise<void> => {
    await page.route("**/api?action=whoami", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                authenticated: true,
                user: { id: 1, username: "test", displayName: "Test", isAdmin: true },
                capabilities: {
                    canEditScores: true, canManageUsers: true,
                    canManageInstruments: true, canExportMP3: true
                },
            }),
        });
    });

    await page.route("**/api?action=refresh", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ token: "test-token" }),
        });
    });
};

/**
 * Sets up API mocks so that the session appears anonymous (whoami returns
 * `authenticated: false`). The login dialog will appear on page load.
 *
 * @param page The Playwright page.
 */
export const setupAnonymousSession = async (page: Page): Promise<void> => {
    await page.route("**/api?action=whoami", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                authenticated: false,
                capabilities: {
                    canEditScores: false, canManageUsers: false,
                    canManageInstruments: false, canExportMP3: false,
                },
            }),
        });
    });

    await page.route("**/api?action=refresh", async (route) => {
        await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "No refresh token" }),
        });
    });
};

export const routeApi = async (page: Page): Promise<void> => {
    // Default: authenticated session so existing tests work without login dialog.
    await setupAuthenticatedSession(page);

    await page.route("**/api**", async (route) => {
        const url = new URL(route.request().url());
        const action = url.searchParams.get("action");

        if (action === "health") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    status: "ok", initialized: true, engine: "mysql", hasData: true,
                    hasUsers: true, configLoaded: true,
                    host: "127.0.0.1", port: 3306, database: "animada_score_book",
                }),
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
        const title = await page.locator("#arrangementIdentityTitle").first().textContent();

        return normalizeWhitespace(title ?? "");
    }).toBe(beijaFlorDisplayedTitle);
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".grid-measure-row .note-viewer").first()).toBeVisible();
};

/**
 * @param page The page under test.
 * @param mode The view the segment selects.
 *
 * @returns The mode bar's segment for that view.
 */
export const trackViewSegment = (page: Page, mode: "grid" | "staff"): Locator => {
    const title = mode === "grid" ? "Show the score as a note grid (G)" : "Show the score as staff notation (S)";

    return page.locator(`#arrangementModeBar button[title="${title}"]`);
};

/**
 * Switches the score to the given view through the mode bar.
 *
 * @param page The page under test.
 * @param mode The view to show.
 */
export const showTrackView = async (page: Page, mode: "grid" | "staff"): Promise<void> => {
    const segment = trackViewSegment(page, mode);
    await expect(segment).toBeVisible();

    if (await segment.getAttribute("aria-pressed") !== "true") {
        await segment.click({ force: true });
    }

    await expect(segment).toHaveAttribute("aria-pressed", "true");
};

/**
 * @param page The page under test.
 * @param mode The entry mode the segment selects.
 *
 * @returns The mode bar's segment for that entry mode.
 */
export const entryModeSegment = (page: Page, mode: "insert" | "overwrite"): Locator => {
    const title = mode === "insert"
        ? "Enter notes by pushing the content behind the cursor (I)"
        : "Enter notes by replacing the content at the cursor (O)";

    return page.locator(`#arrangementModeBar button[title="${title}"]`);
};

/**
 * Switches the staff view's entry mode through the mode bar.
 *
 * @param page The page under test.
 * @param mode The entry mode to switch to.
 */
export const showEntryMode = async (page: Page, mode: "insert" | "overwrite"): Promise<void> => {
    const segment = entryModeSegment(page, mode);
    await expect(segment).toBeVisible();

    if (await segment.getAttribute("aria-pressed") !== "true") {
        await segment.click({ force: true });
    }

    await expect(segment).toHaveAttribute("aria-pressed", "true");
};

export const ensureGridMode = async (page: Page): Promise<void> => {
    await showTrackView(page, "grid");
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
        const bar = document.querySelectorAll(".grid-measure-viewer")[currentBarNumber - 1];
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
        const bar = document.querySelectorAll(".grid-measure-viewer")[currentBarNumber - 1];
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

    expect(barDomSnapshot.trimEnd()).toMatchSnapshot();
};

export const expectPlaybackToMove = async (page: Page): Promise<void> => {
    const playbackToggle = page.locator("#playbackButton");
    const playButton = page.locator("#arrangementPlayControls .play-stop-button");
    const playBeam = page.locator("#playBeam");

    await expect(playButton).toBeVisible();

    // The beam marks playback, so it is hidden while none runs.
    await expect(playBeam).toBeHidden();

    const readBeamX = async (): Promise<number> => {
        return playBeam.evaluate((element) => {
            return (element as HTMLElement).getBoundingClientRect().left;
        });
    };

    await playButton.click();
    await expect(playbackToggle).toHaveAttribute("aria-pressed", "true");
    await expect(playBeam).toBeVisible();

    const initialX = await readBeamX();
    expect(Number.isFinite(initialX)).toBeTruthy();

    await expect.poll(async () => {
        const currentX = await readBeamX();

        return Math.abs(currentX - initialX);
    }).toBeGreaterThan(1);

    await playButton.click();
    await expect(playbackToggle).toHaveAttribute("aria-pressed", "false");
    await expect(playBeam).toBeHidden();
};

/**
 * A measure of a seeded staff score, filled with quarter notes.
 *
 * @param number The 1-based measure number.
 *
 * @returns The measure.
 */
const seededMeasure = (number: number) => {
    return {
        number,
        meter: { beats: 4, beatUnits: 4, stepResolution: 16, beatGroups: [4, 4, 4, 4] },
        events: [0, 1, 2, 3].map((beat) => {
            return {
                start: { numerator: beat, denominator: 4 },
                duration: { numerator: 1, denominator: 4 },
                noteStyleId: "1",
            };
        }),
        subdivisions: [],
    };
};

/**
 * @param trackCount The number of tracks to seed.
 * @param measureCount The number of measures each track gets.
 *
 * @returns The snapshot of a score with that many tracks and measures.
 */
const seededScoreSnapshot = (trackCount: number, measureCount: number) => {
    const tracks = Array.from({ length: trackCount }, (_, track) => {
        return {
            id: 300 + track,
            instrumentId: "0",
            measures: Array.from({ length: measureCount }, (_, measure) => {
                return seededMeasure(measure + 1);
            }),
        };
    });

    return {
        version: arrangementSnapshotVersion,
        title: "E2E Seeded Score",
        timeParams: { timeSignature: "4/4", tempo: 120, length: measureCount, pulse: "1/4", stepResolution: 16 },
        tracks,
    };
};

/**
 * Opens the app on a seeded score in staff mode. The score is built instead of loaded from the backend, so a test can
 * state how much content the viewer has to show.
 *
 * @param page The page under test.
 * @param trackCount The number of tracks to seed. They drive the vertical extent of the score.
 * @param measureCount The number of measures to seed.
 */
export const openSeededStaffScore = async (page: Page, trackCount: number, measureCount: number): Promise<void> => {
    await page.addInitScript((data: { packed: string; }) => {
        const sessionId = "e2e-seeded-score";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            viewSettings: { arrangementViewSettings: { displayMode: "staff" } },
        }));
    }, { packed: stringifyPackedArrangement(seededScoreSnapshot(trackCount, measureCount)) });

    await page.goto("/");
    await expect(page.locator("#trackViewerHost")).toBeVisible();
    await expect(page.locator(".staff-measure-viewer")).toHaveCount(measureCount);
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

/**
 * Samples the play head while playback runs and collects the bars it passes, in order.
 *
 * @param page The page under test.
 * @param visits The number of entries to collect before resolving. Zero runs until playback stops.
 *
 * @returns The bars the play head visited, in the order it reached them.
 */
export const playbackBars = async (page: Page, visits = 0): Promise<number[]> => {
    return page.evaluate((requiredVisits) => {
        return new Promise<number[]>((resolve, reject) => {
            const seen: number[] = [];
            let previousProgress = 0;
            const started = performance.now();
            const sample = (): void => {
                const playing = document.querySelector("#playbackButton")?.getAttribute("aria-pressed") === "true";
                if (!playing && seen.length > 0) {
                    resolve(seen);

                    return;
                }

                const beam = document.querySelector("#playBeam")?.getBoundingClientRect();
                if (beam && playing) {
                    for (const measure of document.querySelectorAll(".grid-measure-viewer, .staff-measure-viewer")) {
                        const rect = measure.getBoundingClientRect();
                        if (beam.left < rect.left || beam.left >= rect.right) {
                            continue;
                        }

                        const bar = Number(measure.querySelector(".measure-focus-button")?.getAttribute("data-bar")
                            ?? measure.querySelector(".grid-measure-number, .staff-measure-number")?.textContent);
                        const progress = (beam.left - rect.left) / rect.width;
                        if (seen.at(-1) !== bar || progress < previousProgress - 0.25) {
                            seen.push(bar);
                        }

                        previousProgress = progress;

                        break;
                    }
                }

                if (requiredVisits > 0 && seen.length >= requiredVisits) {
                    resolve(seen);

                    return;
                }

                if (performance.now() - started > 10_000) {
                    reject(new Error(`Playback did not finish: ${seen.join(", ")}`));

                    return;
                }

                requestAnimationFrame(sample);
            };

            sample();
        });
    }, visits);
};
