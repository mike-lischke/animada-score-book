/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ArticulationToolbar } from "../../src/components/ui/Arrangement/ArticulationToolbar.js";
import {
    Damping, ExcitationMode, NoteDisplayType, StickTechnique,
    type ISbDmTrack, type ScoreBookDataModel,
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { SelectionGranularity } from "../../src/ui/SelectionSerializer.js";

const makeNoteStyle = (
    id: string,
    builtInAccent: boolean,
    builtInDamping: Damping,
    ghost: boolean,
): IAudioData => {
    return {
        id,
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            stickTechnique: StickTechnique.Normal,
            mainDisplayType: NoteDisplayType.Oval,
        },
        sampleProfile: { builtInDamping, builtInAccent, ghost },
        audioBuffer: null,
    } as unknown as IAudioData;
};

const makeTrack = (id: number, instrumentId: number, noteStyles: Record<string, IAudioData>): ISbDmTrack => {
    return {
        id,
        instrument: { id: instrumentId, noteStyles },
    } as unknown as ISbDmTrack;
};

const makeTrackWithNote = (
    id: number,
    instrumentId: number,
    noteStyles: Record<string, IAudioData>,
    styleId: string,
): ISbDmTrack => {
    return {
        id,
        instrument: { id: instrumentId, noteStyles },
        measures: [
            {
                number: 1,
                meter: { stepResolution: 16 },
                noteEvents: [
                    {
                        id: 7001,
                        start: { numerator: 0, denominator: 16 },
                        duration: { numerator: 1, denominator: 16 },
                        audioData: { id: styleId },
                    },
                ],
            },
        ],
    } as unknown as ISbDmTrack;
};

const makeDataModel = (tracks: ISbDmTrack[]): ScoreBookDataModel => {
    return {
        arrangement: { tracks },
    } as unknown as ScoreBookDataModel;
};

describe.sequential("ArticulationToolbar", () => {
    let renderResult: RenderResult | null;
    let selectionManager: SelectionManager;

    beforeEach(() => {
        renderResult = null;
        selectionManager = new SelectionManager();
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders three articulation buttons", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".articulationButton")).toHaveLength(3);
    });

    it("disables all buttons when no track is selected", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
        });
        const dataModel = makeDataModel([track]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [
            ...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton"),
        ];
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);
    });

    it("marks the accent and enables damping for a surdo-like voice", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const byTooltip = (tooltip: string) => {
            return buttons.find((button) => {
                return button.getAttribute("data-tooltip") === tooltip;
            });
        };

        expect(byTooltip("Accent")!.classList.contains("du-btn-primary")).toBe(true);
        expect(byTooltip("Damped")!.disabled).toBe(false);
        expect(byTooltip("Ghost")!.disabled).toBe(true);
    });

    it("enables ghost but not damping for a tamborim-like voice", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Open, true),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const byTooltip = (tooltip: string) => {
            return buttons.find((button) => {
                return button.getAttribute("data-tooltip") === tooltip;
            });
        };

        expect(byTooltip("Ghost")!.disabled).toBe(false);
        expect(byTooltip("Damped")!.disabled).toBe(true);
    });

    it("marks the articulation of the selected note", () => {
        const noteStyles = {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        };
        const track = makeTrackWithNote(7, 55, noteStyles, "2");
        const dataModel = makeDataModel([track]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, noteId: 7001, startStep: 0 },
        ]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const byTooltip = (tooltip: string) => {
            return buttons.find((button) => {
                return button.getAttribute("data-tooltip") === tooltip;
            });
        };

        expect(byTooltip("Damped")!.classList.contains("du-btn-primary")).toBe(true);
    });

    it("disables the buttons when selected tracks use different instruments", () => {
        const trackA = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
        });
        const trackB = makeTrack(8, 66, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
        });
        const dataModel = makeDataModel([trackA, trackB]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Track, bar: 0, trackId: 7 },
            { granularity: SelectionGranularity.Track, bar: 0, trackId: 8 },
        ]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [
            ...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton"),
        ];
        expect(buttons.every((button) => {
            return button.disabled;
        })).toBe(true);
    });
});
