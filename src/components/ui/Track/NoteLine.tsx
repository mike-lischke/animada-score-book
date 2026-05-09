/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { ISbDmNoteEvent, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { PolyrhythmEventGroupBuilder, type IEventPolyrhythmGroup } from "../PolyrhythmEventGroupBuilder.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { PolyrhythmViewer } from "../PolyrhythmViewer.js";
import type { ITrackViewerCallbacks } from "./TrackViewer.js";

export interface INoteLineProperties extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
    track: ISbDmTrack;
    callbacks: ITrackViewerCallbacks;

    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface INoteLineState {
    notes: ISbDmNoteEvent[];
    polyrhythmGroups: IEventPolyrhythmGroup[];
}

export class NoteLine extends UIComponent<INoteLineProperties, INoteLineState> {
    private noteLineRef = createRef<HTMLDivElement>();
    private noteElements = new Map<number, HTMLDivElement>();
    private polyrhythmElements = new Map<string, HTMLDivElement>();

    public constructor(props: INoteLineProperties) {
        super(props);

        const { track } = props;
        this.state = this.getTrackDisplayData(track);
    }

    public override componentDidMount(): void {
        const { track } = this.props;
        this.addSubscription(track, this.trackChanged);
    }

    public override componentDidUpdate(prevProps: INoteLineProperties, prevState: INoteLineState): void {
        super.componentDidUpdate(prevProps, prevState);

        const { polyrhythmGroups } = this.state;

        polyrhythmGroups.forEach((group) => {
            const polyrhythmViewer = this.polyrhythmElements.get(group.key);
            if (polyrhythmViewer) {
                this.repositionPolyrhythmViewer(group, polyrhythmViewer);
            }
        });
    }

    public override render(): ComponentChild {
        const { callbacks, dataModel, arrangementPlayer, services, track, trackPlayer, undoManager } = this.props;
        const { notes, polyrhythmGroups } = this.state;

        return (
            <div
                className="note-line"
                ref={this.noteLineRef}
                onTouchStart={callbacks.noteLineTouchStart}
                onTouchMove={callbacks.noteLineTouchMove}
                onTouchEnd={callbacks.noteLineTouchEnd}
            >
                <div className="polyrhythms-wrapper">
                    {polyrhythmGroups.map((group) => {
                        return <PolyrhythmViewer
                            group={group}
                            key={group.key}
                            instrumentColor={track.instrument.color}
                            elementRef={this.getPolyrhythmElementRef(group.key)}
                            noteElementRef={this.getNoteElementRef}
                            trackPlayer={trackPlayer}
                            arrangementPlayer={arrangementPlayer}
                            services={services}
                            undoManager={undoManager}
                            dataModel={dataModel}
                        />;
                    })}
                </div>
                <div className="notes-wrapper">
                    {notes.map((note) => {
                        return <NoteViewer
                            note={note}
                            key={note.id}
                            elementRef={this.getNoteElementRef(note.id)}
                            trackPlayer={trackPlayer}
                            arrangementPlayer={arrangementPlayer}
                            services={services}
                            undoManager={undoManager}
                            dataModel={dataModel}
                        />;
                    })}
                </div>
            </div >
        );
    }

    private trackChanged = () => {
        const { track } = this.props;
        this.setState(this.getTrackDisplayData(track));
    };

    private getTrackDisplayData(track: ISbDmTrack): INoteLineState {
        const { arrangementPlayer } = this.props;
        const notes = track.arrangement.timeParams.timings
            .map((timing) => {
                return track.getNoteAt(timing);
            })
            .filter((note): note is ISbDmNoteEvent => {
                return note !== undefined;
            });

        return {
            notes,
            polyrhythmGroups: new PolyrhythmEventGroupBuilder(track, arrangementPlayer.scoreMetrics.stepsPerBar)
                .build(),
        };
    }

    private repositionPolyrhythmViewer(group: IEventPolyrhythmGroup, polyrhythmViewer: HTMLDivElement): void {
        const startNoteViewer = this.noteElements.get(group.startNoteId);
        const endNoteViewer = this.noteElements.get(group.endNoteId);
        const noteLine = this.noteLineRef.current;

        if (!startNoteViewer || !endNoteViewer || !noteLine) {
            return;
        }

        const noteLineRect = noteLine.getBoundingClientRect();
        const startRect = startNoteViewer.getBoundingClientRect();
        const endRect = endNoteViewer.getBoundingClientRect();
        const startLeft = startRect.left - noteLineRect.left;
        const endLeft = endRect.right - noteLineRect.left;

        polyrhythmViewer.style.left = `${startLeft}px`;
        polyrhythmViewer.style.width = `${endLeft - startLeft}px`;
    }

    private getNoteElementRef = (noteId: number) => {
        return (element: HTMLDivElement | null) => {
            if (element) {
                this.noteElements.set(noteId, element);
            } else {
                this.noteElements.delete(noteId);
            }
        };
    };

    private getPolyrhythmElementRef = (groupKey: string) => {
        return (element: HTMLDivElement | null) => {
            if (element) {
                this.polyrhythmElements.set(groupKey, element);
            } else {
                this.polyrhythmElements.delete(groupKey);
            }
        };
    };
};
