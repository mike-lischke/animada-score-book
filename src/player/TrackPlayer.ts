/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../Core1/Publisher.js";
import type { INoteView, IPolyrhythmView, ITrackView, RealTime } from "../Core1/types/general.js";
import { getMuteEvents } from "./Muting.js";
import { ICallbackEvent, Event, IInterval, SoloMute, ITimeCoordinator, ITrackPlayer } from "./types.js";

export const createTrackPlayer = (track: ITrackView, timeCoordinator: ITimeCoordinator): ITrackPlayer => {
    const fillInBasicNoteTimes = () => {
        const unmatchedNotes = track.notes.filter((note) => {
            return !noteTimes.get(note);
        });
        unmatchedNotes.forEach((note) => {
            return noteTimes.set(note, timeCoordinator.convertToRealTime(note.timing));
        });
    };

    const handleNewPolyrhythms = () => {
        track.polyrhythms.forEach((polyrhythm) => {
            if (!cachedPolyrhythms.includes(polyrhythm)) {
                addNoteTimesForPolyrhythm(polyrhythm);
                cachedPolyrhythms.push(polyrhythm);
            }
        });
    };

    const handleTrackChange = () => {
        const newNoteCount = track.notes.length;
        if (newNoteCount > lastNoteCount) {
            fillInBasicNoteTimes();
        } else if (newNoteCount < lastNoteCount) {
            removeNoteTimesOfDroppedNotes();
        } else if (track.polyrhythms.length > lastPolyrhythmCount) {
            handleNewPolyrhythms();
        } else if (track.polyrhythms.length < lastPolyrhythmCount) {
            handleDroppedPolyrhythms();
        }

        lastNoteCount = newNoteCount;
        lastPolyrhythmCount = track.polyrhythms.length;
    };

    const handleTimeChange = () => {
        // Unnecessary to recalc note times when the length changes
        if (track.arrangement.timeParams.length !== lastLength) {
            lastLength = track.arrangement.timeParams.length;

            return;
        }

        for (const note of noteTimes.keys()) {
            if (track.notes.includes(note)) {
                noteTimes.set(note, timeCoordinator.convertToRealTime(note.timing));
            }
        }

        // Destroy and recreate polyrhythms for simplicity
        destroyPolyrhythms();
        handleNewPolyrhythms();
    };

    const destroySelfIfNeeded = () => {
        if (!track.arrangement.tracks.includes(track)) {
            timeCoordinator.unsubscribe(handleTimeChange);
            track.arrangement.unsubscribe(destroySelfIfNeeded);
        }
    };

    const getAudioEvent = (note: INoteView, realTime: RealTime): Event => {
        return {
            note, realTime,
            audioBuffer: note.noteStyle!.audioBuffer!
        };
    };

    const getEvents = ({ start, end }: IInterval): Event[] => {
        if (!track.instrument.loaded) {
            return [];
        }

        const events: Event[] = [];

        const noteIterator = track.getNoteIterator();
        for (const note of noteIterator) {
            const time = noteTimes.get(note)!;
            if (time > end) {
                break;
            }

            if (time >= start) {
                if (note.noteStyle) {
                    events.push(getAudioEvent(note, time));
                }
                events.push(...getMuteEvents(note, time));
                events.push(getCurrentPolyrhythmNoteEvent(note, time));
            }
        }

        return events;
    };

    const onStop = () => {
        currentPolyrhythmNote = null;
        currentPolyrhythmNotePublisher.publish();
    };

    const removeNoteTimesOfDroppedNotes = () => {
        for (const note of noteTimes.keys()) {
            if (!note.polyrhythm && !track.notes.includes(note)) {
                noteTimes.delete(note);
            }
        }
    };

    const handleDroppedPolyrhythms = () => {
        cachedPolyrhythms = cachedPolyrhythms.filter((cachedPolyrhythm) => {
            if (track.polyrhythms.includes(cachedPolyrhythm)) {
                return true;
            }

            cachedPolyrhythm.notes.forEach((note) => {
                return noteTimes.delete(note);
            });
        });
    };

    const addNoteTimesForPolyrhythm = (polyrhythm: IPolyrhythmView) => {
        const startTime = noteTimes.get(polyrhythm.start)!;

        // We need to find the note just after the polyrhythm ends to work out it's time-length
        // It's possible the next note is the start of a polyrhythm in an equal-or-higher level,
        // which we don't have times for yet.
        // So we exclude later polyrhythms from the iterator
        const laterPolyrhythms = track.polyrhythms.slice(track.polyrhythms.indexOf(polyrhythm) + 1);
        const noteIterator = track.getNoteIterator(laterPolyrhythms);
        let nextNote: INoteView | undefined;
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

        const endTime = nextNote
            ? noteTimes.get(nextNote)!
            : timeCoordinator.realTimeLength;

        const realTimeLength = endTime - startTime;
        const timePerNote = realTimeLength / polyrhythm.notes.length;

        polyrhythm.notes.forEach((note, index) => {
            return noteTimes.set(note, startTime + (index * timePerNote));
        });
    };

    const destroyPolyrhythms = () => {
        cachedPolyrhythms.forEach((polyrhythm) => {
            polyrhythm.notes.forEach((note) => {
                return noteTimes.delete(note);
            });
        });
        cachedPolyrhythms = [];
    };

    const getCurrentPolyrhythmNoteEvent = (note: INoteView, realTime: RealTime): ICallbackEvent => {
        if (note.polyrhythm) {
            return {
                realTime,
                callback: () => {
                    currentPolyrhythmNote = note;
                    currentPolyrhythmNotePublisher.publish();
                }
            };
        }

        return {
            realTime,
            callback: () => {
                currentPolyrhythmNote = null;
                currentPolyrhythmNotePublisher.publish();
            }
        };
    };

    const publisher = new Publisher();
    const noteTimes = new Map<INoteView, RealTime>();
    let cachedPolyrhythms: IPolyrhythmView[] = [];

    // We are going to light up note-viewers in polyrhythms when they play, by simply publishing the playing note
    // Later we'll investigate whether we use this for all notes. It's pretty simple.
    const currentPolyrhythmNotePublisher = new Publisher();

    // It would be better to parameterise Publisher, but that's a chunk of work
    let currentPolyrhythmNote: INoteView | null = null;

    if (track.instrument.loaded) {
        fillInBasicNoteTimes();
        handleNewPolyrhythms();
    } else {
        const setupNotes = () => {
            fillInBasicNoteTimes();
            handleNewPolyrhythms();
            track.instrument.unsubscribe(setupNotes);
        };
        track.instrument.subscribe(setupNotes);
    }

    let lastNoteCount = track.notes.length;
    let lastPolyrhythmCount = track.polyrhythms.length;
    track.subscribe(handleTrackChange);
    let lastLength = track.arrangement.timeParams.length;
    timeCoordinator.subscribe(handleTimeChange);
    track.arrangement.subscribe(destroySelfIfNeeded);
    let soloMute: SoloMute = null;

    return {
        track, getEvents, onStop,
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe,
        get soloMute() {
            return soloMute;
        },
        set soloMute(newSoloMute: SoloMute) {
            if (newSoloMute !== soloMute) {
                soloMute = newSoloMute;
                publisher.publish();
            }
        },
        currentPolyrhythmNotePublisher,
        get currentPolyrhythmNote() {
            return currentPolyrhythmNote;
        }
    };

};
