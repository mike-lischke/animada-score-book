/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmInstrument, ISbDmNote, ISbDmTrack, ITiming } from "../ScoreBookDataModel.js";

export interface IInstrumentMeta {
    id: number;
    typeId: string;
    displayOrder: number;
    displayName: string;
    icon: string;
    color: string;
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
    instrument: ISbDmInstrument;
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
    subscribe: (callback: Subscription) => () => void;
    unsubscribe: (callback: Subscription) => void;
}

export interface IPublisher extends ISubscribable {
    publish(): void;
}

export interface IArrangement extends ISubscribable {
    title: string;
    timeParams: ITimeParams;
    tracks: ISbDmTrack[];
    addTrack(instrument: ISbDmInstrument, id?: number): ISbDmTrack;
    removeTrack(track: ISbDmTrack): void;
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

export interface IPolyrhythm {
    id: number;
    start: ISbDmNote;
    end: ISbDmNote;
    notes: ISbDmNote[];
}

/** Make all entries in type T mutable. */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
};

declare global {
    /** Holds the dev server base URL. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    var BASE_URL: string;
}
