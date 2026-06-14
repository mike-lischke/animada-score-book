/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { getSharedAudioContext } from "../../../core/audio-context.js";
import type { ISbDmNoteEvent, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { IAudioData } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { AudioBufferPlayer } from "../../../player/AudioBufferPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { ISelectionDelta } from "../../../ui/selection-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { TouchHoldDetector } from "../TouchHoldDetector.js";
import { NoteStyleSymbolViewer } from "./NoteStyleSymbolViewer.js";

const audioContext = getSharedAudioContext();
const baseNoteClasses = "note-viewer note-width";

export interface INoteViewerProps extends ICommonUIProperties {
    note: ISbDmNoteEvent;

    trackPlayer: TrackPlayer,
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    arrangementPlayer: ArrangementPlayer;
    dataModel: ScoreBookDataModel;
    touchHoldEnabled?: boolean;
    elementRef?: (element: HTMLDivElement | null) => void;
}

interface INoteViewerState {
    isCurrent: boolean;
    selected: boolean;
    noteStyle?: IAudioData;
}

export class NoteViewer extends UIComponent<INoteViewerProps, INoteViewerState> {
    public constructor(props: INoteViewerProps) {
        super(props);

        this.state = {
            isCurrent: false,
            selected: false,
            noteStyle: props.note.audioData,
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

    public override componentDidUpdate(prevProps: INoteViewerProps): void {
        const { note } = this.props;
        if (prevProps.note !== note || prevProps.note.audioData !== note.audioData) {
            this.setState({ noteStyle: note.audioData });
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
    }

    public override render(): ComponentChild {
        const { elementRef, note, touchHoldEnabled = true } = this.props;
        const { isCurrent, selected, noteStyle } = this.state;

        const classString = this.useClasses();
        const backgroundColor = this.useBackgroundColor(isCurrent, selected);

        const noteDetails = (
            <div className="note-details-viewer">
                <NoteStyleSymbolViewer noteStyle={noteStyle} />
            </div>
        );

        return (
            <div
                ref={elementRef}
                id={`note-${note.id}`}
                className={classString}
                onClick={this.handleClick}
                onMouseMove={this.handleMouseMove}
                style={{ backgroundColor: backgroundColor }}
            >
                {touchHoldEnabled
                    ? (
                        <TouchHoldDetector
                            holdLength={1100}
                            callback={this.handleTouchHold}
                        >
                            {noteDetails}
                        </TouchHoldDetector>
                    )
                    : noteDetails}
            </div >
        );
    }

    private addSubscriptions(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
    }

    private handleSelectionChanged = (_delta: ISelectionDelta): Promise<boolean> => {
        const { note, services } = this.props;
        const { selectionManager } = services;

        this.setState({ selected: selectionManager.isSelected(note) });

        return Promise.resolve(true);
    };

    private handleClick = (event: MouseEvent) => {
        const { note, services } = this.props;
        const { selectionManager, modeManager } = services;

        if (event.shiftKey || modeManager.mobileSelectionMode) {
            selectionManager.handleClick(note);
        } else if (!modeManager.selectByMouseOverMode) {
            // We ignore the click event at the end of a select-by-mouseover action
            if (selectionManager.currentTrackSelections.size) {
                selectionManager.clearSelection();
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

    private handleTouchHold = () => {
        const { note, services } = this.props;
        const { selectionManager, modeManager } = services;
        selectionManager.handleClick(note);
        modeManager.mobileSelectionMode = true;
    };

    private useClasses(): string {
        const { note } = this.props;

        const { bar, step } = note.timing;
        const { timeSignature, stepResolution } = note.track.arrangement.timeParams;

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

        if (note.audioData?.symbol) {
            return `color-mix(in srgb, ${note.track.instrument.color} 50%, white)`;
        }

        return "transparent";
    };

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

    private getNextNoteStyle(note: ISbDmNoteEvent): IAudioData | undefined {
        const noteStyles = note.track.instrument.noteStyles;
        const noteStyleIds = Object.keys(noteStyles);
        if (!note.audioData) {
            // This happens when the note-style is null, meaning a rest
            return noteStyles[noteStyleIds[0]];
        }

        const currentNoteStyleId = note.audioData.id;
        const index = noteStyleIds.indexOf(currentNoteStyleId);
        const nextNoteStyleId = noteStyleIds[index + 1];
        if (nextNoteStyleId) {
            return noteStyles[nextNoteStyleId];
        }

        return undefined; // Cycle back to rest after all note-styles
    }

}
