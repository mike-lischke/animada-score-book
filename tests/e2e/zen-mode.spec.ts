import { expect, test, type Locator, type Page } from "@playwright/test";

import { stringifyPackedArrangement } from "../../src/core/serialisation/snapshot-packing.js";
import { arrangementSnapshotVersion } from "../../src/core/serialisation/snapshots.js";
import { EditEntryMode, TrackViewMode, type IArrangementSnapshot } from "../../src/core/types/general.js";
import type {
    ISerialisedSelectionEntry, ISerialisedSelectionState,
} from "../../src/ui/SelectionSerializer.js";
import { ensureStaffBarRendered, findStaffMeasure, readStoredCurrentScore, routeApi } from "./e2e-test-helpers.js";

const openScore = async (page: Page, mode: TrackViewMode, repeatSecondBar = false): Promise<void> => {
    const snapshot: IArrangementSnapshot = {
        version: arrangementSnapshotVersion,
        title: "E2E Zen Score",
        timeParams: { timeSignature: "4/4", tempo: 240, length: 3, pulse: "1/4", stepResolution: 16 },
        tracks: Array.from({ length: 10 }, (_, track) => {
            return {
                id: 300 + track,
                instrumentId: String(track % 3),
                measures: Array.from({ length: 3 }, (_, measure) => {
                    return {
                        number: measure + 1,
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
                }),
            };
        }),
        extensions: repeatSecondBar ? { repeatBars: { 2: { start: true, end: true } } } : undefined,
    };

    await page.addInitScript((data) => {
        const sessionId = "e2e-zen-score";
        window.history.replaceState({ ...(window.history.state ?? {}), sessionId }, "");
        window.sessionStorage.setItem("asb-session-id", sessionId);
        window.localStorage.setItem(`asb-ui-settings-session-${sessionId}`, JSON.stringify({
            currentScore: data.packed,
            editMode: true,
            entryMode: data.entryMode,
            loop: false,
            countIn: false,
            tutorialEnabled: false,
            viewSettings: { arrangementViewSettings: { displayMode: data.mode } },
        }));
    }, { packed: stringifyPackedArrangement(snapshot), mode, entryMode: EditEntryMode.Overwrite });

    await page.goto("/");
    await expect(page.locator(`#trackViewerContainer.view-${mode}`)).toBeVisible();
    await expect(page.locator("#appContent")).toHaveClass(/score-editing/);
};

const enterZen = async (page: Page): Promise<void> => {
    await page.locator("#zenModeButton").click();
    await expect(page.locator("#zenModeButton")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".zenMeasurePlayButton")).not.toHaveCount(0);
};

const selectBar = async (page: Page, bar: number): Promise<void> => {
    if (await page.locator("#trackViewerContainer.view-staff").count() > 0) {
        await ensureStaffBarRendered(page, bar);
    }

    const button = page.locator(`.zenMeasurePlayButton[data-bar="${bar}"]`);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
};

const firstNote = (page: Page, mode: TrackViewMode): Locator => {
    return page.locator(mode === TrackViewMode.Grid ? ".note-viewer" : ".staff-note-head").first();
};

const storedSelection = async (page: Page): Promise<string | undefined> => {
    return page.evaluate(() => {
        const stored = window.localStorage.getItem("asb-ui-settings-session-e2e-zen-score");
        const settings = JSON.parse(stored ?? "{}") as { viewSettings?: { selectionState?: string; }; };

        return settings.viewSettings?.selectionState;
    });
};

