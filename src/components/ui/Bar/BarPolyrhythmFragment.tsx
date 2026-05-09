/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import type { IEventPolyrhythmGroup } from "../PolyrhythmEventGroupBuilder.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { PolyrhythmEventNoteViewer } from "../Note/PolyrhythmEventNoteViewer.js";

export interface IBarPolyrhythmFragmentProps extends ICommonUIProperties {
    group: IEventPolyrhythmGroup;
    instrumentColor: string;
    elementRef?: (element: HTMLDivElement | null) => void;
    noteElementRef?: (noteId: number) => (element: HTMLDivElement | null) => void;

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

/**
 * Renders the slice of a polyrhythm that falls within a single bar, with bracket decoration
 * appropriate for its position in the polyrhythm span.
 */
export class BarPolyrhythmFragment
    extends UIComponent<IBarPolyrhythmFragmentProps> {

    public override render(): ComponentChild {
        const { elementRef, group, instrumentColor, noteElementRef } = this.props;

        return (
            <div
                ref={elementRef}
                className="polyrhythm-fragment frag-full"
            >
                <div className="polyrhythm-decoration" />
                <div className="polyrhythm-notes-wrapper">
                    {group.events.map((event) => {
                        return (
                            <PolyrhythmEventNoteViewer
                                event={event}
                                key={event.id}
                                instrumentColor={instrumentColor}
                                elementRef={noteElementRef?.(event.id)}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }
}
