/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-jsdoc */

import { createNote } from "./Note.js";
import { createPublisher } from "./Publisher.js";
import { TrackClipboard } from "./TrackClipboard.js";
import type { Arrangement, Instrument, Note, Polyrhythm, Timing, Track } from "./types/general.js";
import { exists, getNewId, isSameTiming } from "./utils.js";

export const createTrack = (arrangement: Arrangement, instrument: Instrument, id: number = getNewId()): Track => {
    const getNoteAt = (timing: Timing): Note | undefined => {
        for (const note of notes) {
            if (isSameTiming(note.timing, timing)) {
                return note;
            }
        }
    };

    const clear = () => {
        notes.forEach(note => {
            return note.noteStyle = undefined;
        });
        polyrhythms.forEach(({ notes }) => {
            notes.forEach(note => {
                return note.noteStyle = undefined;
            });
        });
    };

    const addPolyrhythm = (start: Note, end: Note, length: number, id: number = getNewId(), index?: number) => {
        if (length < 1) {
            return;
        }

        const polyrhythm: Polyrhythm = { start, end, id, notes: [] };

        /*for (let i = 0; i < length; ++i) {
            const t = createNote(track, { bar: 1, step: i }, polyrhythm);
            polyrhythm.notes.push(t);
        }*/

        polyrhythm.notes = Array.from(Array(length))
            .map((_, index) => {
                return createNote(track, { bar: 1, step: index }, polyrhythm);
            });

        if (exists(index)) {
            polyrhythms.splice(index, 0, polyrhythm);
        } else {
            polyrhythms.push(polyrhythm);
        }

        publisher.publish();
    };

    const removePolyrhythm = (polyrhythm: Polyrhythm) => {
        polyrhythms.splice(polyrhythms.indexOf(polyrhythm), 1);
        publisher.publish();
    };

    const handleTimeParamsChange = () => {
        const originalNoteCount = notes.length;

        // Remove invalid notes, e.g. arrangement has shortened
        let index = 0;
        while (index < notes.length) {
            if (!arrangement.timeParams.isValid(notes[index].timing)) {
                notes.splice(index, 1);
            } else {
                index++;
            }
        }

        fillInRests(); // Fill in new notes, e.g. arrangement has lengthened

        if (originalNoteCount !== notes.length) {
            if (notes.length > originalNoteCount) {
                copyComposition(originalNoteCount);
            }
            publisher.publish();
        }

        removeBrokenPolyrhythms();
    };

    const destroySelfIfNeeded = () => {
        // Check track still exists
        if (arrangement.tracks.includes(track)) {
            return;
        }

        // ... otherwise unsubscribe from everything
        arrangement.timeParams.unsubscribe(handleTimeParamsChange);
        arrangement.unsubscribe(destroySelfIfNeeded);
    };

    const publisher = createPublisher();
    const notes: Note[] = [];
    const polyrhythms: Polyrhythm[] = [];
    const track: Track = {
        id, arrangement, instrument, notes, polyrhythms, addPolyrhythm, removePolyrhythm, getNoteAt, clear,
        getNoteIterator,
        subscribe: publisher.subscribe,
        unsubscribe: publisher.unsubscribe
    };

    // Initialise all Notes as rests
    arrangement.timeParams.timings.forEach(timing => {
        return notes.push(createNote(track, timing));
    });

    arrangement.timeParams.subscribe(handleTimeParamsChange);
    arrangement.subscribe(destroySelfIfNeeded);

    return track;

    // The note-iterator is what makes polyrhythms work
    // polyrhythmsToIgnore is for serialising, so we can walk the notes as if the polyrhythm hasn't been crated yet
    function* getNoteIterator(polyrhythmsToIgnore: Polyrhythm[] = []) {
        let index = 0;
        let currentNoteSource = track.notes;
        let note = currentNoteSource[index] as (Note | undefined);

        while (note) {
            // First, ascend polyrhythms until we reach a visible note
            // Could speed this up with a map
            const linkedPolyrhyhmUp = polyrhythms.find(polyrhythm => {
                return polyrhythm.start === note;
            });

            if (linkedPolyrhyhmUp && !polyrhythmsToIgnore.includes(linkedPolyrhyhmUp)) {
                currentNoteSource = linkedPolyrhyhmUp.notes;
                index = 0;
            } else {
                yield note;

                // If we're at the end of a polyrhythm, descend until we're not
                while (note.polyrhythm && !currentNoteSource[index + 1]) {
                    note = note.polyrhythm.end;
                    currentNoteSource = note.polyrhythm?.notes ?? note.track.notes;
                    index = currentNoteSource.indexOf(note);
                }

                index++;
            }

            note = currentNoteSource[index];
        }
    }

    const fillInRests = (): void => {
        const timingsWithNoNotes = arrangement.timeParams.timings
            .filter(timing => {
                return !notes.some(note => {
                    return isSameTiming(note.timing, timing);
                });
            });
        if (timingsWithNoNotes.length) {
            timingsWithNoNotes.forEach(timing => {
                return notes.push(createNote(track, timing));
            });
            notes.sort((a, b) => {
                return (a.timing.bar - b.timing.bar) || (a.timing.step - b.timing.step);
            });
        }
    };

    const copyComposition = (originalNoteCount: number): void => {
        const lastTiming = track.notes[originalNoteCount - 1].timing;

        const clipboard = new TrackClipboard(track);
        clipboard.copy({
            start: { bar: 1, step: 1 },
            end: lastTiming
        });
        let numNotesCovered = clipboard.length;

        while (numNotesCovered < track.notes.length) {
            const pasteStart = track.notes[numNotesCovered].timing;
            clipboard.paste({ start: pasteStart });
            numNotesCovered += clipboard.length;
        }
    };

    const removeBrokenPolyrhythms = () => {
        if (!polyrhythms.length) {
            return;
        }

        const initialPolyrhythmCount = polyrhythms.length;

        // Iterate from earliest polyrhtyhms to latest
        // Therefore, if we consider a nested polyrhythm, we know its root polyrhythms have already been checked
        let index = 0;
        while (index < polyrhythms.length) {
            const { start, end } = polyrhythms[index];

            if (start.polyrhythm) {
                if (!polyrhythms.includes(start.polyrhythm)) {
                    polyrhythms.splice(index, 1);
                    continue;
                }
            } else if (!notes.includes(start)) {
                polyrhythms.splice(index, 1);
                continue;
            }

            if (end.polyrhythm) {
                if (!polyrhythms.includes(end.polyrhythm)) {
                    polyrhythms.splice(index, 1);
                    continue;
                }
            } else if (!notes.includes(end)) {
                polyrhythms.splice(index, 1);
                continue;
            }

            index++;
        }

        if (polyrhythms.length < initialPolyrhythmCount) {
            publisher.publish();
        }

    };

};
