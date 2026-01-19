/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* no file-level eslint disables required */

import { Publisher } from "../core/Publisher.js";
import type { INoteView, ITrackView } from "../core/types/general.js";

interface ITrackSelection {
    selectedNotes: Set<INoteView>;
    range: [INoteView | null, INoteView | null];
}

/**
 * Manages note selections across tracks and publishes selection changes.
 *
 * Inherits from `Publisher` so consumers can `subscribe`/`unsubscribe` directly.
 */
export class SelectionManager extends Publisher {
    /**
     * Current selections per track, including selected notes and range per track.
     */
    public readonly selections: Map<ITrackView, ITrackSelection> = new Map<ITrackView, ITrackSelection>();

    private anchor: INoteView | null = null;
    private lastClickedNote: INoteView | null = null;
    private lastMouseDownNote: INoteView | null = null;

    /**
     * Checks if a note is currently selected.
     *
     * @param note The note to check.
     * @returns True if the note is selected.
     */
    public isSelected(note: INoteView): boolean {
        if (!this.selections.has(note.track)) {
            return false;
        }

        return this.selections.get(note.track)!.selectedNotes.has(note);
    }

    /**
     * Handles a click on a note, updating selections accordingly.
     * - Clicking the current anchor again (and it is the only selection) will clear the selection.
     * - Clicking selects a contiguous range between the anchor and the clicked note.
     *
     * @param clickedNote The clicked note.
     */
    public handleClick(clickedNote: INoteView): void {
        // Special case: deselect when clicking the anchor if it's the only note selected.
        // This mirrors the legacy behavior where a second click on the anchor toggles it off.
        if (clickedNote === this.anchor && this.selections.size === 1) {
            const onlySelection = this.selections.get(this.anchor.track);
            const isOnlySelected = onlySelection?.selectedNotes.size === 1
                && onlySelection.selectedNotes.has(clickedNote);
            if (isOnlySelected) {
                this.deselectAll();

                return;
            }
        }

        // Selecting a single note is simpler than a range selection, so when starting from scratch
        // or re-anchoring on the same note we restart the selection using the clicked note.
        if (!this.selections.size || clickedNote === this.anchor) {
            this.restartSelection(clickedNote);

            return;
        }

        this.lastClickedNote = clickedNote;

        // Step 1: rejig selection tracks before anything else.
        this.recalcSelectedTracks(clickedNote);

        if (this.selections.size === 1) {
            const trackSelection = this.selections.get(this.anchor!.track)!;
            const noteIterator = this.anchor!.track.getNoteIterator();

            this.deselectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === this.anchor || note === clickedNote;
            });
            this.selectUntilMatch(trackSelection, noteIterator, (note) => {
                return note === this.anchor || note === clickedNote;
            });
            this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
        } else {
            const anchorINoteViewer = document.getElementById("note-" + this.anchor!.id);
            const clickedINoteViewer = document.getElementById("note-" + clickedNote.id);
            const { left: anchorLeft, right: anchorRight } = anchorINoteViewer!.getBoundingClientRect();
            const { left: clickedNoteLeft, right: clickedNoteRight } = clickedINoteViewer!.getBoundingClientRect();
            const leftBound = anchorLeft < clickedNoteLeft ? anchorLeft : clickedNoteLeft;
            const rightBound = anchorRight > clickedNoteRight ? anchorRight : clickedNoteRight;

            // In this case, we know no track contains both anchor and clickedNote. Some may not include either.
            for (const track of this.selections.keys()) {
                const trackSelection = this.selections.get(track)!;
                const noteIterator = track.getNoteIterator();
                const [knownNote, knownNoteIsOnLeftEdge, knownNoteIsOnRightEdge] =
                    this.anchor!.track === track
                        ? [this.anchor, anchorLeft === leftBound, anchorRight === rightBound]
                        : clickedNote.track === track
                            ? [clickedNote, clickedNoteLeft === leftBound, clickedNoteRight === rightBound]
                            : [null];

                if (knownNote) {
                    const leftEdgeTest = knownNoteIsOnLeftEdge
                        ? (note: INoteView) => {
                            return note === knownNote;
                        }
                        : this.getAboutHalfCoveredTest(leftBound, rightBound);
                    this.deselectUntilMatch(trackSelection, noteIterator, leftEdgeTest);

                    if (knownNoteIsOnRightEdge) {
                        if (!knownNoteIsOnLeftEdge) {
                            this.selectUntilMatch(trackSelection, noteIterator, (note) => {
                                return note === knownNote;
                            });
                        }
                    } else {
                        this.selectUntilNoMoreMatches(trackSelection, noteIterator,
                            this.getAboutHalfCoveredTest(leftBound, rightBound));
                    }

                    this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
                } else {
                    const inclusionTest = this.getAboutHalfCoveredTest(leftBound, rightBound);

                    this.deselectUntilMatch(trackSelection, noteIterator, inclusionTest);
                    this.selectUntilNoMoreMatches(trackSelection, noteIterator, inclusionTest);
                    this.deselectUntilNoMoreSelected(trackSelection, noteIterator);
                }
            }
        }

        this.publish();
    }

    /**
     * Records the note where a drag selection begins.
     *
     * @param note The note where the mouse was pressed.
     */
    public handleMouseDown(note: INoteView): void {
        this.lastMouseDownNote = note;
    }

    /**
     * Handles a drag selection up to the given note, restarting selection if necessary.
     *
     * @param note The note reached by the drag.
     */
    public handleDragSelect(note: INoteView): void {
        if (this.anchor !== this.lastMouseDownNote) {
            this.restartSelection(this.lastMouseDownNote);
        }

        this.handleClick(note);
    }

    /**
     * Clears all selection state and publishes a change.
     */
    public deselectAll(): void {
        if (this.selections.size) {
            this.anchor = null;
            this.lastClickedNote = null;
            this.selections.clear();
            this.publish();
        }
    }

    private restartSelection(note: INoteView | null): void {
        this.selections.clear();

        if (note) {
            this.selections.set(note.track, this.createTrackSelection(note));
        }

        this.anchor = note;
        this.publish();
    }

    private recalcSelectedTracks(clickedNote: INoteView): void {
        const allTracks = this.anchor!.track.arrangement.tracks;
        const anchorTrackIndex = allTracks.indexOf(this.anchor!.track);
        const clickedTrackIndex = allTracks.indexOf(clickedNote.track);
        const [start, end] = anchorTrackIndex < clickedTrackIndex
            ? [anchorTrackIndex, clickedTrackIndex]
            : [clickedTrackIndex, anchorTrackIndex];

        let index = 0;
        for (; index < start; index++) {
            this.selections.delete(allTracks[index]);
        }
        for (; index <= end; index++) {
            if (!this.selections.has(allTracks[index])) {
                this.selections.set(allTracks[index], this.createTrackSelection());
            }
        }
        for (; index < allTracks.length; index++) {
            this.selections.delete(allTracks[index]);
        }
    }

    private createTrackSelection(note?: INoteView): ITrackSelection {
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

    private getAboutHalfCoveredTest(leftBound: number, rightBound: number): ((note: INoteView) => boolean) {
        const selectionWidth = rightBound - leftBound;

        return (note: INoteView) => {
            const testElement = document.getElementById("note-" + note.id)!;
            const { left, right, width } = testElement.getBoundingClientRect();

            if (right > rightBound) {
                if (left > rightBound) {
                    // This element is to the right of the selection area, with no overlap.
                    return false;
                }
                if (left > leftBound) {
                    // This element covers the right edge of the selection area.
                    return (rightBound - left) / width > 0.4;
                }
                // This element is wider than the selection area, and completely covers it.

                return selectionWidth / width > 0.4;
            } else {
                if (right < leftBound) {
                    // This element is to the left of the selection area, with no overlap.
                    return false;
                }
                if (left < leftBound) {
                    // This element covers the left edge of the selection area.
                    return (right - leftBound) / width > 0.4;
                }
                // This element is completely inside the selection area.

                return true;
            }
        };
    }

    private deselectUntilMatch(trackSelection: ITrackSelection, iterator: IterableIterator<INoteView>,
        matches: (note: INoteView) => boolean): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (matches(note)) {
                trackSelection.range[0] = note;
                // For cases where there's only one selected note in this track.
                trackSelection.range[1] = note;
                trackSelection.selectedNotes.add(note);

                return;
            }

            trackSelection.selectedNotes.delete(note);
        }
    }

    private selectUntilMatch(
        trackSelection: ITrackSelection,
        iterator: IterableIterator<INoteView>,
        matches: (note: INoteView) => boolean
    ): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;
            trackSelection.selectedNotes.add(note);

            if (matches(note)) {
                trackSelection.range[1] = note;

                return;
            }
        }
    }

    private selectUntilNoMoreMatches(
        trackSelection: ITrackSelection,
        iterator: IterableIterator<INoteView>,
        matches: (note: INoteView) => boolean
    ): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (matches(note)) {
                trackSelection.selectedNotes.add(note);
                trackSelection.range[1] = note;
            } else {
                trackSelection.selectedNotes.delete(note);

                return;
            }
        }
    }

    private deselectUntilNoMoreSelected(trackSelection: ITrackSelection, iterator: IterableIterator<INoteView>): void {
        while (true) {
            const next = iterator.next();
            if (next.done) {
                return;
            }

            const note = next.value;

            if (trackSelection.selectedNotes.has(note)) {
                trackSelection.selectedNotes.delete(note);
            } else {
                return;
            } // Once we find no more selected notes, we're done.
        }
    }
}
