/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    IAnimadaScoreBook, IArrangementView, INoteView, ISubscribable, ITiming, ITrackView, RealTime
} from "../core/types/general.js";

export interface ScoreBookPlayer {
    scoreBook: IAnimadaScoreBook;
    eventEngine: EventEngine;
    arrangementPlayer: ArrangementPlayer;
}

export interface EventEngine extends ISubscribable {
    connect(eventSource: IEventSource): void;
    play(): Promise<void>;
    stop(): void;
    getTime(): RealTime;
    state: EventEngineState;
}

export type EventEngineState = "stopped" | "playing";

export interface EventDetails {
    realTime: RealTime;
}

export interface AudioEvent extends EventDetails {
    audioBuffer: AudioBuffer;
    note: INoteView; // In the future, this could be a more general "source" property
}

export interface CallbackEvent extends EventDetails {
    callback(): void;
}

export type MuteFilter = (audioEvent: AudioEvent) => boolean;
export interface MuteEvent extends EventDetails {
    muteFilter: MuteFilter;
}

export type Event = CallbackEvent | AudioEvent | MuteEvent;

export interface IEventSource {
    getEvents(interval: Interval): Event[];
    onStop?: () => void;
}

export interface ArrangementPlayer extends IEventSource, ISubscribable {
    arrangement: IArrangementView;
    trackPlayers: Map<ITrackView, TrackPlayer>;
    get currentTiming(): ITiming | null;
    currentTimingPublisher: ISubscribable;
    convertToLoopProgress(realTime: RealTime): number;
    audibleTrackPlayers: Map<ITrackView, TrackPlayer>;
    audibleTrackPlayersPublisher: ISubscribable;
}

export interface TrackPlayer extends IEventSource, ISubscribable {
    track: ITrackView;
    soloMute: SoloMute;
    currentPolyrhythmNotePublisher: ISubscribable;
    readonly currentPolyrhythmNote: INoteView | null;
}

export type SoloMute = null | "solo" | "mute";

export interface Interval {
    start: RealTime;
    end: RealTime;
}

// Intervals may land beyond the end of a loop, but LoopIntervals must be within the loop
export interface LoopInterval extends Interval {
    loopNumber: number;
}

export interface TimeCoordinator extends ISubscribable {
    readonly realTimeLength: RealTime;
    convertToRealTime(timing: ITiming): RealTime;
    convertToLoopIntervals(interval: Interval): LoopInterval[];
    convertToAudioTime(realTime: RealTime, loopNumber: number): RealTime;
    convertToLoopProgress(realTime: RealTime): number; //  distance through loop from 0 to 1
}
