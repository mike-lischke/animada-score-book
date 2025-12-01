/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type {
    IArrangementView, IInstrument, INoteStyle, INoteView, IPolyrhythmView, ITimeParamsView, ITrackView
} from "./general.js";

/* eslint-disable @typescript-eslint/naming-convention */

export interface EditCommand_ArrangementTitle {
    type: "EditCommand_ArrangementTitle";
    arrangement: IArrangementView;
    newTitle: string;
}

export interface EditCommand_ArrangementAddTrack {
    type: "EditCommand_ArrangementAddTrack";
    arrangement: IArrangementView;
    addTrack: IInstrument;
}

export interface EditCommand_ArrangementRemoveTrack {
    type: "EditCommand_ArrangementRemoveTrack";
    arrangement: IArrangementView;
    removeTrack: ITrackView;
}

export interface EditCommand_ArrangementClear {
    type: "EditCommand_ArrangementClear";
    arrangement: IArrangementView;
    command: "clear all tracks";
}

export interface EditCommand_ArrangementClearSelection {
    type: "EditCommand_ArrangementClearSelection";
    arrangement: IArrangementView;
    clearSelection: Map<ITrackView, { selectedNotes: Set<INoteView>; }>;
}

export interface EditCommand_ArrangementAddPolyrhythms {
    type: "EditCommand_ArrangementAddPolyrhythms";
    arrangement: IArrangementView;
    addPolyrhythms: {
        length: number;
        selection: Map<ITrackView, { range: [INoteView | null, INoteView | null]; }>;
    };
}

export interface EditCommand_TrackRemovePolyrhythm {
    type: "EditCommand_TrackRemovePolyrhythm";
    track: ITrackView;
    removePolyrhythm: IPolyrhythmView;
}

export interface EditCommand_TrackClear {
    type: "EditCommand_TrackClear";
    track: ITrackView;
    command: "clear";
}

export interface EditCommand_Note {
    type: "EditCommand_Note";
    note: INoteView;
    noteStyle?: INoteStyle;
}

export interface EditCommand_TimeParamsTimeSignature {
    type: "EditCommand_TimeParamsTimeSignature";
    timeParams: ITimeParamsView;
    timeSignature: string;
    pulse: string;
    stepResolution: number;
}

export interface EditCommand_TimeParamsTempo {
    type: "EditCommand_TimeParamsTempo";
    timeParams: ITimeParamsView;
    tempo: number;
}

export interface EditCommand_TimeParamsLength {
    type: "EditCommand_TimeParamsLength";
    timeParams: ITimeParamsView;
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
