/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Note } from "./Note.js";
import { Publisher } from "./Publisher.js";
import {
    SbDmEntityType, type ISbDmArrangement, type ISbDmInstrument, type ISbDmNote, type ISbDmTrack,
    type ITiming
} from "./ScoreBookDataModel.js";
import { TrackClipboard } from "./TrackClipboard.js";
import type { IPolyrhythm } from "./types/general.js";
import { exists, getNewId, isSameTiming } from "./utils.js";

export class Track extends Publisher implements ISbDmTrack {
    public readonly type = SbDmEntityType.Track;
    public readonly notes: ISbDmNote[] = [];
    public readonly polyrhythms: IPolyrhythm[] = [];

    public name = "";
    public volume = 1.0;

    /**
     * Creates a new `Track` bound to an arrangement and instrument.
     *
     * - Initializes notes for all timings in the arrangement as rests.
     * - Subscribes to arrangement and time parameter changes to keep notes/polyrhythms in sync.
     *
     * @param arrangement The owning arrangement.
     * @param instrument The instrument assigned to this track.
     * @param id Optional explicit track id; if omitted a new id is generated.
     */
    public constructor(public readonly arrangement: ISbDmArrangement, public readonly instrument: ISbDmInstrument,
        public readonly id = getNewId()) {
        super();

        this.arrangement = arrangement;

        // Initialise all Notes as rests.
        this.arrangement.timeParams.timings.forEach((timing) => {
            this.notes.push(new Note(this, timing));
        });

        this.arrangement.timeParams.subscribe(this.handleTimeParamsChange);
        this.arrangement.subscribe(this.destroySelfIfNeeded);
    }

    /**
     * Finds the note at the given timing.
     *
     * @param timing The timing to search for.
     * @returns The note at the timing or undefined if none exists.
     */
    public getNoteAt(timing: ITiming): ISbDmNote | undefined {
        for (const note of this.notes) {
            if (isSameTiming(note.timing, timing)) {
                return note;
            }
        }
    };

    /**
     * Clears all notes and polyrhythm notes to rests (undefined note-style).
     * Publishes a change after completion.
     */
    public clear() {
        this.notes.forEach((note) => {
            note.noteStyle = undefined;
        });

        this.polyrhythms.forEach(({ notes }) => {
            notes.forEach((note) => {
                note.noteStyle = undefined;
            });
        });
    };

    /**
     * Adds a polyrhythm to this track.
     *
     * @param start The starting note of the polyrhythm.
     * @param end The ending note of the polyrhythm.
     * @param length The number of notes inside the polyrhythm (must be >= 1).
     * @param id Optional explicit polyrhythm id, otherwise a new id is generated.
     * @param index Optional insertion index; if omitted the polyrhythm is appended.
     */
    public addPolyrhythm(start: ISbDmNote, end: ISbDmNote, length: number, id: number = getNewId(), index?: number) {
        if (length < 1) {
            return;
        }

        const polyrhythm: IPolyrhythm = { start, end, id, notes: [] };

        polyrhythm.notes = Array.from(Array(length))
            .map((_, index) => {
                return new Note(this, { bar: 1, step: index }, polyrhythm);
            });

        if (exists(index)) {
            this.polyrhythms.splice(index, 0, polyrhythm);
        } else {
            this.polyrhythms.push(polyrhythm);
        }

        this.publish();
    };

    /**
     * Removes a polyrhythm from this track and publishes a change.
     *
     * @param polyrhythm The polyrhythm to remove.
     */
    public removePolyrhythm = (polyrhythm: IPolyrhythm) => {
        this.polyrhythms.splice(this.polyrhythms.indexOf(polyrhythm), 1);
        this.publish();
    };

    /**
     * Ensures the track contains notes for all timings, inserting rests where missing.
     * Keeps `notes` sorted by timing.
     */
    public fillInRests = (): void => {
        const timingsWithNoNotes = this.arrangement.timeParams.timings.filter((timing) => {
            return !this.notes.some((note) => {
                return isSameTiming(note.timing, timing);
            });
        });

        if (timingsWithNoNotes.length) {
            timingsWithNoNotes.forEach((timing) => {
                this.notes.push(new Note(this, timing));
            });

            this.notes.sort((a, b) => {
                return (a.timing.bar - b.timing.bar) || (a.timing.step - b.timing.step);
            });
        }
    };

