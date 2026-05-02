/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../core/Publisher.js";
import type { ISbDmNote, ISbDmTrack, RealTime } from "../core/ScoreBookDataModel.js";
import type { IPolyrhythm } from "../core/types/general.js";
import type { TimeCoordinator } from "./TimeCoordinator.js";
import { Event, ICallbackEvent, IInterval } from "./types.js";

/**
 * Coordinates playback for a single track.
 *
 * - Caches real-time positions for notes based on `timeCoordinator`.
 * - Produces audio and callback events for time intervals.
 * - Publishes the currently playing polyrhythm note for UI highlighting.
 * - Keeps caches in sync with instrument load state, track edits, and timing changes.
 * - Provides a robust lifecycle via `onStop()` and `dispose()`.
 */
export class TrackPlayer {
    public readonly track: ISbDmTrack;

    /** Publishes when the current polyrhythm note changes (for UI highlighting). */
    public readonly currentPolyrhythmNotePublisher: Publisher = new Publisher();

    private readonly timeCoordinator: TimeCoordinator;

    private readonly noteTimes = new Map<ISbDmNote, RealTime>();
    private cachedPolyrhythms: IPolyrhythm[] = [];
    private _currentPolyrhythmNote: ISbDmNote | null = null;

    private disposed = false;

    private setupNotes: (() => void) | null = null;

    private lastNoteCount: number;
    private lastPolyrhythmCount: number;
    private lastLength: number;

    /**
     * Creates a player for the given track and sets up note timing caches and subscriptions.
     *
     * @param track The track view to observe and play.
     * @param timeCoordinator Converts score timings to real-time and provides loop/length context.
     */
    public constructor(track: ISbDmTrack, timeCoordinator: TimeCoordinator) {
        this.track = track;
        this.timeCoordinator = timeCoordinator;

        // Initial note timing setup depending on instrument load state.
        if (this.track.instrument.state.initialized) {
            this.fillInBasicNoteTimes();
            this.handleNewPolyrhythms();
        } else {
            this.setupNotes = () => {
                this.fillInBasicNoteTimes();
                this.handleNewPolyrhythms();
                this.track.instrument.unsubscribe(this.setupNotes!);
                this.setupNotes = null;
            };
            this.track.instrument.subscribe(this.setupNotes);
        }

        // Subscriptions to keep internal caches in sync.
        this.lastNoteCount = this.track.notes.length;
        this.lastPolyrhythmCount = this.track.polyrhythms.length;
        this.track.subscribe(this.handleTrackChange);
        this.lastLength = this.track.arrangement.timeParams.length;
        this.timeCoordinator.subscribe(this.handleTimeChange);
        this.track.arrangement.subscribe(this.destroySelfIfNeeded);
    }

    /**
     * The note currently playing inside a polyrhythm, or `null` if none.
     *
     * @returns The current polyrhythm note, if any.
     */
    public get currentPolyrhythmNote(): ISbDmNote | null {
        return this._currentPolyrhythmNote;
    }

    /**
     * Builds all events (audio and callbacks) for the given real-time interval.
     * Returns an empty list if the instrument is not loaded or the player is disposed.
     *
     * @param interval The real-time interval for which to retrieve events. `end` is treated as exclusive.
     *
     * @returns Events occurring within the interval, ordered by time.
     */
    public getEvents = (interval: IInterval): Event[] => {
        if (this.disposed || !this.track.instrument.state.initialized) {
            return [];
        }

        const events: Event[] = [];

        const noteIterator = this.track.getNoteIterator();
        for (const note of noteIterator) {
            const time = this.noteTimes.get(note)!;
            // Treat `end` as exclusive. Notes exactly on this end are included in the following interval.
            if (time >= interval.end) {
                break;
            }

            if (time >= interval.start) {
                if (note.noteStyle) {
                    events.push(this.getAudioEvent(note, time));
                }
                events.push(this.getCurrentPolyrhythmNoteEvent(note, time));
            }
        }

        return events;
    };

    /** Resets transient playback state and publishes UI updates. */
    public onStop = (): void => {
        this._currentPolyrhythmNote = null;
        this.currentPolyrhythmNotePublisher.publish();
    };

    /** Disposes all subscriptions and internal state. Safe to call multiple times. */
    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.onStop();

