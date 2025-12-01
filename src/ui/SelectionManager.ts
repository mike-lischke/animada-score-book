/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { Publisher } from "../Core/Publisher.js";
import type { INoteView, ISubscribable, ITrackView } from "../Core/types/general.js";

export interface SelectionManager extends ISubscribable {
    isSelected(note: INoteView): boolean;
    handleClick(note: INoteView): void;
    handleMouseDown(note: INoteView): void;
    handleDragSelect(note: INoteView): void;
    deselectAll(): void;
    selections: Map<ITrackView, TrackSelection>;
}

interface TrackSelection {
    selectedNotes: Set<INoteView>;
    range: [INoteView | null, INoteView | null];
}

export function createSelectionManager(): SelectionManager {
    const publisher = new Publisher();
    const trackSelections = new Map<ITrackView, TrackSelection>();
    let anchor: INoteView | null = null;

    // lastClickedNote is so we can skip rejigging selection when nothing will change
    let lastClickedNote: INoteView | null = null;

    // In select-by-drag mode, this will be the anchor
    let lastMouseDownNote: INoteView | null = null;

    return {
        isSelected, handleClick, handleMouseDown, handleDragSelect, deselectAll, selections: trackSelections,
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe
    };

    function isSelected(note: INoteView): boolean {
        if (!trackSelections.has(note.track)) {
            return false;
        }

        return trackSelections.get(note.track)!.selectedNotes.has(note);
    }

    function handleClick(clickedNote: INoteView) {
        if (clickedNote === lastClickedNote) {
            // Special case: Deselect when clicking the anchor, if it's the only note selected
            // This should only be the case if the anchor was clicked last
            if (clickedNote === anchor) {
                deselectAll();
            }

            return; // No new work to do, so just return
        }

        lastClickedNote = clickedNote;

        // Selecting one note is much easier than selecting more
        // So if we're starting a selection, or dropping down to just the anchor, we can use a simpler function
        if (!trackSelections.size || clickedNote === anchor) {
            restartSelection(clickedNote);

            return;
        }

        // Step 1: Rejig selection tracks before anything else
        recalcSelectedTracks(clickedNote);

        if (trackSelections.size === 1) {
            const trackSelection = trackSelections.get(anchor!.track)!;
            const noteIterator = anchor!.track.getNoteIterator();

            deselectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === anchor || note === clickedNote;
            });
            selectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === anchor || note === clickedNote;
            });
            deselectUntilNoMoreSelected(trackSelection, noteIterator);
        } else {
            const anchorINoteViewer = document.getElementById("note-" + anchor!.id);
            const clickedINoteViewer = document.getElementById("note-" + clickedNote.id);
            const { left: anchorLeft, right: anchorRight } = anchorINoteViewer!.getBoundingClientRect();
            const { left: clickedNoteLeft, right: clickedNoteRight } = clickedINoteViewer!.getBoundingClientRect();
            const leftBound = anchorLeft < clickedNoteLeft ? anchorLeft : clickedNoteLeft;
            const rightBound = anchorRight > clickedNoteRight ? anchorRight : clickedNoteRight;

            // In this case, we know no track contains both anchor and clickedNote. Some may not include either.
            for (const track of trackSelections.keys()) {
                const trackSelection = trackSelections.get(track)!;
                const noteIterator = track.getNoteIterator();
                const [knownNote, knownNoteIsOnLeftEdge, knownNoteIsOnRightEdge] =
                    anchor!.track === track
                        ? [anchor, anchorLeft === leftBound, anchorRight === rightBound]
                        : clickedNote.track === track
                            ? [clickedNote, clickedNoteLeft === leftBound, clickedNoteRight === rightBound]
                            : [null];

                if (knownNote) {
                    const leftEdgeTest = knownNoteIsOnLeftEdge
                        ? (note: INoteView) => {
                            return note === knownNote;
                        }
                        : getAboutHalfCoveredTest(leftBound, rightBound);
                    deselectUntilMatch(trackSelection, noteIterator, leftEdgeTest);

                    if (knownNoteIsOnRightEdge) {
                        if (!knownNoteIsOnLeftEdge) {
                            // If it's both edges, it's already been added
                            selectUntilMatch(trackSelection, noteIterator, (note) => {
                                return note === knownNote;
                            });
                        }
                    } else {
                        selectUntilNoMoreMatches(trackSelection, noteIterator,
                            getAboutHalfCoveredTest(leftBound, rightBound));
                    }

                    deselectUntilNoMoreSelected(trackSelection, noteIterator);
                } else {
                    const inclusionTest = getAboutHalfCoveredTest(leftBound, rightBound);

                    deselectUntilMatch(trackSelection, noteIterator, inclusionTest);
                    selectUntilNoMoreMatches(trackSelection, noteIterator, inclusionTest);
                    deselectUntilNoMoreSelected(trackSelection, noteIterator);
                }
            }
        }

        publisher.publish();
    }

    function handleMouseDown(note: INoteView): void {
        lastMouseDownNote = note;
    }

    function handleDragSelect(note: INoteView): void {
        if (anchor !== lastMouseDownNote) {
            restartSelection(lastMouseDownNote);
        }
        handleClick(note);
    }

    function restartSelection(note: INoteView | null) {
        trackSelections.clear();

        if (note) {
            trackSelections.set(note.track, createTrackSelection(note));
        }
        anchor = note;
        publisher.publish();
    }

    // We use a simple, inefficient algorithm to recalc selected tracks
    // This is ok. Note-selection is more optimised because there are many more notes,
    // and selecting notes involves dom-searching
    function recalcSelectedTracks(clickedNote: INoteView) {
        const allTracks = anchor!.track.arrangement.tracks;
        const anchorTrackIndex = allTracks.indexOf(anchor!.track);
        const clickedTrackIndex = allTracks.indexOf(clickedNote.track);
        const [start, end] = anchorTrackIndex < clickedTrackIndex
            ? [anchorTrackIndex, clickedTrackIndex]
            : [clickedTrackIndex, anchorTrackIndex];

        let index = 0;
        for (; index < start; index++) {
            trackSelections.delete(allTracks[index]);
        }
        for (; index <= end; index++) {
            if (!trackSelections.has(allTracks[index])) {
                trackSelections.set(allTracks[index], createTrackSelection());
            }
        }
        for (; index < allTracks.length; index++) {
            trackSelections.delete(allTracks[index]);
        }
    }

    function deselectAll() {
        if (trackSelections.size) {
            anchor = null;
            lastClickedNote = null;
            trackSelections.clear();
            publisher.publish();
        }
    }
}

