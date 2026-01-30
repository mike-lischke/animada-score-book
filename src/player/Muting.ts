/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmNote, RealTime } from "../core/ScoreBookDataModel.js";
import type { IMutingRuleOtherInstrument, MutingRule } from "../core/types/general.js";
import { exists, isSameTiming } from "../core/utils.js";
import type { IAudioEvent, IMuteEvent, MuteFilter } from "./types.js";

export const getMuteEvents = (note: ISbDmNote, realTime: RealTime): IMuteEvent[] => {
    const muteFilters = getMuteFilters(note);

    return muteFilters.map((muteFilter) => {
        // TODO: Handle undefined muteFilters.
        return { muteFilter: muteFilter!, realTime };
    });
};

const getMuteFilters = (note: ISbDmNote): Array<MuteFilter | undefined> => {
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

const getMuteFilter = (note: ISbDmNote, muting: MutingRule): MuteFilter | undefined => {
    const ruleName = typeof muting === "string" ? muting : muting.name;
    switch (ruleName) {
        case "sameTrack":
            return getSameTrackMuteFilter(note);
        case "otherInstrument":
            return getOtherInstrumentMuteFilter(note, muting as IMutingRuleOtherInstrument);
    }
};

const getSameTrackMuteFilter = (note: ISbDmNote): MuteFilter | undefined => {
    const noteStyle = note.noteStyle;
    if (!noteStyle) {
        return;
    }

    const track = note.track;

    return (audioEvent: IAudioEvent) => {
        return audioEvent.note.track === track
            && audioEvent.note !== note;
    };
};

const getOtherInstrumentMuteFilter = (note: ISbDmNote, muting: IMutingRuleOtherInstrument): MuteFilter | undefined => {
    const noteStyle = note.noteStyle;
    if (!noteStyle) {
        return;
    }

    const otherInstrumentId = muting.id;

    return (audioEvent: IAudioEvent) => {
        return audioEvent.note.track.instrument.typeId === otherInstrumentId
            && !isSameTiming(audioEvent.note.timing, note.timing);
    }; // Don't cross-mute when played together
};
