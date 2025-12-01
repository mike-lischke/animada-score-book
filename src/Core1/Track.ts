/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Note } from "./Note.js";
import { Publisher } from "./Publisher.js";
import { TrackClipboard } from "./TrackClipboard.js";
import type { IArrangement, IInstrument, INote, IPolyrhythm, ITiming, ITrack } from "./types/general.js";
import { exists, getNewId, isSameTiming } from "./utils.js";

export class Track extends Publisher implements ITrack {
    public readonly notes: INote[] = [];
    public readonly polyrhythms: IPolyrhythm[] = [];

    public constructor(public readonly arrangement: IArrangement, public readonly instrument: IInstrument,
        public readonly id = getNewId()) {
        super();

        this.arrangement = arrangement;

        // Initialise all Notes as rests
        this.arrangement.timeParams.timings.forEach((timing) => {
            return this.notes.push(new Note(this, timing));
        });

        this.arrangement.timeParams.subscribe(this.handleTimeParamsChange);
        this.arrangement.subscribe(this.destroySelfIfNeeded);
    }

    public getNoteAt(timing: ITiming): INote | undefined {
        for (const note of this.notes) {
            if (isSameTiming(note.timing, timing)) {
                return note;
            }
        }
    };

    public clear() {
        this.notes.forEach((note) => {
            return note.noteStyle = undefined;
        });

        this.polyrhythms.forEach(({ notes }) => {
            notes.forEach((note) => {
                return note.noteStyle = undefined;
            });
        });
    };

    public addPolyrhythm(start: INote, end: INote, length: number, id: number = getNewId(), index?: number) {
        if (length < 1) {
            return;
        }

        const polyrhythm: IPolyrhythm = { start, end, id, notes: [] };

        /*for (let i = 0; i < length; ++i) {
            const t = createNote(track, { bar: 1, step: i }, polyrhythm);
            polyrhythm.notes.push(t);
        }*/

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

    public removePolyrhythm = (polyrhythm: IPolyrhythm) => {
        this.polyrhythms.splice(this.polyrhythms.indexOf(polyrhythm), 1);
        this.publish();
    };

    public fillInRests = (): void => {
        const timingsWithNoNotes = this.arrangement.timeParams.timings.filter((timing) => {
            return !this.notes.some((note) => {
                return isSameTiming(note.timing, timing);
            });
        });

        if (timingsWithNoNotes.length) {
            timingsWithNoNotes.forEach((timing) => {
                return this.notes.push(new Note(this, timing));
            });

            this.notes.sort((a, b) => {
                return (a.timing.bar - b.timing.bar) || (a.timing.step - b.timing.step);
            });
        }
    };

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

    public removeBrokenPolyrhythms = () => {
        if (!this.polyrhythms.length) {
            return;
        }

        const initialPolyrhythmCount = this.polyrhythms.length;

        // Iterate from earliest polyrhtyhms to latest
        // Therefore, if we consider a nested polyrhythm, we know its root polyrhythms have already been checked
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

    // The note-iterator is what makes polyrhythms work
    // polyrhythmsToIgnore is for serialising, so we can walk the notes as if the polyrhythm hasn't been crated yet
    public *getNoteIterator(polyrhythmsToIgnore: IPolyrhythm[] = []) {
        let index = 0;
        let currentNoteSource = this.notes;
        let note = currentNoteSource[index] as (INote | undefined);

        while (note) {
            // First, ascend polyrhythms until we reach a visible note
            // Could speed this up with a map
            // eslint-disable-next-line no-loop-func
            const linkedPolyrhyhmUp = this.polyrhythms.find((polyrhythm) => {
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
