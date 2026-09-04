/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteStyleBar } from "../../src/components/ui/Arrangement/NoteStyleBar.js";
import type { ISbDmInstrument, ISbDmTrack, ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { SelectionGranularity } from "../../src/ui/selection-types.js";

const makeNoteStyle = (id: string, shortDescription: string, description: string): IAudioData => {
    return {
        id,
        symbol: { shortDescription, description },
        audioBuffer: null,
        instrument: {} as ISbDmInstrument,
    } as unknown as IAudioData;
};

const makeTrack = (id: number, noteStyles: Record<string, IAudioData>): ISbDmTrack => {
    return {
        id,
        instrument: { noteStyles },
    } as unknown as ISbDmTrack;
};

const makeTrackWithNote = (
    id: number,
    instrumentId: number,
    noteStyles: Record<string, IAudioData>,
    noteEventId: number,
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
                        id: noteEventId,
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

describe.sequential("NoteStyleBar", () => {
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

    it("matches snapshot with minimal props", () => {
        const dataModel = makeDataModel([makeTrack(7, {})]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const html = renderResult.container.innerHTML.replace(/gooey-\d+/g, "gooey-ID");
        expect(html).toMatchSnapshot();
    });

    it("matches snapshot with all props set", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar
                dataModel={dataModel}
                selectionManager={selectionManager}
                className="custom-note-style-bar"
                id="note-style-bar"
                style={{ gap: 16 }}
                tabIndex={0}
                title="Note styles"
                data-tooltip="Available note styles"
            />,
        );

        const html = renderResult.container.innerHTML.replace(/gooey-\d+/g, "gooey-ID");
        expect(html).toMatchSnapshot();
    });

    it("renders no buttons when no track is selected", () => {
        const track = makeTrack(7, { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") });
        const dataModel = makeDataModel([track]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(0);
    });

    it("renders a button per note style of the selected track", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(2);
    });

    it("uses the long description in the button tooltip", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteStyleButton");
        expect(buttons[0].getAttribute("data-tooltip")).toBe("Tamborim Accent (1)");
        expect(buttons[1].getAttribute("data-tooltip")).toBe("Tamborim Ghost Note (2)");
    });

    it("requests a note entry when a button is clicked", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        const received: string[] = [];
        const handler = (noteStyleId: string): Promise<boolean> => {
            received.push(noteStyleId);

            return Promise.resolve(true);
        };

        requisitions.register("noteEntryRequested", handler);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = renderResult.container.querySelectorAll(".noteStyleButton");
        fireEvent.click(buttons[1]);

        expect(received).toEqual(["2"]);

        requisitions.unregister("noteEntryRequested", handler);
    });

    it("updates the buttons when the selection changes", async () => {
        const accentTrack = makeTrack(7, { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") });
        const bassTrack = makeTrack(8, { "1": makeNoteStyle("1", "Bass", "Timbau Bass") });
        const dataModel = makeDataModel([accentTrack, bassTrack]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const initialButtons = renderResult.container.querySelectorAll(".noteStyleButton");
        expect(initialButtons).toHaveLength(1);
        expect(initialButtons[0].getAttribute("data-tooltip")).toBe("Tamborim Accent (1)");

        await act(() => {
            selectionManager.clearSelection();
            selectionManager.selectTracks([8]);
        });

        const updatedButtons = renderResult.container.querySelectorAll(".noteStyleButton");
        expect(updatedButtons).toHaveLength(1);
        expect(updatedButtons[0].getAttribute("data-tooltip")).toBe("Timbau Bass (1)");
    });

    it("marks the shared note style across multiple tracks with the same instrument", () => {
        const noteStyles = {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        };
        const trackA = makeTrackWithNote(7, 55, noteStyles, 7001, "1");
        const trackB = makeTrackWithNote(8, 55, noteStyles, 8001, "1");
        const dataModel = makeDataModel([trackA, trackB]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, noteId: 7001, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 8, noteId: 8001, startStep: 0 },
        ]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const markedButtons = renderResult.container.querySelectorAll(".noteStyleButton.du-btn-primary");
        expect(markedButtons).toHaveLength(1);
        expect(markedButtons[0].getAttribute("data-tooltip")).toBe("Tamborim Accent (1)");
    });

    it("marks no note style when notes across tracks differ", () => {
        const noteStyles = {
            "1": makeNoteStyle("1", "Accent", "Tamborim Accent"),
            "2": makeNoteStyle("2", "Ghost", "Tamborim Ghost Note"),
        };
        const trackA = makeTrackWithNote(7, 55, noteStyles, 7001, "1");
        const trackB = makeTrackWithNote(8, 55, noteStyles, 8001, "2");
        const dataModel = makeDataModel([trackA, trackB]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, noteId: 7001, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 8, noteId: 8001, startStep: 0 },
        ]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton.du-btn-primary")).toHaveLength(0);
    });

    it("shows no note styles when selected tracks use different instruments", () => {
        const trackA = makeTrackWithNote(
            7, 55, { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") }, 7001, "1",
        );
        const trackB = makeTrackWithNote(
            8, 66, { "1": makeNoteStyle("1", "Bass", "Timbau Bass") }, 8001, "1",
        );
        const dataModel = makeDataModel([trackA, trackB]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, noteId: 7001, startStep: 0 },
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 8, noteId: 8001, startStep: 0 },
        ]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(0);
        expect(renderResult.container.querySelectorAll(".noteStyleLabel")).toHaveLength(0);
    });

    it("marks no note style when the cursor sits inside a note's duration", () => {
        const noteStyles = { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") };
        const track = {
            id: 7,
            instrument: { id: 55, noteStyles },
            measures: [
                {
                    number: 1,
                    meter: { stepResolution: 16 },
                    noteEvents: [
                        {
                            id: 7001,
                            start: { numerator: 0, denominator: 16 },
                            duration: { numerator: 4, denominator: 16 },
                            audioData: { id: "1" },
                        },
                    ],
                },
            ],
        } as unknown as ISbDmTrack;
        const dataModel = makeDataModel([track]);

        // Step 1 is inside the note's duration but is not the note's start cell.
        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, startStep: 1 },
        ]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton.du-btn-primary")).toHaveLength(0);
    });
});
