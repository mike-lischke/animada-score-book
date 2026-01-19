/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { EditCommand } from "./edit_commands.js";
import type { IArrangementSnapshot } from "./snapshots.js";

export interface IAnimadaScoreBook {
    library: ILibrary;
    arrangement: IArrangementView;
    currentState: IArrangementSnapshot;
    canUndo: boolean;
    canRedo: boolean;
    edit(command: EditCommand): void;
    undo: () => void;
    redo: () => void;
    topics: {
        canUndo: ISubscribable;
        canRedo: ISubscribable;
        currentState: ISubscribable;
    };
}

export interface ILibrary {
    load(instrumentCollection: IPackedInstrument[]): void;
    instrumentMetas: IInstrumentMeta[];
    getInstrument(id: string): IInstrument;
}

export interface IInstrumentMeta {
    id: string; // single digit or char, 0 is allowed
    displayOrder: number;
    displayName: string;
    icon: string;
    colourGroup: string; // blue, purple, green, orange, or yellow
    noteStyles?: Record<string, INoteStyleBase>;
}

export interface IPackedInstrument extends IInstrumentMeta {
    packedNoteStyles: IPackedNoteStyle[];
}

export interface IInstrument extends IInstrumentMeta, ISubscribable {
    readonly loaded: boolean;
    noteStyles: Record<string, INoteStyle>;
}

export interface INoteStyleBase {
    id: string; // single digit or char, can't be 0
    symbol?: INoteStyleSymbol;
    muting?: MutingRule | MutingRule[];
}

export interface IPackedNoteStyle extends INoteStyleBase {
    file: string;
}

export interface INoteStyle extends INoteStyleBase {
    audioBuffer: AudioBuffer | null; // null while the instrument is loading
    instrument: IInstrument;
}

export interface INoteStyleSymbol {
    src?: string; // path to use an img src
    string: string; // string to display for this note-style
}

export type MutingRule = MutingRuleSimple | IMutingRuleOtherInstrument;

export interface IMutingRuleOtherInstrument {
    name: "otherInstrument";
    id: string;
}

export type MutingRuleSimple = string;

export type Subscription = (...args: unknown[]) => void;

export interface ISubscribable {
    subscribe: (callback: Subscription) => void;
    unsubscribe: (callback: Subscription) => void;
}

export interface IPublisher extends ISubscribable {
    publish(): void;
}

export interface IArrangementView extends ISubscribable {
    readonly title: string;
    timeParams: ITimeParamsView;
    tracks: ITrackView[];
}

export interface IArrangement extends IArrangementView {
    title: string;
    timeParams: ITimeParams;
    tracks: ITrack[];
    addTrack(instrument: IInstrument, id?: number): ITrack;
    removeTrack(track: ITrack): void;
}

export interface ITimeParamsView extends ISubscribable {
    readonly timeSignature: string;
    readonly tempo: number;
    readonly length: number;
    readonly pulse: string;
    readonly stepResolution: number;
    isValid(timing: ITiming): boolean;
    readonly timings: ITiming[];

}

export interface ITimeParams extends ITimeParamsView {
    timeSignature: string;
    tempo: number;
    length: number;
    pulse: string;
    stepResolution: number;
}

// steps are currently always sixteenths
// When we bring in polyrhythms that will change
// It may also change for other time signatures but I'm not sure yet
export interface ITiming { readonly bar: number, readonly step: number; };

export type RealTime = number;

export interface ITrackView extends ISubscribable {
    id: number;
    arrangement: IArrangementView;
    instrument: IInstrument;
    notes: INoteView[]; // Must be kept in order - this is Track's job
    polyrhythms: IPolyrhythmView[];
    getNoteAt(timing: ITiming): INoteView | undefined;
    getNoteIterator(polyrhythmsToIgnore?: IPolyrhythmView[]): IterableIterator<INoteView>;
}

export interface ITrack extends ITrackView {
    arrangement: IArrangement;
    notes: INote[];
    polyrhythms: IPolyrhythm[];
    getNoteAt(timing: ITiming): INote | undefined;
    getNoteIterator(polyrhythmsToIgnore?: IPolyrhythmView[]): IterableIterator<INote>;
    addPolyrhythm(start: INote, end: INote, length: number, id?: number, index?: number): void;
    removePolyrhythm(polyrhythm: IPolyrhythmView): void;
    clear(): void;
}

export interface IPolyrhythmView {
    id: number;
    start: INoteView;
    end: INoteView;
    notes: INoteView[];
}

export interface IPolyrhythm extends IPolyrhythmView {
    start: INote;
    end: INote;
    notes: INote[];
}

export interface INoteView extends ISubscribable {
    id: string;
    timing: ITiming;
    track: ITrackView;
    polyrhythm?: IPolyrhythmView;
    readonly noteStyle?: INoteStyle; // undefined means this is a rest
}

export interface INote extends INoteView {
    readonly track: ITrack;
    polyrhythm?: IPolyrhythm;
    noteStyle?: INoteStyle; // undefined means this is a rest
}

declare global {
    /** Holds the dev server base URL. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    var BASE_URL: string;
}
