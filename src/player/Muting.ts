/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { MutingRule, MutingRuleOtherInstrument, NoteView, RealTime } from "../core/index.js";
import { exists, isSameTiming } from "../core/utils.js";
import type { AudioEvent, MuteEvent, MuteFilter } from "./types.js";

export const getMuteEvents = (note: NoteView, realTime: RealTime): MuteEvent[] => {
    const muteFilters = getMuteFilters(note);

    return muteFilters.map(muteFilter => {
        // TODO: Handle undefined muteFilters.
        return { muteFilter: muteFilter!, realTime };
    });
};

const getMuteFilters = (note: NoteView): Array<MuteFilter | undefined> => {
    const muting = note.noteStyle?.muting;
    if (!muting) {
        return [];
    }

    if (Array.isArray(muting)) {
        return muting.map(muting => {
            return getMuteFilter(note, muting);
        }).filter(exists);
    }

    return [getMuteFilter(note, muting)];
};

const getMuteFilter = (note: NoteView, muting: MutingRule): MuteFilter | undefined => {
    const ruleName = typeof muting === "string" ? muting : muting.name;
    switch (ruleName) {
        case "sameTrack":
            return getSameTrackMuteFilter(note);
        case "otherInstrument":
            return getOtherInstrumentMuteFilter(note, muting as MutingRuleOtherInstrument);
    }
};

const getSameTrackMuteFilter = (note: NoteView): MuteFilter | undefined => {
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

const getOtherInstrumentMuteFilter = (note: NoteView, muting: MutingRuleOtherInstrument): MuteFilter | undefined => {
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
