/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    IArrangementView, INoteView, ISubscribable, ITiming, ITrackView, RealTime
} from "../core/types/general.js";

export interface IEventEngine extends ISubscribable {
    connect(eventSource: IEventSource): void;
    disconnect(eventSource: IEventSource): void;
    play(): Promise<void>;
    stop(): void;
    getTime(): RealTime;
    state: EventEngineState;
}

export type EventEngineState = "stopped" | "playing";

export interface IEventDetails {
    realTime: RealTime;
}

export interface AudioEvent extends IEventDetails {
    audioBuffer: AudioBuffer;
    note: INoteView; // In the future, this could be a more general "source" property
}

export interface ICallbackEvent extends IEventDetails {
    callback(): void;
}

export type MuteFilter = (audioEvent: AudioEvent) => boolean;
export interface IMuteEvent extends IEventDetails {
    muteFilter: MuteFilter;
}

export type Event = ICallbackEvent | AudioEvent | IMuteEvent;

export interface IEventSource {
    getEvents(interval: IInterval): Event[];
    onStop?: () => void;
}

export interface IArrangementPlayer extends IEventSource, ISubscribable {
    arrangement: IArrangementView;
    trackPlayers: Map<ITrackView, ITrackPlayer>;
    get currentTiming(): ITiming | null;
    currentTimingPublisher: ISubscribable;
    convertToLoopProgress(realTime: RealTime): number;
    audibleTrackPlayers: Map<ITrackView, ITrackPlayer>;
    audibleTrackPlayersPublisher: ISubscribable;
    dispose(): void;
}

export interface ITrackPlayer extends IEventSource, ISubscribable {
    track: ITrackView;
    soloMute: SoloMute;
    currentPolyrhythmNotePublisher: ISubscribable;
    readonly currentPolyrhythmNote: INoteView | null;
    dispose(): void;
}

export type SoloMute = null | "solo" | "mute";

export interface IInterval {
    start: RealTime;
    end: RealTime;
}

// Intervals may land beyond the end of a loop, but LoopIntervals must be within the loop
export interface ILoopInterval extends IInterval {
    loopNumber: number;
}

export interface ITimeCoordinator extends ISubscribable {
    readonly realTimeLength: RealTime;
    convertToRealTime(timing: ITiming): RealTime;
    convertToLoopIntervals(interval: IInterval): ILoopInterval[];
    convertToAudioTime(realTime: RealTime, loopNumber: number): RealTime;
    convertToLoopProgress(realTime: RealTime): number; //  distance through loop from 0 to 1
}
