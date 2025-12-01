/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IMutingRuleOtherInstrument, INoteView, MutingRule, RealTime } from "../Core/types/general.js";
import { exists, isSameTiming } from "../Core/utils.js";
import type { AudioEvent, IMuteEvent, MuteFilter } from "./types.js";

export const getMuteEvents = (note: INoteView, realTime: RealTime): IMuteEvent[] => {
    const muteFilters = getMuteFilters(note);

    return muteFilters.map((muteFilter) => {
        // TODO: Handle undefined muteFilters.
        return { muteFilter: muteFilter!, realTime };
    });
};

const getMuteFilters = (note: INoteView): Array<MuteFilter | undefined> => {
    const muting = note.noteStyle?.muting;
    if (!muting) {
        return [];
    }

    if (Array.isArray(muting)) {
        return muting.map((muting) => {
            return getMuteFilter(note, muting);
        }).filter(exists);
    }

    return [getMuteFilter(note, muting)];
};

const getMuteFilter = (note: INoteView, muting: MutingRule): MuteFilter | undefined => {
    const ruleName = typeof muting === "string" ? muting : muting.name;
    switch (ruleName) {
        case "sameTrack":
            return getSameTrackMuteFilter(note);
        case "otherInstrument":
            return getOtherInstrumentMuteFilter(note, muting as IMutingRuleOtherInstrument);
    }
};

const getSameTrackMuteFilter = (note: INoteView): MuteFilter | undefined => {
    const noteStyle = note.noteStyle;
    if (!noteStyle) {
        return;
    }

    const track = note.track;

    return (audioEvent: AudioEvent) => {
        return audioEvent.note.track === track
            && audioEvent.note !== note;
    };
};

const getOtherInstrumentMuteFilter = (note: INoteView, muting: IMutingRuleOtherInstrument): MuteFilter | undefined => {
    const noteStyle = note.noteStyle;
    if (!noteStyle) {
        return;
    }

    const otherInstrumentId = muting.id;

    return (audioEvent: AudioEvent) => {
        return audioEvent.note.track.instrument.id === otherInstrumentId
            && !isSameTiming(audioEvent.note.timing, note.timing);
    }; // Don't cross-mute when played together
};