    /**
     * Copies the initial composition (first `originalNoteCount` notes) and repeats it
     * to fill the track. Uses `TrackClipboard` to respect rests and note-styles.
     *
     * @param originalNoteCount The number of notes that form the base composition.
     */
    public copyComposition(originalNoteCount: number): void {
        const lastTiming = this.notes[originalNoteCount - 1].timing;

        const clipboard = new TrackClipboard(this);
        clipboard.copy({
            start: { bar: 1, step: 1 },
            end: lastTiming
        });

        let numNotesCovered = clipboard.length;

        while (numNotesCovered < this.notes.length) {
            const pasteStart = this.notes[numNotesCovered].timing;
            clipboard.paste({ start: pasteStart });
            numNotesCovered += clipboard.length;
        }
    };

    /**
     * Removes polyrhythms that reference notes no longer present or nested polyrhythms
     * that have been deleted. Publishes if any were removed.
     */
    public removeBrokenPolyrhythms = () => {
        if (!this.polyrhythms.length) {
            return;
        }

        const initialPolyrhythmCount = this.polyrhythms.length;

        // Iterate from earliest polyrhythms to latest.
        // Therefore, if we consider a nested polyrhythm, we know its root polyrhythms have already been checked.
        let index = 0;
        while (index < this.polyrhythms.length) {
            const { start, end } = this.polyrhythms[index];

            if (start.polyrhythm) {
                if (!this.polyrhythms.includes(start.polyrhythm)) {
                    this.polyrhythms.splice(index, 1);
                    continue;
                }
            } else if (!this.notes.includes(start)) {
                this.polyrhythms.splice(index, 1);
                continue;
            }

            if (end.polyrhythm) {
                if (!this.polyrhythms.includes(end.polyrhythm)) {
                    this.polyrhythms.splice(index, 1);
                    continue;
                }
            } else if (!this.notes.includes(end)) {
                this.polyrhythms.splice(index, 1);
                continue;
            }

            index++;
        }

        if (this.polyrhythms.length < initialPolyrhythmCount) {
            this.publish();
        }
    };

    /**
     * The note-iterator is what makes polyrhythms work.
     * Iterates notes in playback/serialization order, traversing into polyrhythms where present.
     * Use `polyrhythmsToIgnore` to skip traversal into specific polyrhythms (e.g., during serialization).
     *
     * @param polyrhythmsToIgnore Optional list of polyrhythms to treat as plain notes.
     * @yields {INote} The next note in iteration order.
     */
    public *getNoteIterator(polyrhythmsToIgnore: IPolyrhythm[] = []) {
        let index = 0;
        let currentNoteSource = this.notes;
        let note = currentNoteSource[index] as (ISbDmNote | undefined);

        while (note) {
            // First, ascend polyrhythms until we reach a visible note
            // Could speed this up with a map
            // eslint-disable-next-line no-loop-func
            const linkedPolyrhythmUp = this.polyrhythms.find((polyrhythm) => {
                return polyrhythm.start === note;
            });

            if (linkedPolyrhythmUp && !polyrhythmsToIgnore.includes(linkedPolyrhythmUp)) {
                currentNoteSource = linkedPolyrhythmUp.notes;
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

    /**
     * Handles changes in time parameters: removes invalid notes, inserts new rests, and
     * replicates composition when the arrangement length increases. Also cleans up broken polyrhythms.
     * Publishes changes when the note set changes.
     */
    private handleTimeParamsChange = () => {
        const originalNoteCount = this.notes.length;

        // Remove invalid notes, e.g. arrangement has shortened
        let index = 0;
        while (index < this.notes.length) {
            if (!this.arrangement.timeParams.isValid(this.notes[index].timing)) {
                this.notes.splice(index, 1);
            } else {
                index++;
            }
        }

        this.fillInRests(); // Fill in new notes, e.g. arrangement has lengthened

        if (originalNoteCount !== this.notes.length) {
            if (this.notes.length > originalNoteCount) {
                this.copyComposition(originalNoteCount);
            }
            this.publish();
        }

        this.removeBrokenPolyrhythms();
    };

    /**
     * Unsubscribes when the track is removed from the arrangement.
     */
    private destroySelfIfNeeded = () => {
        // Check track still exists
        if (this.arrangement.tracks.includes(this)) {
            return;
        }

        // ... otherwise unsubscribe from everything
        this.arrangement.timeParams.unsubscribe(this.handleTimeParamsChange);
        this.arrangement.unsubscribe(this.destroySelfIfNeeded);
    };
}