function createTrackSelection(note?: INoteView): TrackSelection {
    if (note) {
        return {
            selectedNotes: new Set<INoteView>().add(note),
            range: [note, note]
        };
    }

    return {
        selectedNotes: new Set(),
        range: [null, null]
    };
}

function getAboutHalfCoveredTest(leftBound: number, rightBound: number): ((note: INoteView) => boolean) {
    const selectionWidth = rightBound - leftBound;

    return (note: INoteView) => {
        const testElement = document.getElementById("note-" + note.id)!;
        const { left, right, width } = testElement.getBoundingClientRect();

        if (right > rightBound) {
            if (left > rightBound) {
                return false;
            } // This element is to the right of the selection area, with no overlap
            if (left > leftBound) {
                return (rightBound - left) / width > 0.4;
            } // This element covers the right edge of the selection area

            // This element is wider than the selection area, and completely covers it
            return selectionWidth / width > 0.4;
        } else {
            if (right < leftBound) {
                return false;
            } // This element is to the left of the selection area, with no overlap
            if (left < leftBound) {
                return (right - leftBound) / width > 0.4;
            } // This element covers the left edge of the selection area

            return true; // This element is completely inside the selection area
        }
    };
}

/* =============== Selection Recalc Function =============== */

// It's not possible to iterate over the iterator in several small chunks, using for..of and break
// On break, the iterator does some cleanup and becomes useless. So we use while loops instead.

// First, we are before the new selection, looking for the start-note
function deselectUntilMatch(trackSelection: TrackSelection, iterator: IterableIterator<INoteView>,
    matches: (note: INoteView) => boolean) {

    while (true) {
        const done = iterator.next().done;
        if (done) {
            return; // No more notes
        }

        const note = iterator.next().value as INoteView;

        // Once we find the start-note, we enter the new selection, so this function is done
        if (matches(note)) {
            trackSelection.range[0] = note;
            trackSelection.range[1] = note; // For cases where there's only one selected note in this track
            trackSelection.selectedNotes.add(note);

            return;
        }

        // ...otherwise, any previously selected notes out here get removed from the selection
        trackSelection.selectedNotes.delete(note);
    }
}

// Inside the new selection
// Case 1: Looking for the end note and we know it's in this track
function selectUntilMatch(trackSelection: TrackSelection, iterator: IterableIterator<INoteView>,
    matches: (note: INoteView) => boolean) {

    while (true) {
        const done = iterator.next().done;
        if (done) {
            return; // No more notes
        }

        const note = iterator.next().value as INoteView;

        // Anything in here gets added to the selection
        trackSelection.selectedNotes.add(note);

        if (matches(note)) {
            trackSelection.range[1] = note;

            return;
        }
    }
}

// Inside the new selection
// Case 2: Looking until we find notes outside the selection
function selectUntilNoMoreMatches(trackSelection: TrackSelection, iterator: IterableIterator<INoteView>,
    matches: (note: INoteView) => boolean) {

    while (true) {
        const done = iterator.next().done;
        if (done) {
            return; // No more notes
        }

        const note = iterator.next().value as INoteView;

        // Keep adding notes if they match
        if (matches(note)) {
            trackSelection.selectedNotes.add(note);
            trackSelection.range[1] = note;
        } else {
            // Otherwise, remove the note from the selection and finish this loop
            trackSelection.selectedNotes.delete(note);

            return;
        }
    }
}

// And finally we are after the new selection, removing any previously selected notes
function deselectUntilNoMoreSelected(trackSelection: TrackSelection, iterator: IterableIterator<INoteView>) {
    while (true) {
        const done = iterator.next().done;
        if (done) {
            return; // No more notes
        }

        const note = iterator.next().value as INoteView;

        if (trackSelection.selectedNotes.has(note)) {
            trackSelection.selectedNotes.delete(note);
        } else {
            return;
        } // Once we find no more selected notes, we're done
    }
}
