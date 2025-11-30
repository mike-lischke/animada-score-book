/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { INoteView, IPolyrhythmView, ITrackView } from "../../../core/types/general.js";
import { NoteWidthContext } from "../Arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentProperties, type IComponentState } from "../ComponentBase/ComponentBase.js";
import { NoteViewer } from "../Note/NoteViewer.js";
import { PolyrhythmViewer } from "../PolyrhythmViewer.js";
import type { TrackViewerCallbacks } from "./TrackViewer.js";

export interface INoteLineProps extends IComponentProperties {
    track: ITrackView;
    callbacks: TrackViewerCallbacks;
}

interface INoteLineState extends IComponentState {
    notes: INoteView[];
    polyrhythms: IPolyrhythmView[];
}

export class NoteLine extends ComponentBase<INoteLineProps, INoteLineState> {
    private noteLineRef = createRef<HTMLDivElement>();

    public constructor(props: INoteLineProps) {
        super(props);

        const { track } = props;
        this.state = {
            notes: [...track.notes],
            polyrhythms: [...track.polyrhythms],
        };

        track.subscribe(this.trackChanged);
    }

    public override componentDidMount(): void {
        const { track } = this.props;
        track.subscribe(this.trackChanged);
    }

    public override componentWillUnmount(): void {
        const { track } = this.props;
        track.unsubscribe(this.trackChanged);
    }

    public override componentDidUpdate(): void {
        const { polyrhythms } = this.state;

        // Adjust polyrhythms in order, since nested polyrhythms will be repositioned based on earlier polyrhythms
        polyrhythms.forEach((polyrhythm) => {
            const polyrhythmViewer = this.noteLineRef.current!
                .querySelector<HTMLDivElement>(`#polyrhythm-${polyrhythm.id}`)!;
            this.repositionPolyrhythmViewer(polyrhythm, polyrhythmViewer);
        });
    }

    public override render(): ComponentChild {
        return (
            <NoteWidthContext.Consumer>
                {(minWidth) => {
                    const { track, callbacks } = this.props;
                    const { notes } = this.state;

                    return (
                        <div
                            className="note-line"
                            ref={this.noteLineRef}
                            style={{ minWidth: minWidth }}
                            onTouchStart={callbacks.noteLineTouchStart}
                            onTouchMove={callbacks.noteLineTouchMove}
                            onTouchEnd={callbacks.noteLineTouchEnd}
                        >
                            <div className="polyrhythms-wrapper">
                                {track.polyrhythms.map((polyrhythm) => {
                                    return <PolyrhythmViewer polyrhythm={polyrhythm} key={polyrhythm.id} />;
                                })}
                            </div>
                            <div className="notes-wrapper">
                                {notes.map((note) => {
                                    return <NoteViewer note={note} key={note.id} />;
                                })}
                            </div>
                        </div >
                    );
                }}
            </NoteWidthContext.Consumer >
        );
    }

    private trackChanged = () => {
        const { track } = this.props;
        this.setState({
            notes: [...track.notes],
            polyrhythms: [...track.polyrhythms],
        });
    };

    private repositionPolyrhythmViewer(polyrhythm: IPolyrhythmView, polyrhythmViewer: HTMLDivElement) {
        const startNoteViewer = document.getElementById(`note-${polyrhythm.start.id}`);
        const endNoteViewer = document.getElementById(`note-${polyrhythm.end.id}`);

        if (!startNoteViewer || !endNoteViewer) {
            return;
        }

        let startLeft = startNoteViewer.offsetLeft;

        // Start note is inside a polyrhythm, so the offset is likely only part of the picture
        if (polyrhythm.start.polyrhythm) {
            startLeft += (startNoteViewer.closest<HTMLDivElement>(".polyrhythm-viewer")!).offsetLeft;
        }

        let endLeft = endNoteViewer.offsetLeft + endNoteViewer.offsetWidth;
        if (polyrhythm.end.polyrhythm) {
            endLeft += (endNoteViewer.closest<HTMLDivElement>(".polyrhythm-viewer")!).offsetLeft;
        }

        polyrhythmViewer.style.left = `${startLeft}px`;
        polyrhythmViewer.style.width = `calc(${endLeft - startLeft}px - var(--thick-border-width)`;
    }
};
