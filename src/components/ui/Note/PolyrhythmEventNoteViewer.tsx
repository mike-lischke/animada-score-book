/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { INoteStyle } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteStyleSymbolViewer } from "./NoteStyleSymbolViewer.js";

export interface IPolyrhythmEventNoteViewerProps extends ICommonUIProperties {
    event: {
        id: number;
        noteStyle?: INoteStyle;
    };
    instrumentColor: string;
    elementRef?: (element: HTMLDivElement | null) => void;
}

export class PolyrhythmEventNoteViewer extends UIComponent<IPolyrhythmEventNoteViewerProps> {
    public override render(): ComponentChild {
        const { elementRef, event, instrumentColor } = this.props;

        return (
            <div
                ref={elementRef}
                className="note-viewer note-width"
                style={{ backgroundColor: this.getBackgroundColor(event.noteStyle, instrumentColor) }}
            >
                <div className="note-details-viewer">
                    <NoteStyleSymbolViewer noteStyle={event.noteStyle} />
                </div>
            </div>
        );
    }

    private getBackgroundColor(noteStyle: INoteStyle | undefined, instrumentColor: string): string {
        if (noteStyle?.symbol) {
            return `color-mix(in srgb, ${instrumentColor} 50%, white)`;
        }

        return "transparent";
    }
}
