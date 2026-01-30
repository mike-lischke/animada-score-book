/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { ISbDmNote } from "../../../core/ScoreBookDataModel.js";
import type { INoteStyle, ISubscribable } from "../../../core/types/general.js";
import { isSameTiming } from "../../../core/utils.js";
import { AudioBufferPlayer } from "../../../player/AudioBufferPlayer.js";
import { getTrackColour } from "../../../ui/track-colour.js";
import { ArrangementPlayerContext } from "../Arrangement/ArrangementViewer.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { AnimadaScoreBookContext, ServicesContext } from "../ScoreBookViewer.js";
import { TouchHoldDetector } from "../TouchHoldDetector.js";
import { TrackPlayerContext } from "../Track/TrackViewer.js";
import { NoteStyleSymbolViewer } from "./NoteStyleSymbolViewer.js";

const audioContext = new AudioContext();
const baseNoteClasses = "note-viewer note-width";

export interface INoteViewerProps extends ICommonUIProperties {
    note: ISbDmNote;
}

interface INoteViewerState {
    isCurrent: boolean;
    selected: boolean;
    noteStyle?: INoteStyle;
}

export class NoteViewer extends UIComponent<INoteViewerProps, INoteViewerState> {
    private arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>;
    private trackPlayerContext?: ContextType<typeof TrackPlayerContext>;
    private servicesContext?: ContextType<typeof ServicesContext>;
    private scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>;

    public constructor(props: INoteViewerProps) {
        super(props);

        this.state = {
            isCurrent: false,
            selected: false,
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

    public override componentWillUnmount(): void {
        this.trackPlayerContext!.currentPolyrhythmNotePublisher.unsubscribe(this.timingChanged);
        this.arrangementPlayerContext!.currentTimingPublisher.unsubscribe(this.timingChanged);

        const { selectionManager } = this.servicesContext!;
        selectionManager.unsubscribe(this.selectionChanged);
    }

    public override render(): ComponentChild {
        const { note } = this.props;
        const { isCurrent, selected, noteStyle } = this.state;

        const classString = this.useClasses();
        const backgroundColor = this.useBackgroundColor(isCurrent, selected);

        return (
            <AnimadaScoreBookContext.Consumer>
                {(scoreBookContext) => {
                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(arrangementPlayerContext) => {
                                return (
                                    <TrackPlayerContext.Consumer>
                                        {(trackPlayerContext) => {
                                            return (
                                                <ServicesContext.Consumer>
                                                    {(servicesContext) => {
                                                        this.useContexts(arrangementPlayerContext, trackPlayerContext,
                                                            servicesContext, scoreBookContext);

                                                        return (
                                                            <div
                                                                id={`note-${note.id}`}
                                                                className={classString}
                                                                onClick={this.handleClick}
                                                                onMouseDown={this.handleMouseDown}
                                                                onMouseMove={this.handleMouseMove}
                                                                style={{ backgroundColor }}
                                                            >
                                                                <TouchHoldDetector
                                                                    holdLength={1100}
                                                                    callback={this.handleTouchHold}
                                                                >
                                                                    <div className="note-details-viewer" >
                                                                        <NoteStyleSymbolViewer noteStyle={noteStyle} />
                                                                    </div>
                                                                </TouchHoldDetector>
                                                            </div >
                                                        );

                                                    }}
                                                </ServicesContext.Consumer>
                                            );
                                        }}
                                    </TrackPlayerContext.Consumer>
                                );
                            }}
                        </ArrangementPlayerContext.Consumer>
                    );
                }}
            </AnimadaScoreBookContext.Consumer>
        );
    }

    private useContexts(
        arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>,
        trackPlayerContext?: ContextType<typeof TrackPlayerContext>,
        servicesContext?: ContextType<typeof ServicesContext>,
        scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>,
    ): void {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;
            this.trackPlayerContext = trackPlayerContext;
            this.servicesContext = servicesContext;
            this.scoreBookContext = scoreBookContext;

            if (arrangementPlayerContext && trackPlayerContext) {
                this.setState({ isCurrent: this.isCurrentlyPlaying() });
            }

            const { note } = this.props;

            const { selectionManager } = this.servicesContext!;
            const timingPublisher: ISubscribable = note.polyrhythm
                ? this.trackPlayerContext!.currentPolyrhythmNotePublisher
                : this.arrangementPlayerContext!.currentTimingPublisher;

            timingPublisher.subscribe(this.timingChanged);
            selectionManager.subscribe(this.selectionChanged);

            this.setState({ noteStyle: note.noteStyle });
        }
    }

    private timingChanged = (): void => {
        this.setState({ isCurrent: this.isCurrentlyPlaying() });
    };

    private selectionChanged = (): void => {
        const { note } = this.props;
        const { selectionManager } = this.servicesContext!;

        this.setState({ selected: selectionManager.isSelected(note) });
    };

    private handleClick = (event: MouseEvent) => {
        const { note } = this.props;
        const { selectionManager, modeManager } = this.servicesContext!;

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
        const { note } = this.props;
        const { selectionManager, modeManager } = this.servicesContext!;

        // Primary button, and no others, is held down
        if (modeManager.selectByMouseOverMode && event.buttons === 1) {
            selectionManager.handleDragSelect(note);
        }
    };

    private handleMouseDown = () => {
        const { note } = this.props;
        const { selectionManager } = this.servicesContext!;
        selectionManager.handleMouseDown(note);
    };

    private handleTouchHold = () => {
        const { note } = this.props;
        const { selectionManager, modeManager } = this.servicesContext!;
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
            classes.push("start-of-bar");
        }

        return classes.join(" ");
    }

    private useBackgroundColor(isCurrent: boolean, selected: boolean) {
        const { note } = this.props;

        return isCurrent
            ? "var(--light-yellow)"    // Light up notes as the music plays
            : selected
                ? this.getSelectedColour(note.track.instrument.colourGroup)
                : note.noteStyle
                    ? getTrackColour(note.track)  // Otherwise, give active notes the track colour
                    : "";                         // Inactive notes have no inline background colour
    }

    private isCurrentlyPlaying(): boolean {
        if (!this.arrangementPlayerContext || !this.trackPlayerContext) {
            return false;
        }

        const { note } = this.props;

        if (note.polyrhythm) {
            return this.trackPlayerContext.currentPolyrhythmNote === note;
        }

        if (this.arrangementPlayerContext.currentTiming === null) {
            return false;
        }

        return isSameTiming(this.arrangementPlayerContext.currentTiming, note.timing);
    }

    private cycleNoteStyle() {
        const { note } = this.props;
        const noteStyle = this.getNextNoteStyle(note);

        this.scoreBookContext?.edit({ type: "EditCommand_Note", note, noteStyle });
        if (noteStyle?.audioBuffer) {
            // Play a preview of the selected note style.
            // Default start time (0) is fine here.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const _player = new AudioBufferPlayer(noteStyle.audioBuffer, audioContext);
            void audioContext.resume();
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

    private getSelectedColour(colourGroup: string) {
        switch (colourGroup) {
            case "yellow": return `var(--secondary-purple)`;
            case "orange": return `var(--secondary-blue)`;
            case "green": return `var(--secondary-red)`;
            case "blue": return `var(--secondary-orange)`;
            case "purple": return `var(--secondary-green)`;
        }
    }
}
