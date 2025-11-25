/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type {
    ArrangementView, Instrument, NoteStyle, NoteView, PolyrhythmView, TimeParamsView, TrackView
} from "./general.js";

/* eslint-disable @typescript-eslint/naming-convention */

export interface EditCommand_ArrangementTitle {
    type: "EditCommand_ArrangementTitle";
    arrangement: ArrangementView;
    newTitle: string;
}

export interface EditCommand_ArrangementAddTrack {
    type: "EditCommand_ArrangementAddTrack";
    arrangement: ArrangementView;
    addTrack: Instrument;
}

export interface EditCommand_ArrangementRemoveTrack {
    type: "EditCommand_ArrangementRemoveTrack";
    arrangement: ArrangementView;
    removeTrack: TrackView;
}

export interface EditCommand_ArrangementClear {
    type: "EditCommand_ArrangementClear";
    arrangement: ArrangementView;
    command: "clear all tracks";
}

export interface EditCommand_ArrangementClearSelection {
    type: "EditCommand_ArrangementClearSelection";
    arrangement: ArrangementView;
    clearSelection: Map<TrackView, { selectedNotes: Set<NoteView>; }>;
}

export interface EditCommand_ArrangementAddPolyrhythms {
    type: "EditCommand_ArrangementAddPolyrhythms";
    arrangement: ArrangementView;
    addPolyrhythms: {
        length: number;
        selection: Map<TrackView, { range: [NoteView | null, NoteView | null]; }>;
    };
}

export interface EditCommand_TrackRemovePolyrhythm {
    type: "EditCommand_TrackRemovePolyrhythm";
    track: TrackView;
    removePolyrhythm: PolyrhythmView;
}

export interface EditCommand_TrackClear {
    type: "EditCommand_TrackClear";
    track: TrackView;
    command: "clear";
}

export interface EditCommand_Note {
    type: "EditCommand_Note";
    note: NoteView;
    noteStyle?: NoteStyle;
}

export interface EditCommand_TimeParamsTimeSignature {
    type: "EditCommand_TimeParamsTimeSignature";
    timeParams: TimeParamsView;
    timeSignature: string;
    pulse: string;
    stepResolution: number;
}

export interface EditCommand_TimeParamsTempo {
    type: "EditCommand_TimeParamsTempo";
    timeParams: TimeParamsView;
    tempo: number;
}

export interface EditCommand_TimeParamsLength {
    type: "EditCommand_TimeParamsLength";
    timeParams: TimeParamsView;
    length: number;
}

// This command is never sent to edit(), but we save it in the first history state
export interface EditCommand_LoadPage {
    type: "EditCommand_LoadPage";
}

export type EditCommand_Arrangement =
    EditCommand_ArrangementTitle
    | EditCommand_ArrangementAddPolyrhythms
    | EditCommand_ArrangementAddTrack
    | EditCommand_ArrangementRemoveTrack
    | EditCommand_ArrangementClear
    | EditCommand_ArrangementClearSelection;

export type EditCommand_Track =
    EditCommand_TrackRemovePolyrhythm
    | EditCommand_TrackClear;

export type EditCommand_TimeParams =
    EditCommand_TimeParamsTimeSignature
    | EditCommand_TimeParamsTempo
    | EditCommand_TimeParamsLength;

export type EditCommand =
    EditCommand_Arrangement
    | EditCommand_Track
    | EditCommand_Note
    | EditCommand_TimeParams
    | EditCommand_LoadPage;
