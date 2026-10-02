/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { NoteDisplayType } from "../../../core/ScoreBookDataModel.js";
import { NoteLength } from "../../../core/rest-notation.js";
import { ScoreSymbols } from "../../../core/ScoreSymbols.js";
import type { IAudioData } from "../../../core/types/general.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

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
 * note head can still be told apart. The heads are drawn like in the score, just without stems.
 */
export class NoteStyleLineIcon extends UIComponent<INoteStyleLineIconProps> {
    private static readonly size = 24;
    private static readonly lineSpacing = 7;

    public override render(): ComponentChild {
        const { entries, lineCount } = this.props;
        const { size } = NoteStyleLineIcon;

        const lines: ComponentChild[] = [];
        for (let line = 1; line <= lineCount; line++) {
            const y = this.lineY(line);
            lines.push(
                <line
                    key={`line-${line}`}
                    className="note-style-line-icon-line"
                    x1={0}
                    x2={size}
                    y1={y}
                    y2={y}
                />,
            );
        }

        const heads = entries.map((entry) => {
            const y = this.lineY(entry.line);
            const displayType = this.displayTypeOf(entry.noteStyle);

            return (
                <span
                    key={entry.noteStyle.id}
                    className="note-style-line-icon-head"
                    style={{ top: `${y}px` }}
                >
                    <ScoreSymbolView
                        symbol={ScoreSymbols.notehead(displayType, NoteLength.Quarter)}
                        staffSpace={staffSpacePx}
                        inkBox
                    />
                </span>
            );
        });

        return (
            <span className="note-style-line-icon" {...this.dataAttributes}>
                <svg
                    className="note-style-line-icon-staff"
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    aria-hidden="true"
                >
                    {lines}
                </svg>
                {heads}
            </span>
        );
    }

    /**
     * @param noteStyle The note style whose head the icon shows.
     *
     * @returns The head shape the style's own note is drawn with.
     */
    private displayTypeOf(noteStyle: IAudioData): NoteDisplayType {
        const { characteristics } = noteStyle;
        if (!("mainDisplayType" in characteristics) || characteristics.mainDisplayType === undefined) {
            return NoteDisplayType.Oval;
        }

        return characteristics.mainDisplayType;
    }

    /**
     * Computes the vertical position of a note line inside the icon. The lines use the same fixed
     * spacing as the score staff and are centered vertically. Line 1 is at the top, matching the
     * staff view. Positions snap to half pixels so the 1px strokes render crisply.
     *
     * @param line The 1-based note line.
     *
     * @returns The vertical position in pixels.
     */
    private lineY(line: number): number {
        const { lineCount } = this.props;
        const { size, lineSpacing } = NoteStyleLineIcon;

        const firstLineY = (size - ((lineCount - 1) * lineSpacing)) / 2;

        return Math.round(firstLineY + ((line - 1) * lineSpacing) - 0.5) + 0.5;
    }
}
