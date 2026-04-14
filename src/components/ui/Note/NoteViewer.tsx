/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { ISbDmNote, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { INoteStyle } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { isSameTiming } from "../../../core/utils.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { AudioBufferPlayer } from "../../../player/AudioBufferPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { TouchHoldDetector } from "../TouchHoldDetector.js";
import { NoteStyleSymbolViewer } from "./NoteStyleSymbolViewer.js";

const audioContext = new AudioContext();
const baseNoteClasses = "note-viewer note-width";

export interface INoteViewerProps extends ICommonUIProperties {
    note: ISbDmNote;

    trackPlayer: TrackPlayer,
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
}

interface INoteViewerState {
    isCurrent: boolean;
    selected: boolean;
    noteStyle?: INoteStyle;
}

export class NoteViewer extends UIComponent<INoteViewerProps, INoteViewerState> {
    //private timingChangeUnsubscribe?: () => void;
    private selectionChangeUnsubscribe?: () => void;
    private noteStyleChangeUnsubscribe?: () => void;

    private readonly viewerRef = createRef<HTMLDivElement>();

    public constructor(props: INoteViewerProps) {
        super(props);

        this.state = {
            isCurrent: false,
            selected: false,
            noteStyle: props.note.noteStyle,
        };
    }

    public static getParityClass(bar: number, step: number, timeSignature: string,
        stepResolution: number): string {
        if (timeSignature === "4/4" && stepResolution === 16) {
            const beat = Math.floor((step - 1) / 4) + 1;
            const beatIsEven = beat % 2 === 0;

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "6/8" && stepResolution === 8) {
            const beat = Math.floor((step - 1) / 3) + 1;
            const beatIsEven = beat % 2 === 0;

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "5/4" && stepResolution === 8) {
            const beat = Math.floor((step - 1) / 2) + 1;
            let beatIsEven = beat % 2 === 0;
            if (bar % 2 === 0) {
                beatIsEven = !beatIsEven;
            } // 5 groups in each bar, so swap every bar

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        if (timeSignature === "7/8" && stepResolution === 8) {
            return (step === 1 || step === 3 || step === 5) ? "odd-beat" : "even-beat";
        }

        const [beatsPerBar, beatUnit] = timeSignature.split("/").map((str) => {
            return Number(str);
        });

        const stepsPerBeat = stepResolution / beatUnit;
        if (stepsPerBeat > 1) {
            const beat = Math.floor((step - 1) / stepsPerBeat) + 1;
            let beatIsEven = beat % 2 === 0;
            if (beatsPerBar % 2 === 1 && bar % 2 === 0) {
                beatIsEven = !beatIsEven;
            } // odd number of groups in each bar, so swap every bar

            return beatIsEven ? "even-beat" : "odd-beat";
        }

        // If all else fails, we just alternate each note
        const stepsPerBar = stepsPerBeat * beatsPerBar;
        const stepIsEven = (((bar - 1) * stepsPerBar) + step - 1) % 2 === 0;

        return stepIsEven ? "even-beat" : "odd-beat";
    }

    public override componentDidMount(): void {
        this.addSubscriptions();
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        //this.timingChangeUnsubscribe?.();
        this.selectionChangeUnsubscribe?.();
        this.noteStyleChangeUnsubscribe?.();
    }

    public override render(): ComponentChild {
        const { note } = this.props;
        const { isCurrent, selected, noteStyle } = this.state;

        const classString = this.useClasses();
        const backgroundColor = this.useBackgroundColor(isCurrent, selected);

        return (
            <div
                ref={this.viewerRef}
                id={`note-${note.id}`}
                className={classString}
                onClick={this.handleClick}
                onMouseDown={this.handleMouseDown}
                onMouseMove={this.handleMouseMove}
                style={{ backgroundColor: backgroundColor }}
            >
                <TouchHoldDetector
                    holdLength={1100}
                    callback={this.handleTouchHold}
                >
                    <div className="note-details-viewer">
                        <NoteStyleSymbolViewer noteStyle={noteStyle} />
                    </div>
                </TouchHoldDetector>
            </div >
        );
    }

    private addSubscriptions(): void {
        const { note, services } = this.props;
        const { selectionManager } = services;

        /*const timingPublisher = note.polyrhythm
            ? trackPlayer.currentPolyrhythmNotePublisher
            : arrangementPlayer.currentTimingPublisher;

        this.timingChangeUnsubscribe = timingPublisher.subscribe(this.timingChanged);*/
        this.selectionChangeUnsubscribe = selectionManager.subscribe(this.selectionChanged);
        this.noteStyleChangeUnsubscribe = note.subscribe(this.noteStyleChanged);
    }

    private timingChanged = (): void => {
        // No longer used. We keep it around for now in case we need to use it in the future.
    };

    private noteStyleChanged = (): void => {
        const { note } = this.props;
        this.setState({ noteStyle: note.noteStyle });
    };

    private selectionChanged = (): void => {
        const { note, services } = this.props;
        const { selectionManager } = services;

        this.setState({ selected: selectionManager.isSelected(note) });
    };

    private handleClick = (event: MouseEvent) => {
        const { note, services } = this.props;
        const { selectionManager, modeManager } = services;

        if (event.shiftKey || modeManager.mobileSelectionMode) {
            selectionManager.handleClick(note);
        } else if (!modeManager.selectByMouseOverMode) {
            // We ignore the click event at the end of a select-by-mouseover action
            if (selectionManager.selections.size) {
                selectionManager.deselectAll();
            } else {
                this.cycleNoteStyle();
            }
        }

        event.stopPropagation();
    };

    private handleMouseMove = (event: MouseEvent) => {
        const { note, services } = this.props;
        const { selectionManager, modeManager } = services;

        // Primary button, and no others, is held down
        if (modeManager.selectByMouseOverMode && event.buttons === 1) {
            selectionManager.handleDragSelect(note);
        }
    };

    private handleMouseDown = () => {
        const { note, services } = this.props;
        const { selectionManager } = services;
        selectionManager.handleMouseDown(note);
    };

    private handleTouchHold = () => {
        const { note, services } = this.props;
        const { selectionManager, modeManager } = services;
        selectionManager.handleClick(note);
        modeManager.mobileSelectionMode = true;
    };

    private useClasses(): string {
        const { note } = this.props;

        const inPolyrhythm = note.polyrhythm !== undefined;
        const { bar, step } = note.timing;
        const { timeSignature, stepResolution } = note.track.arrangement.timeParams;

        if (inPolyrhythm) {
            return baseNoteClasses;
        }

        const classes = [baseNoteClasses];

        classes.push(NoteViewer.getParityClass(bar, step, timeSignature, stepResolution));

        if (step === 1) {
            classes.push("startOfBar");
        }

        return classes.join(" ");
    }

    private useBackgroundColor = (isCurrent: boolean, selected: boolean): string => {
        const { note } = this.props;

        if (isCurrent) {
            return "var(--light-yellow)";    // Light up notes as the music plays
        }

        if (selected) {
            return note.track.instrument.color;
        }

        if (note.noteStyle?.symbol) {
            return `color-mix(in srgb, ${note.track.instrument.color} 50%, white)`;
        }

        return "transparent";
    };

    private isCurrentlyPlaying(): boolean {
        const { arrangementPlayer, trackPlayer } = this.props;
        const { note } = this.props;

        if (note.polyrhythm) {
            return trackPlayer.currentPolyrhythmNote === note;
        }

        if (!arrangementPlayer.currentTiming) {
            return false;
        }

        return isSameTiming(arrangementPlayer.currentTiming, note.timing);
    }

    private cycleNoteStyle() {
        const { note, undoManager, dataModel } = this.props;
        const noteStyle = this.getNextNoteStyle(note);

        undoManager.edit({ type: "EditCommand_Note", note, noteStyle });
        if (noteStyle?.audioBuffer) {
            // Play a preview of the selected note style.
            const arrangement = dataModel.arrangement!;
            new AudioBufferPlayer(noteStyle.audioBuffer, audioContext, 0, arrangement.mainVolume / 100);
        }
    }

    private getNextNoteStyle(note: ISbDmNote): INoteStyle | undefined {
        const noteStyles = note.track.instrument.noteStyles;
        const noteStyleIds = Object.keys(noteStyles);
        if (!note.noteStyle) {
            // This happens when the note-style is null, meaning a rest
            return noteStyles[noteStyleIds[0]];
        }

        const currentNoteStyleId = note.noteStyle.id;
        const index = noteStyleIds.indexOf(currentNoteStyleId);
        const nextNoteStyleId = noteStyleIds[index + 1];
        if (nextNoteStyleId) {
            return noteStyles[nextNoteStyleId];
        }

        return undefined; // Cycle back to rest after all note-styles
    }

}