        // Unsubscribe from all sources and clear any pending instrument setup subscription.
        this.timeCoordinator.unsubscribe(this.handleTimeChange);
        this.track.unsubscribe(this.handleTrackChange);
        this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        if (this.setupNotes) {
            this.track.instrument.unsubscribe(this.setupNotes);
            this.setupNotes = null;
        }
    }

    /** Populates `noteTimes` for notes missing cached real-time positions using `timeCoordinator`. */
    private fillInBasicNoteTimes = (): void => {
        const unmatchedNotes = this.track.notes.filter((note) => {
            return !this.noteTimes.get(note);
        });
        unmatchedNotes.forEach((note) => {
            return this.noteTimes.set(note, this.timeCoordinator.convertToRealTime(note.timing));
        });
    };

    /** Adds real-time positions for notes in newly detected polyrhythms and caches them. */
    private handleNewPolyrhythms = (): void => {
        this.track.polyrhythms.forEach((polyrhythm) => {
            if (!this.cachedPolyrhythms.includes(polyrhythm)) {
                this.addNoteTimesForPolyrhythm(polyrhythm);
                this.cachedPolyrhythms.push(polyrhythm);
            }
        });
    };

    /** Responds to structural changes in the track (notes/polyrhythms added or removed) by updating caches. */
    private handleTrackChange = (): void => {
        const newNoteCount = this.track.notes.length;
        if (newNoteCount > this.lastNoteCount) {
            this.fillInBasicNoteTimes();
        } else if (newNoteCount < this.lastNoteCount) {
            this.removeNoteTimesOfDroppedNotes();
        } else if (this.track.polyrhythms.length > this.lastPolyrhythmCount) {
            this.handleNewPolyrhythms();
        } else if (this.track.polyrhythms.length < this.lastPolyrhythmCount) {
            this.handleDroppedPolyrhythms();
        }

        this.lastNoteCount = newNoteCount;
        this.lastPolyrhythmCount = this.track.polyrhythms.length;
    };

    /** Reacts to arrangement timing changes; recomputes note times and rebuilds polyrhythm caches. */
    private handleTimeChange = (): void => {
        // Unnecessary to recalc note times when the length changes
        if (this.track.arrangement.timeParams.length !== this.lastLength) {
            this.lastLength = this.track.arrangement.timeParams.length;

            return;
        }

        for (const note of this.noteTimes.keys()) {
            if (this.track.notes.includes(note)) {
                this.noteTimes.set(note, this.timeCoordinator.convertToRealTime(note.timing));
            }
        }

        // Destroy and recreate polyrhythms for simplicity
        this.destroyPolyrhythms();
        this.handleNewPolyrhythms();
    };

    /** Stops reacting if the track is removed from its arrangement (unsubscribes). */
    private destroySelfIfNeeded = (): void => {
        if (!this.track.arrangement.tracks.includes(this.track)) {
            this.timeCoordinator.unsubscribe(this.handleTimeChange);
            this.track.arrangement.unsubscribe(this.destroySelfIfNeeded);
        }
    };

    /**
     * Builds an audio event for a given note at the provided real-time position.
     *
     * @param note The note to play.
     * @param realTime The real-time position of the note.
     * @returns An audio event for the note.
     */
    private getAudioEvent = (note: ISbDmNote, realTime: RealTime): Event => {
        return {
            kind: "audio",
            note,
            realTime,
            audioBuffer: note.noteStyle!.audioBuffer!
        };
    };

    /** Removes cached times for notes that no longer belong to the track and are not part of a polyrhythm. */
    private removeNoteTimesOfDroppedNotes = (): void => {
        for (const note of this.noteTimes.keys()) {
            if (!note.polyrhythm && !this.track.notes.includes(note)) {
                this.noteTimes.delete(note);
            }
        }
    };

    /** Cleans up caches for polyrhythms that have been removed from the track. */
    private handleDroppedPolyrhythms = (): void => {
        this.cachedPolyrhythms = this.cachedPolyrhythms.filter((cachedPolyrhythm) => {
            if (this.track.polyrhythms.includes(cachedPolyrhythm)) {
                return true;
            }

            cachedPolyrhythm.notes.forEach((note) => {
                return this.noteTimes.delete(note);
            });

            return false;
        });
    };

    /**
     * Computes evenly distributed real-time positions for notes within a polyrhythm,
     * inferred from the start note and the next note following the polyrhythm.
     *
     * @param polyrhythm The polyrhythm whose notes should receive real-time positions.
     */
    private addNoteTimesForPolyrhythm = (polyrhythm: IPolyrhythm): void => {
        const startTime = this.noteTimes.get(polyrhythm.start)!;

        // We need to find the note just after the polyrhythm ends to work out its time-length
        // It's possible the next note is the start of a polyrhythm in an equal-or-higher level,
        // which we don't have times for yet.
        // So we exclude later polyrhythms from the iterator
        const laterPolyrhythms = this.track.polyrhythms.slice(this.track.polyrhythms.indexOf(polyrhythm) + 1);
        const noteIterator = this.track.getNoteIterator(laterPolyrhythms);
        let nextNote: ISbDmNote | undefined;
        let foundPolyrhythm = false;
        for (const note of noteIterator) {
            if (foundPolyrhythm) {
                if (note.polyrhythm !== polyrhythm) {
                    nextNote = note;
                    break;
                }
            } else if (note.polyrhythm === polyrhythm) {
                foundPolyrhythm = true;
            }
        }

        const endTime = nextNote ? this.noteTimes.get(nextNote)! : this.timeCoordinator.metrics.realTimeLength;

        const realTimeLength = endTime - startTime;
        const timePerNote = realTimeLength / polyrhythm.notes.length;

        polyrhythm.notes.forEach((note, index) => {
            return this.noteTimes.set(note, startTime + (index * timePerNote));
        });
    };

    /** Clears all polyrhythm-related cached note times and resets the polyrhythm cache. */
    private destroyPolyrhythms = (): void => {
        this.cachedPolyrhythms.forEach((polyrhythm) => {
            polyrhythm.notes.forEach((note) => {
                return this.noteTimes.delete(note);
            });
        });
        this.cachedPolyrhythms = [];
    };

    /**
     * Produces a callback event that updates `currentPolyrhythmNote` when a note plays or resets to `null`.
     *
     * @param {INoteView} note The note whose play state triggers the callback.
     * @param {RealTime} realTime The real-time position at which the callback occurs.
     * @returns {ICallbackEvent} A callback event for updating UI state.
     */
    private getCurrentPolyrhythmNoteEvent = (note: ISbDmNote, realTime: RealTime): ICallbackEvent => {
        if (note.polyrhythm) {
            return {
                kind: "callback",
                realTime,
                callback: () => {
                    this._currentPolyrhythmNote = note;
                    this.currentPolyrhythmNotePublisher.publish();
                }
            };
        }

        return {
            kind: "callback",
            realTime,
            callback: () => {
                this._currentPolyrhythmNote = null;
                this.currentPolyrhythmNotePublisher.publish();
            }
        };
    };
}
