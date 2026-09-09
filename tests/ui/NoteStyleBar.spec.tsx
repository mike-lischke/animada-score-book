/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteStyleBar } from "../../src/components/ui/Arrangement/NoteStyleBar.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type ISbDmInstrument, type ISbDmTrack, type ScoreBookDataModel,
} from "../../src/core/ScoreBookDataModel.js";
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
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            stickTechnique: StickTechnique.Normal,
            mainDisplayType: NoteDisplayType.Oval,
        },
        sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: false },
    } as unknown as IAudioData;
};

const makeNoteStyleWithHead = (
    id: string,
    shortDescription: string,
    description: string,
    displayType: NoteDisplayType,
    noteLine?: number,
): IAudioData => {
    return {
        id,
        symbol: { shortDescription, description },
        audioBuffer: null,
        instrument: {} as ISbDmInstrument,
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            stickTechnique: StickTechnique.Normal,
            mainDisplayType: displayType,
        },
        noteLine,
        sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: false },
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

    it("disables the note style buttons when no track is selected", () => {
        const track = makeTrack(7, { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") });
        const dataModel = makeDataModel([track]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} />,
        );

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteStyleButton")];
        expect(buttons).toHaveLength(1);
        expect(buttons[0].disabled).toBe(true);
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

    it("uses grid symbols in grid mode and note heads in staff mode", () => {
        const track = makeTrack(7, { "1": makeNoteStyle("1", "Accent", "Tamborim Accent") });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="grid" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton .note-style-symbol")).toHaveLength(1);
        expect(renderResult.container.querySelectorAll(".noteStyleButton .note-style-icon")).toHaveLength(0);

        renderResult.rerender(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton .note-style-symbol")).toHaveLength(0);
        expect(renderResult.container.querySelectorAll(".noteStyleButton .note-style-icon")).toHaveLength(1);
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

    it("disables the note style buttons when selected tracks use different instruments", () => {
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

        const buttons = [...renderResult.container.querySelectorAll<HTMLButtonElement>(".noteStyleButton")];
        expect(buttons).toHaveLength(1);
        expect(buttons[0].disabled).toBe(true);
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

    it("groups styles with the same note head into a dropdown in staff mode", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyleWithHead("1", "Low", "Low Agogo Bell", NoteDisplayType.Oval, 2),
            "2": makeNoteStyleWithHead("2", "High", "High Agogo Bell", NoteDisplayType.Oval, 1),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleDropdown")).toHaveLength(1);
        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(0);

        // The dropdown button shows only the shared note head, without staff lines.
        const button = renderResult.container.querySelector(".noteStyleDropdown .du-btn-ghost")!;
        expect(button.querySelectorAll(".note-style-icon")).toHaveLength(1);
        expect(button.querySelectorAll(".note-style-line-icon")).toHaveLength(0);

        // Each menu entry places its note head on the style's note line.
        const itemIcons = renderResult.container.querySelectorAll(".dropdown-popup .note-style-line-icon");
        expect(itemIcons).toHaveLength(2);
        expect(itemIcons[0].querySelectorAll(".note-style-line-icon-line")).toHaveLength(2);

        // Line spacing is 7px, centered in the 24px icon: lines at 8.5 and 15.5.
        expect(itemIcons[0].querySelector<HTMLElement>(".note-style-line-icon-head")!.style.top).toBe("15.5px");
        expect(itemIcons[1].querySelector<HTMLElement>(".note-style-line-icon-head")!.style.top).toBe("8.5px");
        expect(itemIcons[0].querySelectorAll(".note-style-line-icon-note-image")).toHaveLength(1);
    });

    it("keeps distinct note heads as separate buttons in staff mode", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyleWithHead("1", "Center", "Repinique Center", NoteDisplayType.Oval),
            "2": makeNoteStyleWithHead("2", "Rim", "Repinique Rim", NoteDisplayType.Cross),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleDropdown")).toHaveLength(0);
        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(2);
    });

    it("renders one dropdown entry per grouped style", () => {
        const track = makeTrack(7, {
            "1": makeNoteStyleWithHead("1", "Low", "Low Agogo Bell", NoteDisplayType.Oval, 2),
            "2": makeNoteStyleWithHead("2", "High", "High Agogo Bell", NoteDisplayType.Oval, 1),
        });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        const items = [
            ...renderResult.container.querySelectorAll(".noteStyleDropdown .dropdown-popup li"),
        ];
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain("Low Agogo Bell (1)");
        expect(items[1].textContent).toContain("High Agogo Bell (2)");
    });

    it("collapses a ghost variant into one button in staff mode", () => {
        const plain = makeNoteStyleWithHead("1", "Chocalho", "Chocalho", NoteDisplayType.Triangle);
        const ghost = {
            ...makeNoteStyleWithHead("2", "Ghost", "Chocalho Ghost Note", NoteDisplayType.Triangle),
            sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: true },
        } as IAudioData;
        const track = makeTrack(7, { "1": plain, "2": ghost });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleDropdown")).toHaveLength(0);

        const buttons = renderResult.container.querySelectorAll(".noteStyleButton");
        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute("data-tooltip")).toBe("Chocalho (1)");
    });

    it("collapses a muted variant into one button in staff mode", () => {
        const open = makeNoteStyleWithHead("1", "Center", "Center", NoteDisplayType.Oval);
        const muted = {
            ...makeNoteStyleWithHead("2", "Muted", "Muted", NoteDisplayType.Oval),
            sampleProfile: { builtInDamping: Damping.Muted, builtInAccent: false, ghost: false },
        } as IAudioData;
        const track = makeTrack(7, { "1": open, "2": muted });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleDropdown")).toHaveLength(0);

        const buttons = renderResult.container.querySelectorAll(".noteStyleButton");
        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute("data-tooltip")).toBe("Center (1)");
    });

    it("marks the collapsed button when a selected note uses an articulation variant", () => {
        const plain = makeNoteStyleWithHead("1", "Chocalho", "Chocalho", NoteDisplayType.Triangle);
        const ghost = {
            ...makeNoteStyleWithHead("2", "Ghost", "Chocalho Ghost Note", NoteDisplayType.Triangle),
            sampleProfile: { builtInDamping: Damping.Open, builtInAccent: false, ghost: true },
        } as IAudioData;
        const track = makeTrackWithNote(7, 55, { "1": plain, "2": ghost }, 7001, "2");
        const dataModel = makeDataModel([track]);

        selectionManager.replaceSelection([
            { granularity: SelectionGranularity.Note, bar: 1, trackId: 7, noteId: 7001, startStep: 0 },
        ]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton.du-btn-primary")).toHaveLength(1);
    });

    it("groups non-ghost styles with the same head into a dropdown", () => {
        const center = {
            ...makeNoteStyleWithHead("1", "Center", "Center", NoteDisplayType.Oval),
            sampleProfile: { builtInDamping: Damping.Open, builtInAccent: true, ghost: false },
        } as IAudioData;
        const outerArea = makeNoteStyleWithHead("2", "Outer Area", "Outer Area", NoteDisplayType.Oval);
        const track = makeTrack(7, { "1": center, "2": outerArea });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        expect(renderResult.container.querySelectorAll(".noteStyleButton")).toHaveLength(0);
        expect(renderResult.container.querySelectorAll(".noteStyleDropdown")).toHaveLength(1);

        const items = renderResult.container.querySelectorAll(".noteStyleDropdown .dropdown-popup li");
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain("Center (1)");
        expect(items[1].textContent).toContain("Outer Area (2)");
    });

    it("renders press roll without a head and rimshot as one scalable composition", () => {
        const pressRoll = {
            ...makeNoteStyleWithHead("1", "Buzz", "Buzz", NoteDisplayType.Oval),
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.PressRoll,
                mainDisplayType: NoteDisplayType.Oval,
            },
        } as IAudioData;
        const rimshot = {
            ...makeNoteStyleWithHead("2", "Rimshot", "Rimshot", NoteDisplayType.Oval),
            characteristics: {
                excitationMode: ExcitationMode.Struck,
                stickTechnique: StickTechnique.RimShot,
                mainDisplayType: NoteDisplayType.Oval,
            },
        } as IAudioData;
        const track = makeTrack(7, { "1": pressRoll, "2": rimshot });
        const dataModel = makeDataModel([track]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        const pressRollIcon = renderResult.container.querySelector(".note-style-icon.press-roll")!;
        expect(pressRollIcon.querySelectorAll(".note-style-icon-head")).toHaveLength(0);
        expect(pressRollIcon.querySelectorAll(".note-style-icon-press-roll line")).toHaveLength(3);

        const rimshotIcon = renderResult.container.querySelector(".note-style-icon.rimshot")!;
        expect(rimshotIcon.querySelectorAll(".note-style-icon-head.oval")).toHaveLength(1);
        expect(rimshotIcon.querySelectorAll(".note-style-icon-rimshot-cross")).toHaveLength(1);
    });

    it("renders icons for every additional hand technique", () => {
        const techniques = [
            { technique: HandTechnique.Thumb, className: "note-style-icon-thumb-svg" },
            { technique: HandTechnique.Fingers, className: "note-style-icon-fingers-svg" },
            { technique: HandTechnique.Heel, className: "note-style-icon-heel-circle" },
            { technique: HandTechnique.Open, className: "note-style-icon-open-circle" },
            { technique: HandTechnique.Friction, className: "note-style-icon-friction-svg" },
        ];
        const noteStyles = Object.fromEntries(techniques.map(({ technique }, index) => {
            const id = `${index + 1}`;
            const noteStyle = {
                ...makeNoteStyleWithHead(id, id, id, NoteDisplayType.Square),
                characteristics: {
                    excitationMode: ExcitationMode.Struck,
                    handTechnique: technique,
                    mainDisplayType: NoteDisplayType.Square,
                },
            } as IAudioData;

            return [id, noteStyle];
        }));
        const dataModel = makeDataModel([makeTrack(7, noteStyles)]);
        selectionManager.selectTracks([7]);

        renderResult = render(
            <NoteStyleBar dataModel={dataModel} selectionManager={selectionManager} trackViewMode="staff" />,
        );

        techniques.forEach(({ className }) => {
            expect(renderResult!.container.querySelector(`.${className}`)).not.toBeNull();
        });
    });
});
