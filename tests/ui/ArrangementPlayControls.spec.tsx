/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ArrangementPlayControls } from "../../src/components/ui/Arrangement/ArrangementPlayControls.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { ArrangementPlayer } from "../../src/player/ArrangementPlayer.js";
import { createInstrument } from "../unit-test-helpers.js";

/** A switch of the bar: the tooltip that names it, the arrangement field and the settings key it drives. */
interface ISwitchCase {
    tooltip: string;
    field: "loop" | "useMetronome" | "countIn";
    setting: "loop" | "metronome" | "countIn";
}

const switchCases: ISwitchCase[] = [
    { tooltip: "Loop playback", field: "loop", setting: "loop" },
    { tooltip: "Metronome", field: "useMetronome", setting: "metronome" },
    { tooltip: "Play a count-in before playback starts", field: "countIn", setting: "countIn" },
];

/** The tempo bounds and step the bar works with, mirroring the constants of the component. */
const tempoMin = 30;
const tempoMax = 200;
const tempoStep = 5;

describe("ArrangementPlayControls", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;
    let dataModel: ScoreBookDataModel;

    /**
     * @param container The rendered container.
     * @param tooltip The tooltip naming the switch.
     *
     * @returns The switch button.
     */
    const switchButton = (container: Element, tooltip: string): HTMLButtonElement => {
        return container.querySelector<HTMLButtonElement>(`.play-control-switch[title="${tooltip}"]`)!;
    };

    /**
     * @param container The rendered container.
     * @param tooltip The tooltip naming the switch.
     *
     * @returns True if the switch reports its "on" state.
     */
    const isActive = (container: Element, tooltip: string): boolean => {
        return switchButton(container, tooltip).classList.contains("is-active");
    };

    /**
     * @param container The rendered container.
     * @param tooltip The tooltip naming a tempo step.
     *
     * @returns The tempo step button.
     */
    const stepButton = (container: Element, tooltip: string): HTMLButtonElement => {
        return container.querySelector<HTMLButtonElement>(`.tempo-step-button[title="${tooltip}"]`)!;
    };

    /**
     * Renders the playback bar for a fresh arrangement.
     *
     * @param editMode Whether the arrangement is edited, in which case the tempo is a score value.
     * @param compact Whether the bar folds its secondary controls into a menu.
     *
     * @returns The rendered container.
     */
    const renderControls = (editMode = false, compact = false): Element => {
        dataModel = new ScoreBookDataModel();
        dataModel.startNewArrangement([createInstrument("0", 0)]);

        renderResult = render(
            <ArrangementPlayControls
                arrangementPlayer={new ArrangementPlayer(dataModel)}
                dataModel={dataModel}
                editMode={editMode}
                compact={compact}
            />,
        );

        return renderResult.container;
    };

    /**
     * @param container The rendered container.
     *
     * @returns The links of the compact overflow menu.
     */
    const overflowLinks = (container: Element): HTMLAnchorElement[] => {
        return Array.from(container.querySelectorAll<HTMLAnchorElement>(".playbackOverflowMenu li > a"));
    };

    beforeEach(() => {
        AppStorage.clearUISettings();
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        AppStorage.clearUISettings();
    });

    it("mirrors every switch into the arrangement and the stored settings", () => {
        const container = renderControls();

        for (const entry of switchCases) {
            expect(isActive(container, entry.tooltip)).toBe(false);

            fireEvent.click(switchButton(container, entry.tooltip));

            expect(dataModel.arrangement![entry.field]).toBe(true);
            expect(isActive(container, entry.tooltip)).toBe(true);
            expect(AppStorage.loadUISettings()?.[entry.setting]).toBe(true);
        }
    });

    it("flips a switch back off", () => {
        const container = renderControls();
        const tooltip = switchCases[0].tooltip;

        fireEvent.click(switchButton(container, tooltip));
        fireEvent.click(switchButton(container, tooltip));

        expect(dataModel.arrangement!.loop).toBe(false);
        expect(isActive(container, tooltip)).toBe(false);
        expect(AppStorage.loadUISettings()?.loop).toBe(false);
    });

    it("shows the switches of a newly loaded arrangement", () => {
        const container = renderControls();
        expect(isActive(container, "Metronome")).toBe(false);

        AppStorage.saveSetting("metronome", true);
        const nextPlayer = new ArrangementPlayer(dataModel);
        dataModel.startNewArrangement([createInstrument("1", 1)]);
        renderResult!.rerender(
            <ArrangementPlayControls arrangementPlayer={nextPlayer} dataModel={dataModel} editMode={false} />,
        );

        expect(dataModel.arrangement!.useMetronome).toBe(true);
        expect(isActive(container, "Metronome")).toBe(true);
    });

    it("steps the tempo and marks it as deviating from the score", () => {
        const container = renderControls();
        const arrangement = dataModel.arrangement!;
        const tempo = arrangement.timeParams.tempo;

        expect(container.querySelector(".tempoValue")?.textContent).toBe(`${tempo}`);

        fireEvent.click(stepButton(container, "Increase playback tempo"));

        expect(arrangement.timeParams.tempo).toBe(tempo + tempoStep);
        expect(container.querySelector(".tempoValue")?.textContent).toBe(`${tempo + tempoStep}*`);

        fireEvent.click(stepButton(container, "Decrease playback tempo"));

        expect(arrangement.timeParams.tempo).toBe(tempo);
        expect(container.querySelector(".tempoValue")?.textContent).toBe(`${tempo}`);
    });

    it("keeps the tempo between its bounds", () => {
        const container = renderControls();
        const down = stepButton(container, "Decrease playback tempo");
        const up = stepButton(container, "Increase playback tempo");

        for (let i = 0; i < 2 * ((tempoMax - tempoMin) / tempoStep); i++) {
            fireEvent.click(down);
        }

        expect(dataModel.arrangement!.timeParams.tempo).toBe(tempoMin);
        expect(down.disabled).toBe(true);

        for (let i = 0; i < 2 * ((tempoMax - tempoMin) / tempoStep); i++) {
            fireEvent.click(up);
        }

        expect(dataModel.arrangement!.timeParams.tempo).toBe(tempoMax);
        expect(up.disabled).toBe(true);
    });

    it("folds the secondary controls into the overflow menu when compact", () => {
        const container = renderControls(false, true);

        // The bar keeps the transport and the tempo, everything else moves into the menu.
        expect(container.querySelector("#playbackButton")).toBeTruthy();
        expect(container.querySelector(".tempoStepper")).toBeTruthy();
        expect(container.querySelector(".playbackOverflowMenu")).toBeTruthy();
        expect(container.querySelector(".play-control-switch")).toBeNull();
        expect(container.querySelector("#volumeSlider")).toBeNull();

        expect(overflowLinks(container).map((link) => {
            return link.parentElement?.textContent.trim();
        })).toEqual(["Loop playbackOff", "MetronomeOff", "Count-inOff", "Volume100%"]);
    });

    it("drives the switches and their status dot from the compact menu", () => {
        const container = renderControls(false, true);

        expect(container.querySelector(".playbackOverflowDot")).toBeNull();

        fireEvent.click(overflowLinks(container)[0]);

        expect(dataModel.arrangement!.loop).toBe(true);
        expect(AppStorage.loadUISettings()?.loop).toBe(true);
        expect(overflowLinks(container)[0].parentElement?.textContent.trim()).toBe("Loop playbackOn");

        // Any active secondary control is reported on the menu's trigger.
        expect(container.querySelector(".playbackOverflowDot")).toBeTruthy();

        fireEvent.click(overflowLinks(container)[0]);

        expect(dataModel.arrangement!.loop).toBe(false);
        expect(container.querySelector(".playbackOverflowDot")).toBeNull();
    });

    it("changes the master volume from the compact menu", () => {
        const container = renderControls(false, true);
        const slider = container.querySelector<HTMLInputElement>(".playbackOverflowMenu input[type=range]")!;

        fireEvent.change(slider, { target: { value: "40" } });

        expect(dataModel.arrangement!.mainVolume).toBe(40);
        expect(AppStorage.loadUISettings()?.masterVolume).toBe(40);
        expect(overflowLinks(container)[3].parentElement?.textContent.trim()).toBe("Volume40%");
    });
});
