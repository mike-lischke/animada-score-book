/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNote, RealTime } from "../core/ScoreBookDataModel.js";
import type { ModeManager } from "../ui/ModeManager.js";
import type { SelectionManager } from "../ui/SelectionManager.js";

export type EventEngineState = "stopped" | "playing";

export interface IEventDetails {
    realTime: RealTime;
}

export interface IAudioEvent extends IEventDetails {
    audioBuffer: AudioBuffer;
    note: ISbDmNote; // In the future, this could be a more general "source" property
}

export interface ICallbackEvent extends IEventDetails {
    callback(): void;
}

export type MuteFilter = (audioEvent: IAudioEvent) => boolean;
export interface IMuteEvent extends IEventDetails {
    muteFilter: MuteFilter;
}

export type Event = ICallbackEvent | IAudioEvent | IMuteEvent;

export interface IEventSource {
    getEvents(interval: IInterval): Event[];
    onStop?: () => void;
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

/** Stuff which is created once for the entire lifetime of the app. */
export interface ScoreBookUiServices {
    selectionManager: SelectionManager;
    modeManager: ModeManager;
}
