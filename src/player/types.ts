/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNote, RealTime } from "../core/ScoreBookDataModel.js";
import type { ISubscribable } from "../core/types/general.js";
import type { ModeManager } from "../ui/ModeManager.js";
import type { SelectionManager } from "../ui/SelectionManager.js";

export interface IEventDetails {
    kind: string;
    realTime: RealTime;
}

export interface IAudioEvent extends IEventDetails {
    kind: "audio";
    audioBuffer: AudioBuffer;
    note: ISbDmNote; // In the future, this could be a more general "source" property
}

export interface ICallbackEvent extends IEventDetails {
    kind: "callback";
    callback(): void;
}

export type MuteFilter = (audioEvent: IAudioEvent) => boolean;
export interface IMuteEvent extends IEventDetails {
    kind: "mute";
    muteFilter: MuteFilter;
}

export interface IMetronomeEvent extends IEventDetails {
    kind: "metronome";

    /** Zero-based: 0 = first beat in the bar */
    beatInBar: number;

    /** true for the strong beat on 1 */
    isAccent: boolean;
}

export type Event = ICallbackEvent | IAudioEvent | IMuteEvent | IMetronomeEvent;

export interface IEventSource extends ISubscribable {
    getEvents(interval: IInterval): Event[];
    onStop(): void;
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
