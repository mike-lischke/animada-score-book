/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { IAudioData } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteStyleIcon } from "./NoteStyleIcon.js";

export interface INoteStyleLineEntry {
    noteStyle: IAudioData;

    /** The 1-based note line the style sits on. */
    line: number;
}

export interface INoteStyleLineIconProps extends ICommonUIProperties {
    /** The styles to render, each positioned on its line. */
    entries: INoteStyleLineEntry[];

    /** Total number of staff lines for the instrument (1..4). */
    lineCount: number;
}

/**
 * Renders a compact staff snippet with the given note styles placed on their note lines. Used in
 * the note style toolbar to show which line a note style belongs to, so styles that share the same
 * note head can still be told apart.
 */
export class NoteStyleLineIcon extends UIComponent<INoteStyleLineIconProps> {
    public override render(): ComponentChild {
        const { entries, lineCount } = this.props;

        const lines: ComponentChild[] = [];
        for (let line = 1; line <= lineCount; line++) {
            lines.push(
                <span key={`line-${line}`} className="note-style-line-icon-line" style={{ top: this.lineTop(line) }} />,
            );
        }

        const heads = entries.map((entry) => {
            return (
                <span
                    key={entry.noteStyle.id}
                    className="note-style-line-icon-head"
                    style={{ top: this.lineTop(entry.line) }}
                >
                    <NoteStyleIcon noteStyle={entry.noteStyle} />
                </span>
            );
        });

        return (
            <span className="note-style-line-icon" {...this.dataAttributes}>
                {lines}
                {heads}
            </span>
        );
    }

    /**
     * Computes the vertical position of a note line as a percentage of the icon height. Line 1 is
     * at the top and the last line at the bottom, matching the staff view.
     *
     * @param line The 1-based note line.
     *
     * @returns The vertical position as a CSS percentage.
     */
    private lineTop(line: number): string {
        const { lineCount } = this.props;

        if (lineCount <= 1) {
            return "50%";
        }

        return `${((line - 1) / (lineCount - 1)) * 100}%`;
    }
}
