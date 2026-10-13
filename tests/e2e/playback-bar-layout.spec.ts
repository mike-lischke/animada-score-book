/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, test } from "@playwright/test";

import { openSeededStaffScore, routeApi } from "./e2e-test-helpers.js";

/** Tracks of the seeded score. They drive the vertical extent, so the viewer has something to scroll. */
const seededTracks = 10;

/** Measures of the seeded score. */
const seededMeasures = 2;

test.beforeEach(async ({ page }) => {
    await routeApi(page);
});

test("keeps the playback bar at the left edge and the toasts at the right", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const gaps = await page.evaluate(() => {
        const frame = document.querySelector("#appRoot")!.getBoundingClientRect();
        const bar = document.querySelector("#playbackControlsHost")!.getBoundingClientRect();
        const footer = document.querySelector(".appFooter")!.getBoundingClientRect();
        const toasts = document.querySelector(".notificationCenter")!.getBoundingClientRect();
        const playButton = document.querySelector(".playStopButton")!.getBoundingClientRect();

        return {
            barToFrame: Math.round(bar.left - frame.left),
            barToFooter: Math.round(footer.top - bar.bottom),
            toastsToFrame: Math.round(frame.right - toasts.right),
            playButtonToFrame: Math.round(playButton.left - frame.left),
            playButtonToBar: Math.round(playButton.left - bar.left),
        };
    });

    // The frame is drawn with a 1px border, so its content edge is one pixel inside its box.
    expect(gaps.barToFrame).toBe(13);
    expect(gaps.barToFooter).toBe(12);
    expect(gaps.toastsToFrame).toBe(9);

    // The play button is the bar's left end, which puts it within thumb reach at the frame's edge.
    expect(gaps.playButtonToBar).toBeLessThanOrEqual(7);
    expect(gaps.playButtonToFrame).toBeLessThanOrEqual(20);
});

test("lays the playback bar out as the mockup describes it", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const layout = await page.evaluate(() => {
        const controls = document.querySelector("#arrangementPlayControls")!;
        const describe = (element: Element): string => {
            if (element.classList.contains("playStopButton")) {
                return "play";
            }

            if (element.classList.contains("tempoStepper")) {
                return "tempo";
            }

            if (element.classList.contains("volumeControl")) {
                return "volume";
            }

            return `switch:${element.getAttribute("title")}`;
        };

        const switches = Array.from(document.querySelectorAll(".playControlSwitch")).map((element) => {
            const children = Array.from(element.children);
            const icon = element.querySelector("svg.icon")!;
            const dot = element.querySelector(".playControlSwitchDot")!;
            const button = element.getBoundingClientRect();
            const dotBox = dot.getBoundingClientRect();

            return {
                order: [children.indexOf(icon), children.indexOf(dot)],
                iconSize: Math.round(icon.getBoundingClientRect().width),
                dotSize: Math.round(dotBox.width),
                dotToButtonCentre: Math.round((dotBox.left + (dotBox.width / 2)) - (button.left + (button.width / 2))),
            };
        });

        return {
            order: Array.from(controls.children).map(describe),
            switches,
            stepSizes: Array.from(document.querySelectorAll(".tempoStepButton")).map((element) => {
                return Math.round(element.getBoundingClientRect().width);
            }),
        };
    });

    expect(layout.order).toEqual([
        "play", "tempo", "switch:Loop playback", "switch:Metronome",
        "switch:Play a count-in before playback starts", "volume",
    ]);

    // The steps are the round buttons of the mockup's tempo pill.
    expect(layout.stepSizes).toEqual([23, 23]);

    for (const entry of layout.switches) {
        // The status dot follows its icon, as in the mockup.
        expect(entry.order).toEqual([0, 1]);
        expect(entry.iconSize).toBe(18);
        expect(entry.dotSize).toBe(8);
        expect(entry.dotToButtonCentre).toBeGreaterThan(0);
    }
});

test("leaves no score row hidden behind the playback bar", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const hiddenRows = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>("#viewerScrollHost")!;
        host.scrollTop = host.scrollHeight;

        const bar = document.querySelector("#playbackControlsHost")!.getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll(".staff-measure-track-row"));
        const overlapping = rows.filter((row) => {
            const box = row.getBoundingClientRect();

            return box.right > bar.left && box.left < bar.right && box.bottom > bar.top && box.top < bar.bottom;
        });

        return { scrollable: host.scrollHeight > host.clientHeight, rowCount: rows.length, hidden: overlapping.length };
    });

    // A score that fits the viewport would make the assertion below pass without proving anything.
    expect(hiddenRows.scrollable).toBe(true);
    expect(hiddenRows.rowCount).toBeGreaterThan(0);
    expect(hiddenRows.hidden).toBe(0);
});

test("keeps the play button and every following control fixed when playback toggles", async ({ page }) => {
    await openSeededStaffScore(page, seededTracks, seededMeasures);

    const readLayout = async () => {
        return page.locator("#arrangementPlayControls").evaluate((element) => {
            return [...element.children].map((control) => {
                const rect = control.getBoundingClientRect();

                return { x: rect.x, width: rect.width, height: rect.height };
            });
        });
    };

    const before = await readLayout();

    await page.locator("#playbackButton").click();
    await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".playStopLabel")).toHaveText("Stop");
    expect(await readLayout()).toEqual(before);

    await page.locator("#playbackButton").click();
    await expect(page.locator("#playbackButton")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".playStopLabel")).toHaveText("Play");
    expect(await readLayout()).toEqual(before);
});
