/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmArrangement, ISbDmInstrument, ISbDmNoteEvent, ISbDmTrack } from "../ScoreBookDataModel.js";
import type { INoteStyle, ITimeParams } from "./general.js";

/* eslint-disable @typescript-eslint/naming-convention */

export interface EditCommand_ArrangementTitle {
    type: "EditCommand_ArrangementTitle";
    arrangement: Readonly<ISbDmArrangement>;
    newTitle: string;
}

export interface EditCommand_ArrangementAddTrack {
    type: "EditCommand_ArrangementAddTrack";
    arrangement: Readonly<ISbDmArrangement>;
    addTrack: ISbDmInstrument;
}

export interface EditCommand_ArrangementRemoveTrack {
    type: "EditCommand_ArrangementRemoveTrack";
    arrangement: Readonly<ISbDmArrangement>;
    removeTrack: ISbDmTrack;
}

export interface EditCommand_ArrangementClear {
    type: "EditCommand_ArrangementClear";
    arrangement: Readonly<ISbDmArrangement>;
    command: "clear all tracks";
}

export interface EditCommand_ArrangementClearSelection {
    type: "EditCommand_ArrangementClearSelection";
    arrangement: Readonly<ISbDmArrangement>;
    clearSelection: Map<ISbDmTrack, { selectedNotes: Set<ISbDmNoteEvent>; }>;
}

export interface EditCommand_ArrangementAddPolyrhythms {
    type: "EditCommand_ArrangementAddPolyrhythms";
    arrangement: Readonly<ISbDmArrangement>;
    addPolyrhythms: {
        length: number;
        selection: Map<ISbDmTrack, {
            selectedNotes: Set<ISbDmNoteEvent>;
            range: [ISbDmNoteEvent | undefined, ISbDmNoteEvent | undefined];
        }>;
    };
}

export interface EditCommand_TrackClear {
    type: "EditCommand_TrackClear";
    track: ISbDmTrack;
    command: "clear";
}

export interface EditCommand_Note {
    type: "EditCommand_Note";
    note: ISbDmNoteEvent;
    noteStyle?: INoteStyle;
}

export interface EditCommand_TimeParamsTimeSignature {
    type: "EditCommand_TimeParamsTimeSignature";
    timeParams: Readonly<ITimeParams>;
    timeSignature: string;
    pulse: string;
    stepResolution: number;
}

export interface EditCommand_TimeParamsTempo {
    type: "EditCommand_TimeParamsTempo";
    timeParams: Readonly<ITimeParams>;
    tempo: number;
}

export interface EditCommand_TimeParamsLength {
    type: "EditCommand_TimeParamsLength";
    timeParams: Readonly<ITimeParams>;
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
