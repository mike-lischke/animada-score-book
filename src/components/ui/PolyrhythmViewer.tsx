/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../player/types.js";
import type { IEventPolyrhythmGroup } from "./PolyrhythmEventGroupBuilder.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { PolyrhythmEventNoteViewer } from "./Note/PolyrhythmEventNoteViewer.js";

export interface IPolyrhythmViewerProps extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
    group: IEventPolyrhythmGroup;
    instrumentColor: string;
    elementRef?: (element: HTMLDivElement | null) => void;
    noteElementRef?: (noteId: number) => (element: HTMLDivElement | null) => void;

    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

export class PolyrhythmViewer extends UIComponent<IPolyrhythmViewerProps> {

    public override render(): ComponentChild {
        const { elementRef, group, instrumentColor, noteElementRef } = this.props;

        return (
            <div ref={elementRef} className="polyrhythm-viewer" >
                <div className="polyrhythm-decoration" ></div>
                <div className="polyrhythm-notes-wrapper">
                    {group.events.map((event) => {
                        return <PolyrhythmEventNoteViewer
                            event={event}
                            key={event.id}
                            instrumentColor={instrumentColor}
                            elementRef={noteElementRef?.(event.id)}
                        />;
                    })}
                </div>
            </div >
        );
    }
}
