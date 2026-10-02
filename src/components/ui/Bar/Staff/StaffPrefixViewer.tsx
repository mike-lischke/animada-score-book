/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import { staffSpacePx } from "../../../../core/MeasureLayout.js";
import type { ISbDmArrangement, ISbDmTrack } from "../../../../core/ScoreBookDataModel.js";
import { ScoreSymbols, ScoreSymbol } from "../../../../core/ScoreSymbols.js";
import { Container } from "../../framework/Container.js";
import { ScoreSymbolView } from "../../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../../framework/ui-types.js";

export interface IStaffPrefixViewerProps extends ICommonUIProperties {
    arrangement: ISbDmArrangement;
    timeSignature: string;

    /**
     * Optional override for the list of tracks to render rows for. When omitted, all tracks
     * of the arrangement are rendered. Used by the print view to filter tracks.
     */
    tracks?: ISbDmTrack[];
}

/** Renders a dedicated staff prefix column (clef + time signature) before bar 1. */
export class StaffPrefixViewer extends UIComponent<IStaffPrefixViewerProps> {
    public override render(): ComponentChild {
        const { arrangement, timeSignature, tracks: tracksOverride } = this.props;
        const tracks = tracksOverride ?? arrangement.tracks;

        const rows = tracks.map((track) => {
            return this.renderTrackRow(track, timeSignature);
        });

        return (
            <Container
                className={this.generateFinalClassName(["staff-prefix-viewer"])}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
            >
                {rows}
            </Container>
        );
    }

    private renderTrackRow(track: ISbDmTrack, timeSignature: string): ComponentChild {
        const maxNoteLine = Math.max(1, ...Object.values(track.instrument.noteStyles).map((noteStyle) => {
            return noteStyle.noteLine ?? 1;
        }));
        const centerLine = (maxNoteLine + 1) / 2;
        const staffLines: ComponentChild[] = [];

        // The staff lines match those of the note viewer: they are drawn around the line this row's staff
        // sits on, which the prefix viewer states for its rows.
        for (let i = 1; i <= maxNoteLine; i++) {
            const offset = (i - centerLine) * staffSpacePx;
            staffLines.push(
                <div key={`prefix-line-${i}`} className="staff-note-viewer-line"
                    style={{ "--staff-line-offset": `${offset}px` } as CSSProperties} />,
            );
        }

        return (
            <Container
                key={track.id}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                className="staff-prefix-row"
                aria-hidden
            >
                {staffLines}
                <div className="staff-prefix-clef">
                    <ScoreSymbolView symbol={ScoreSymbol.PercussionClef} staffSpace={staffSpacePx} />
                </div>
                {this.renderTimeSignature(timeSignature)}
            </Container>
        );
    }

    /**
     * Renders the time signature. A 4/4 is the common time glyph; every other signature stacks a row of
     * digits above a row of digits. A SMuFL digit is centred on its own baseline and two staff spaces
     * tall, so two stacked boxes of two staff spaces make up exactly the height of a staff.
     *
     * @param timeSignature The signature to draw, e.g. "4/4".
     *
     * @returns The time signature markup.
     */
    private renderTimeSignature(timeSignature: string): ComponentChild {
        if (timeSignature === "4/4") {
            return (
                <div className="staff-prefix-time-signature">
                    <ScoreSymbolView symbol={ScoreSymbol.TimeSignatureCommon} staffSpace={staffSpacePx} />
                </div>
            );
        }

        const [beatsPerBar, beatUnit] = timeSignature.split("/");

        return (
            <div className="staff-prefix-time-signature">
                <span className="staff-prefix-time-signature-half">{this.renderDigits(beatsPerBar)}</span>
                <span className="staff-prefix-time-signature-half">{this.renderDigits(beatUnit)}</span>
            </div>
        );
    }

    private renderDigits(digits: string): ComponentChild[] {
        return [...digits].map((digit, position) => {
            const symbol = ScoreSymbols.timeSignatureDigit(digit);
            if (symbol === undefined) {
                return null;
            }

            return <ScoreSymbolView key={`${digit}-${position}`} symbol={symbol} staffSpace={staffSpacePx} />;
        });
    }
}