const playbackBars = async (page: Page, visits = 0): Promise<number[]> => {
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

                        const bar = Number(measure.querySelector(".zenMeasurePlayButton")?.getAttribute("data-bar")
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

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

for (const mode of [TrackViewMode.Grid, TrackViewMode.Staff]) {
    test.describe(`Zen mode in ${mode}`, () => {
        test("hides editing controls and restores the original selection", async ({ page }) => {
            await openScore(page, mode);
            await firstNote(page, mode).click();
            await expect(page.locator(".selection-cursor")).toBeVisible();
            await expect.poll(async () => {
                return storedSelection(page);
            }).toBeTruthy();
            const originalSelection = await storedSelection(page);
            const originalScore = await readStoredCurrentScore(page);

            await enterZen(page);
            await expect(page.locator("#headerContent")).toHaveCount(0);
            await expect(page.locator("#arrangementActionBar")).toHaveCount(0);
            await expect(page.locator(".trackEditSidebar")).toHaveCount(0);
            await expect(page.locator("#toolsBarHost")).toHaveCount(0);
            await expect(page.locator(".trackVolumeSlider")).toHaveCount(0);
            await expect(page.locator(".trackInstrumentLabel")).toHaveCount(10);
            await expect(page.locator(".selection-overlay")).toHaveCount(0);
            await expect(page.locator(".selection-cursor")).toBeHidden();

            await firstNote(page, mode).click();
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("Delete");
            await page.keyboard.press("ControlOrMeta+z");
            await page.keyboard.press("ControlOrMeta+x");
            await page.keyboard.press("ControlOrMeta+v");
            await expect(page.locator(".selection-overlay")).toHaveCount(0);
            await expect(page.locator(".selection-cursor")).toBeHidden();
            expect(await readStoredCurrentScore(page)).toBe(originalScore);
            expect(await storedSelection(page)).toBe(originalSelection);

            await selectBar(page, 2);
            await page.keyboard.press("Escape");
            await expect(page.locator('.zenMeasurePlayButton[data-bar="2"]')).toHaveAttribute("aria-pressed", "true");

            await page.locator("#zenModeButton").click();
            await expect(page.locator("#appContent")).toHaveClass(/score-editing/);
            await expect(page.locator("#headerContent")).toBeVisible();
            await expect(page.locator("#arrangementActionBar")).toBeVisible();
            await expect(page.locator(".trackEditSidebar")).toBeVisible();
            await expect(page.locator(".selection-cursor")).toBeVisible();
            await expect.poll(async () => {
                return storedSelection(page);
            }).toBe(originalSelection);
        });

        test("drags the viewer in both axes without selecting score content", async ({ page }) => {
            await openScore(page, mode);
            await enterZen(page);
            const before = await page.locator("#trackViewerHost").evaluate((element) => {
                return { x: element.scrollLeft, canScroll: element.scrollWidth > element.clientWidth };
            });
            expect(before.canScroll).toBe(true);
            const host = (await page.locator("#trackViewerHost").boundingBox())!;

            await page.mouse.move(host.x + 350, host.y + 300);
            await page.mouse.down();
            await page.mouse.move(host.x + 150, host.y + 200, { steps: 10 });
            await page.mouse.up();

            await expect.poll(async () => {
                return page.locator("#trackViewerHost").evaluate((element) => {
                    return element.scrollLeft;
                });
            }).toBeGreaterThan(before.x + 100);
            await expect.poll(async () => {
                return page.locator("#viewerScrollHost").evaluate((element) => {
                    return element.scrollTop;
                });
            }).toBeGreaterThan(50);
            await expect(page.locator(".selection-overlay")).toHaveCount(0);
            await expect(page.locator('.zenMeasurePlayButton[aria-pressed="true"]')).toHaveCount(0);
        });

        test("plays the filled range between marked bars", async ({ page }) => {
            await openScore(page, mode);
            await enterZen(page);
            await selectBar(page, 1);
            await selectBar(page, 3);
            await page.locator("#playbackButton").click();
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

            expect(await playbackBars(page)).toEqual([1, 2, 3]);
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "false");
            await expect(page.locator(".selection-overlay")).toHaveCount(0);
        });

        test("plays the full score again when every bar is unmarked", async ({ page }) => {
            await openScore(page, mode);
            await enterZen(page);
            await selectBar(page, 2);
            await page.locator('.zenMeasurePlayButton[data-bar="2"]').click();
            await expect(page.locator('.zenMeasurePlayButton[aria-pressed="true"]')).toHaveCount(0);
            await page.locator("#playbackButton").click();
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

            expect(await playbackBars(page)).toEqual([1, 2, 3]);
        });

        test("keeps repeat barlines in the filtered performance", async ({ page }) => {
            await openScore(page, mode, true);
            await enterZen(page);
            await selectBar(page, 2);
            await expect(page.locator('.zenMeasurePlayButton[aria-pressed="true"]')).toHaveCount(1);
            await page.locator("#playbackButton").click();
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

            expect(await playbackBars(page)).toEqual([2, 2]);
        });

        test("extends the selection outside Zen mode without gaps", async ({ page }) => {
            await openScore(page, mode);

            for (const bar of [1, 3]) {
                const measure = mode === TrackViewMode.Staff
                    ? await findStaffMeasure(page, bar) : page.locator(".grid-measure-viewer").nth(bar - 1);
                const row = measure.locator(".grid-measure-row, .staff-measure-track-row").first();
                await row.scrollIntoViewIfNeeded();
                const box = (await row.boundingBox())!;
                if (bar === 3) {
                    await page.keyboard.down("Shift");
                }

                await page.mouse.click(box.x + Math.min(200, box.width / 2), box.y - 5);
                await page.keyboard.up("Shift");
            }

            await expect.poll(async () => {
                const stored = await storedSelection(page);
                const selection = JSON.parse(stored ?? "null") as
                    | ISerialisedSelectionEntry[]
                    | ISerialisedSelectionState
                    | null;
                let entries: ISerialisedSelectionEntry[] = [];
                if (Array.isArray(selection)) {
                    entries = selection;
                } else if (selection !== null && Array.isArray(selection.entries)) {
                    entries = selection.entries;
                }

                return entries.map((entry) => {
                    return entry.bar;
                });
            }).toEqual([1, 2, 3]);
            await page.locator("#playbackButton").click();
            await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

            expect(await playbackBars(page)).toEqual([1, 2, 3]);
        });

        test("keeps the title above passing buttons and aligns the instrument labels", async ({ page }) => {
            await openScore(page, mode);
            await enterZen(page);
            const identity = page.locator(".zenArrangementIdentityHost");
            await expect(identity).toContainText("E2E Zen Score");
            await expect(identity.locator(".arrangementSaveChip")).toHaveCount(0);
            await expect(identity).toHaveCSS("box-shadow", "none");
            const before = (await identity.boundingBox())!;
            const room = await page.evaluate(() => {
                const button = document.querySelector(".zenMeasurePlayButton")!.getBoundingClientRect();
                const row = document.querySelector(".grid-measure-row, .staff-measure-track-row")!
                    .getBoundingClientRect();
                const label = document.querySelector(".trackLabelRow")!.getBoundingClientRect();
                const list = getComputedStyle(document.querySelector(".trackLabelsList")!);
                const beam = document.querySelector(".grid-measure-beam")?.getBoundingClientRect();

                return {
                    gap: beam ? beam.top - button.bottom : row.top - button.bottom,
                    alignment: Math.abs(row.top - label.top),
                    padding: [list.paddingLeft, list.paddingRight],
                };
            });
            expect(room.gap).toBeGreaterThanOrEqual(4);
            expect(room.alignment).toBeLessThanOrEqual(2);
            expect(room.padding).toEqual(["16px", "16px"]);

            await page.evaluate(() => {
                const host = document.querySelector<HTMLElement>("#trackViewerHost")!;
                const title = document.querySelector(".zenArrangementIdentityHost")!.getBoundingClientRect();
                const button = document.querySelector(".zenMeasurePlayButton")!.getBoundingClientRect();
                host.scrollLeft += button.left - title.left - 50;
            });
            await expect.poll(async () => {
                return page.evaluate(() => {
                    const button = document.querySelector(".zenMeasurePlayButton")!.getBoundingClientRect();

                    return !!document.elementFromPoint(button.left + 20, button.top + 14)
                        ?.closest(".zenArrangementIdentityHost");
                });
            }).toBe(true);

            const after = (await identity.boundingBox())!;
            expect(after.width).toBeCloseTo(before.width, 0);
            expect(after.x).toBeCloseTo(before.x, 0);
        });
    });
}

test("loops the filled range without leaving a gap", async ({ page }) => {
    await openScore(page, TrackViewMode.Staff);
    await enterZen(page);
    await selectBar(page, 1);
    await selectBar(page, 3);
    await page.locator('[title="Loop playback"]').click();
    await page.locator("#playbackButton").click();
    await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");

    expect(await playbackBars(page, 4)).toEqual([1, 2, 3, 1]);
    await page.locator("#playbackButton").click();
    await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "false");
});
