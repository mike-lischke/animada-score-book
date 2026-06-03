/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack } from "../../../../core/ScoreBookDataModel.js";
import { Image, PredefinedImage } from "../../framework/Image.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { Container } from "../../framework/Container.js";
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
        const [beatsPerBar, beatUnit] = timeSignature.split("/");
        const tracks = tracksOverride ?? arrangement.tracks;

        return (
            <Container
                className={this.generateFinalClassName(["staff-prefix-viewer"])}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
            >
                {tracks.map((track) => {
                    const maxNoteLine = Math.max(1, ...Object.values(track.instrument.noteStyles).map((ns) => {
                        return ns.noteLine ?? 1;
                    }));
                    const centerLine = (maxNoteLine + 1) / 2;

                    // Render staff lines matching those in StaffNoteViewer.
                    const staffLines: ComponentChild[] = [];
                    for (let i = 1; i <= maxNoteLine; i++) {
                        const offset = (i - centerLine) * 10;
                        staffLines.push(
                            <div
                                key={`prefix-line-${i}`}
                                className="staff-note-viewer-line"
                                style={{ top: `calc(50% + ${offset}px)` }}
                            />,
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
                            <div className="staff-prefix-clef" />
                            <div className="staff-prefix-time-signature">
                                {timeSignature === "4/4"
                                    ? (
                                        <Image
                                            className="staff-prefix-common-time"
                                            src={PredefinedImage.CommonTime}
                                            alt="Common time"
                                        />
                                    )
                                    : (
                                        <>
                                            <span className="top">{beatsPerBar}</span>
                                            <span className="bottom">{beatUnit}</span>
                                        </>
                                    )}
                            </div>
                        </Container>
                    );
                })}
            </Container>
        );
    }
}
