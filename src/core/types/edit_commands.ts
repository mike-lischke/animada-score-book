/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmInstrument, ISbDmNote, ISbDmTrack } from "../ScoreBookDataModel.js";
import type { IArrangement, INoteStyle, IPolyrhythm, ITimeParamsView } from "./general.js";

/* eslint-disable @typescript-eslint/naming-convention */

export interface EditCommand_ArrangementTitle {
    type: "EditCommand_ArrangementTitle";
    arrangement: Readonly<IArrangement>;
    newTitle: string;
}

export interface EditCommand_ArrangementAddTrack {
    type: "EditCommand_ArrangementAddTrack";
    arrangement: Readonly<IArrangement>;
    addTrack: ISbDmInstrument;
}

export interface EditCommand_ArrangementRemoveTrack {
    type: "EditCommand_ArrangementRemoveTrack";
    arrangement: Readonly<IArrangement>;
    removeTrack: ISbDmTrack;
}

export interface EditCommand_ArrangementClear {
    type: "EditCommand_ArrangementClear";
    arrangement: Readonly<IArrangement>;
    command: "clear all tracks";
}

export interface EditCommand_ArrangementClearSelection {
    type: "EditCommand_ArrangementClearSelection";
    arrangement: Readonly<IArrangement>;
    clearSelection: Map<ISbDmTrack, { selectedNotes: Set<ISbDmNote>; }>;
}

export interface EditCommand_ArrangementAddPolyrhythms {
    type: "EditCommand_ArrangementAddPolyrhythms";
    arrangement: Readonly<IArrangement>;
    addPolyrhythms: {
        length: number;
        selection: Map<ISbDmTrack, { range: [ISbDmNote | null, ISbDmNote | null]; }>;
    };
}

export interface EditCommand_TrackRemovePolyrhythm {
    type: "EditCommand_TrackRemovePolyrhythm";
    track: ISbDmTrack;
    removePolyrhythm: IPolyrhythm;
}

export interface EditCommand_TrackClear {
    type: "EditCommand_TrackClear";
    track: ISbDmTrack;
    command: "clear";
}

export interface EditCommand_Note {
    type: "EditCommand_Note";
    note: ISbDmNote;
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
