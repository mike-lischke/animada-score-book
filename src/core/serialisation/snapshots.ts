/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IArrangementSnapshot, IPolyrhythmSnapshot, ITrackSnapshot } from "../types/snapshots.js";
import type { IArrangementView, IPolyrhythmView, ITrackView } from "../types/general.js";

export const getArrangementSnapshot = (arrangement: IArrangementView): IArrangementSnapshot => {
    const { timeSignature, tempo, length, pulse, stepResolution } = arrangement.timeParams;

    return {
        title: arrangement.title,
        timeParams: { timeSignature, tempo, length, pulse, stepResolution },
        tracks: arrangement.tracks.map(getTrackSnapshot)
    };
};

const getTrackSnapshot = (track: ITrackView): ITrackSnapshot => {
    return {
        id: track.id,
        instrumentId: track.instrument.id,
        notes: getNotesAsChars(track),
        polyrhythms: getPolyrhythmSnapshots(track)
    };
};

const getNotesAsChars = (track: ITrackView): string[] => {
    return Array.from(track.getNoteIterator())
        .map((note) => {
            return note.noteStyle?.id ?? "0";
        }); // For rests, note.noteStyle is null, and '0' is reserved for this on all instruments
};

const getPolyrhythmSnapshots = (track: ITrackView): IPolyrhythmSnapshot[] => {
    const polyrhythmSnapshots: IPolyrhythmSnapshot[] = [];
    const polyrhythmsToIgnore: IPolyrhythmView[] = [];

    // We do polyrhythms in reverse order in order to support nested polyrhthms
    // When we rebuild the polyrhythms one-by-one, the note-iterator is going to change after each one
    // When we serialise, we have to mimic that behaviour in reverse

    for (let polyrhythmIndex = track.polyrhythms.length - 1; polyrhythmIndex >= 0; polyrhythmIndex--) {
        const polyrhythm = track.polyrhythms[polyrhythmIndex];
        polyrhythmsToIgnore.push(polyrhythm);
        let start = 0;
        let end = Number.MAX_SAFE_INTEGER;

        const noteIterator = track.getNoteIterator(polyrhythmsToIgnore);
        let noteIndex = 0;
        for (const note of noteIterator) {
            if (note === polyrhythm.start) {
                start = noteIndex;
            }
            if (note === polyrhythm.end) {
                end = noteIndex;
                break;
            }
            noteIndex++;
        }

        polyrhythmSnapshots.unshift({
            id: polyrhythm.id,
            start,
            end,
            length: polyrhythm.notes.length
        });
    }

    return polyrhythmSnapshots;
};
