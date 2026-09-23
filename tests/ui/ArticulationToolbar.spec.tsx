/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArticulationToolbar } from "../../src/components/ui/Arrangement/ArticulationToolbar.js";
import { Articulation } from "../../src/core/articulation.js";
import { AppStorage } from "../../src/core/AppStorage.js";
import {
    Damping, ExcitationMode, NoteDisplayType, StickTechnique,
    type ISbDmArrangement, type ISbDmTrack, type ISbDmTrackMeasure, type ScoreBookDataModel,
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { EditEntryMode } from "../../src/core/types/general.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { noteEntry, trackEntry } from "../unit-test-helpers.js";

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
        measures: [],
    } as unknown as ISbDmTrack;
};

const makeTrackWithNote = (
    id: number,
    instrumentId: number,
    noteStyles: Record<string, IAudioData>,
    styleId: string,
): ISbDmTrack => {
    const arrangement = { tracks: [] } as unknown as ISbDmArrangement;
    const track = {
        id,
        instrument: { id: instrumentId, noteStyles },
        measures: [],
        arrangement,
    } as unknown as ISbDmTrack;
    const measure = {
        number: 1,
        meter: { stepResolution: 16 },
        subdivisions: [],
        track,
        events: [{
            start: { numerator: 0, denominator: 16 },
            duration: { numerator: 1, denominator: 16 },
            noteStyleId: styleId,
        }],
        noteEvents: [
            {
                id: 7001,
                start: { numerator: 0, denominator: 16 },
                duration: { numerator: 1, denominator: 16 },
                audioData: { id: styleId },
            },
        ],
    } as unknown as ISbDmTrackMeasure;

    track.measures.push(measure);
    arrangement.tracks.push(track);

    return track;
};

/** The tracks the stub model holds; a test fills them in through {@link makeDataModel}. */
const modelTracks: ISbDmTrack[] = [];

/** The stub model the selection manager is bound to; {@link makeDataModel} keeps it in sync. */
const modelStub = { arrangement: { tracks: modelTracks } } as unknown as ScoreBookDataModel;

/**
 * Creates the model a toolbar renders.
 *
 * @param tracks The tracks of the model.
 *
 * @returns The model to render.
 */
const makeDataModel = (tracks: ISbDmTrack[]): ScoreBookDataModel => {
    modelTracks.splice(0, modelTracks.length, ...tracks);

    return modelStub;
};

describe.sequential("ArticulationToolbar", () => {
    let renderResult: RenderResult | null;
    let selectionManager: SelectionManager;

    beforeEach(() => {
        renderResult = null;

        // The manager resolves selected tracks against the model it is bound to.
        selectionManager = new SelectionManager(modelStub);
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("keeps the chosen articulation in insert mode", async () => {
        const track = makeTrackWithNote(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        }, "1");
        const dataModel = makeDataModel([track]);

        selectionManager.replaceSelection([noteEntry(track.measures[0], { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <ArticulationToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        // The selection is only the insertion point, so its accent is not marked.
        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        expect(renderResult.container.querySelectorAll(".articulationButton.du-btn-primary")).toHaveLength(0);

        fireEvent.click(buttons[1]);
        expect(buttons[1].classList.contains("du-btn-primary")).toBe(true);

        // A selection that carries no articulation of its own does not drop the chosen one.
        await act(() => {
            selectionManager.clearSelection();
            selectionManager.selectTracks([7]);
        });

        expect(buttons[1].classList.contains("du-btn-primary")).toBe(true);
    });

    it("marks the articulation of the selection when the view switches to overwrite", async () => {
        const track = makeTrackWithNote(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        }, "1");
        const dataModel = makeDataModel([track]);

        selectionManager.replaceSelection([noteEntry(track.measures[0], { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <ArticulationToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        // Insert mode marks what the next entry uses, not what the cursor addresses.
        expect(renderResult.container.querySelectorAll(".articulationButton.du-btn-primary")).toHaveLength(0);

        await act(() => {
            renderResult!.rerender(
                <ArticulationToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={EditEntryMode.Overwrite}
                />,
            );
        });

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const accent = buttons.find((button) => {
            return button.getAttribute("data-tooltip") === "Accent";
        });

        expect(accent?.classList.contains("du-btn-primary")).toBe(true);
    });

    it("restores the stored articulation when the view returns to insert mode", async () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({ entryArticulation: Articulation.Ghost });

        const track = makeTrackWithNote(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Open, true),
        }, "1");
        const dataModel = makeDataModel([track]);

        selectionManager.replaceSelection([noteEntry(track.measures[0], { numerator: 0, denominator: 16 })]);

        renderResult = render(
            <ArticulationToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Overwrite}
            />,
        );

        const marked = () => {
            return renderResult!.container.querySelector(".articulationButton.du-btn-primary")
                ?.getAttribute("data-tooltip");
        };

        // The selection carries an accent, which the overwrite mode marks.
        expect(marked()).toBe("Accent");

        await act(() => {
            renderResult!.rerender(
                <ArticulationToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={EditEntryMode.Insert}
                />,
            );
        });

        expect(marked()).toBe("Ghost");
    });

    it("restores the stored articulation and stores a new choice", () => {
        vi.spyOn(AppStorage, "loadUISettings").mockReturnValue({ entryArticulation: Articulation.Ghost });
        const saveSpy = vi.spyOn(AppStorage, "saveSetting").mockImplementation(() => {
            // Keep the test out of localStorage.
        });

        const track = makeTrack(7, 55, { "1": makeNoteStyle("1", true, Damping.Open, false) });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <ArticulationToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        expect(buttons[2].classList.contains("du-btn-primary")).toBe(true);

        fireEvent.click(buttons[0]);

        expect(saveSpy).toHaveBeenCalledWith("entryArticulation", Articulation.Accent);
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

    it("keeps the articulations usable in insert mode without a selection", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        });
        const dataModel = makeDataModel([track]);

        renderResult = render(
            <ArticulationToolbar
                dataModel={dataModel}
                selectionManager={selectionManager}
                entryMode={EditEntryMode.Insert}
            />,
        );

        // The choice only configures the next entry, so it shows the last known instrument's variants.
        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const byTooltip = (tooltip: string) => {
            return buttons.find((button) => {
                return button.getAttribute("data-tooltip") === tooltip;
            });
        };

        expect(byTooltip("Accent")!.disabled).toBe(false);
        expect(byTooltip("Damped")!.disabled).toBe(false);
        expect(byTooltip("Ghost")!.disabled).toBe(true);
    });

    it("marks the accent and enables damping for a surdo-like voice", () => {
        const track = makeTrackWithNote(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Muted, false),
        }, "1");
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

    it("marks no articulation when a whole track mixes accented and plain notes", () => {
        const track = makeTrack(7, 55, {
            "1": makeNoteStyle("1", true, Damping.Open, false),
            "2": makeNoteStyle("2", false, Damping.Open, false),
        });
        const events = [0, 1].map((index) => {
            return {
                start: { numerator: index, denominator: 16 },
                duration: { numerator: 1, denominator: 16 },
                noteStyleId: index === 0 ? "1" : "2",
            };
        });
        const measure = {
            number: 1,
            meter: { stepResolution: 16 },
            subdivisions: [],
            track,
            events,
            noteEvents: events.map((event, index) => {
                return {
                    id: 9001 + index,
                    start: event.start,
                    duration: event.duration,
                    audioData: { id: event.noteStyleId },
                };
            }),
        } as unknown as ISbDmTrackMeasure;
        track.measures.push(measure);

        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <ArticulationToolbar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".articulationButton")];
        const marked = buttons.filter((button) => {
            return button.classList.contains("du-btn-primary");
        });

        // Half of the track is accented, so no articulation is the shared state and none is marked.
        expect(marked).toHaveLength(0);
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

        selectionManager.replaceSelection([noteEntry(track.measures[0], { numerator: 0, denominator: 1 })]);

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

        selectionManager.replaceSelection([trackEntry(trackA), trackEntry(trackB)]);

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
