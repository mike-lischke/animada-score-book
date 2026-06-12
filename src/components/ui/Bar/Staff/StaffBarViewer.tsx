/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../../player/types.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import {
    SelectionGranularity, type ISelectionEntry, type ISelectionHitTester,
} from "../../../../ui/selection-types.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffBarTrackRow } from "./StaffBarTrackRow.js";
import { StaffMeasureBeam } from "./StaffMeasureBeam.js";

export interface IBarViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;

    /** Label explicitly set for this measure. */
    ownLabel?: string;

    /** Most-recent label from an earlier measure; shown dimmed when no ownLabel is set. */
    inheritedLabel?: string;

    /**
     * If given, render only these tracks (in this order) instead of all tracks of the arrangement.
     * Used by the print feature to limit output to the user's selection.
     */
    tracks?: ISbDmTrack[];
}

interface IBarViewerState {
    tracks: ISbDmTrack[];
}

/** Renders the staff-mode bar column with track rows only. */
export class StaffBarViewer extends UIComponent<IBarViewerProps, IBarViewerState>
    implements ISelectionHitTester {
    public constructor(props: IBarViewerProps) {
        super(props);

        const { arrangement, tracks } = props;
        this.state = {
            tracks: tracks ?? [...arrangement.tracks],
        };
    }

    public override componentDidMount(): void {
        const { services } = this.props;
        services.selectionManager.registerHitTester(this);

        requisitions.register("arrangementChanged", this.handleArrangementChanged);
    }

    public override componentDidUpdate(previousProps: Readonly<IBarViewerProps>): void {
        const { arrangement, tracks } = this.props;
        if (arrangement !== previousProps.arrangement || tracks !== previousProps.tracks) {
            this.setState({
                tracks: tracks ?? [...arrangement.tracks],
            });
        }
    }

    public override componentWillUnmount(): void {
        const { services } = this.props;
        services.selectionManager.unregisterHitTester(this);

        requisitions.unregister("arrangementChanged", this.handleArrangementChanged);
    }

    /**
     * Checks whether this bar's DOM element intersects the given rectangle.
     *
     * @param rect The selection rectangle in viewport coordinates.
     *
     * @returns Entries for any intersected elements, or a fallback measure entry.
     */
    public hitTest(rect: DOMRect): ISelectionEntry[] {
        const { barNumber } = this.props;
        const element = this.base as HTMLElement | null;
        if (!element) {
            return [];
        }

        const elRect = element.getBoundingClientRect();
        if (rect.right < elRect.left || rect.left > elRect.right
            || rect.bottom < elRect.top || rect.top > elRect.bottom) {
            return [];
        }

        // Tolerance (px) around note heads and stems.
        const TOLERANCE = 2;

        /**
         * Tests whether the selection rect intersects a target region defined by coordinates.
         *
         * @param sel The selection rectangle.
         * @param tLeft Left edge of the target region.
         * @param tTop Top edge of the target region.
         * @param tRight Right edge of the target region.
         * @param tBottom Bottom edge of the target region.
         * @param tolerance Extra px to expand the target on all sides.
         *
         * @returns True when the expanded target overlaps the selection rect.
         */
        const rectsIntersect = (
            sel: DOMRect, tLeft: number, tTop: number, tRight: number, tBottom: number, tolerance: number,
        ): boolean => {
            return tRight + tolerance >= sel.left && tLeft - tolerance <= sel.right
                && tBottom + tolerance >= sel.top && tTop - tolerance <= sel.bottom;
        };

        const rows = element.querySelectorAll<HTMLElement>(".bar-track-row.staff-mode");
        const noteEntries: ISelectionEntry[] = [];
        const trackPieceEntries: ISelectionEntry[] = [];

        for (const row of rows) {
            const rowRect = row.getBoundingClientRect();

            // Tuplet brackets and numbers extend above / below the row, so
            // expand the hit-test rect vertically to catch clicks on them.
            const expandedTop = rowRect.top - 30;
            const expandedBottom = rowRect.bottom + 20;

            if (!rectsIntersect(rect, rowRect.left, expandedTop, rowRect.right, expandedBottom, 0)) {
                continue;
            }

            const trackAttribute = row.getAttribute("data-track");
            if (!trackAttribute) {
                continue;
            }

            const trackId = parseInt(trackAttribute, 10);

            const noteRunElements = row.querySelectorAll<HTMLElement>(
                ".staff-note-viewer-run[data-step-index]",
            );

            let rowHasSoundingNotes = false;

            for (const runEl of noteRunElements) {
                let noteHit = false;
                const noteIdAttr = runEl.getAttribute("data-note-id");
                const isSoundingNote = noteIdAttr !== null;

                // 1. Check the .note-image SVG for notehead and stem.
                const noteImage = runEl.querySelector<HTMLElement>(".note-image");
                if (noteImage) {
                    const sr = noteImage.getBoundingClientRect();

                    if (isSoundingNote) {
                        // Notehead: bottom 29 % of the SVG height (viewBox: 0 0 60 120,
                        // notehead occupies roughly y=85..120 → 35/120 ≈ 0.29).
                        const nhTop = sr.bottom - (sr.height * 0.29);
                        noteHit = rectsIntersect(rect, sr.left, nhTop, sr.right, sr.bottom, TOLERANCE);

                        // Stem: only for notes whose stem is inside the SVG (non-beamed).
                        if (!noteHit && !runEl.querySelector(".staff-note-viewer-custom-stem")) {
                            const stemHalfW = 4;
                            const centerX = (sr.left + sr.right) / 2;
                            noteHit = rectsIntersect(
                                rect,
                                centerX - stemHalfW, sr.top + (sr.height * 0.04),
                                centerX + stemHalfW, sr.bottom - (sr.height * 0.15),
                                TOLERANCE,
                            );
                        }
                    } else {
                        // Rest: the rest symbol fills most of the SVG; use the full rect.
                        noteHit = rectsIntersect(rect, sr.left, sr.top, sr.right, sr.bottom, TOLERANCE);
                    }
                }

                // 2. CSS stem for non-oval, non-beamed notes.
                if (!noteHit) {
                    const headStem = runEl.querySelector<HTMLElement>(".staff-note-head-stem");
                    if (headStem) {
                        const r = headStem.getBoundingClientRect();
                        noteHit = rectsIntersect(rect, r.left, r.top, r.right, r.bottom, TOLERANCE);
                    }
                }

                // 3. CSS stem for beamed notes — exclude the beam area at the top
                //    (max 3 beams: 4 px each + 6 px gaps → 24 px) so that clicks
                //    in the beam zone fall through to the NoteGroup check.
                if (!noteHit) {
                    const customStem = runEl.querySelector<HTMLElement>(".staff-note-viewer-custom-stem");
                    if (customStem) {
                        const r = customStem.getBoundingClientRect();
                        const beamReserve = 24;
                        noteHit = rectsIntersect(
                            rect, r.left, r.top + beamReserve, r.right, r.bottom, TOLERANCE,
                        );
                    }
                }

                // 4. Non-oval heads: ::after pseudo-elements inside .staff-note-head.
                //    The head is 14×14 (or 11×11 diamond) at bottom:20px from the wrapper.
                if (!noteHit) {
                    const headWrapper = runEl.querySelector<HTMLElement>(".staff-note-head");
                    if (headWrapper
                        && (headWrapper.classList.contains("square")
                            || headWrapper.classList.contains("triangle")
                            || headWrapper.classList.contains("diamond"))) {
                        const hw = headWrapper.getBoundingClientRect();
                        const headHalf = 8;
                        const centerX = hw.left + (hw.width / 2);
                        // ::after is at bottom:20px, but getBoundingClientRect excludes
                        // pseudo-elements. Use the wrapper bottom as anchor and offset.
                        noteHit = rectsIntersect(
                            rect,
                            centerX - headHalf, hw.bottom - 20 - (headHalf * 2),
                            centerX + headHalf, hw.bottom - 20,
                            TOLERANCE,
                        );
                    }
                }

                // 5. Cross head (separate SVG element).
                if (!noteHit) {
                    const crossHead = runEl.querySelector<HTMLElement>(".staff-note-head-cross-svg");
                    if (crossHead) {
                        const r = crossHead.getBoundingClientRect();
                        noteHit = rectsIntersect(rect, r.left, r.top, r.right, r.bottom, TOLERANCE);
                    }
                }

                if (noteHit) {
                    const stepIndex = parseInt(runEl.getAttribute("data-step-index") ?? "", 10);
                    const noteIdAttr = runEl.getAttribute("data-note-id");
                    const noteId = noteIdAttr ? parseInt(noteIdAttr, 10) : undefined;

                    noteEntries.push({
                        granularity: SelectionGranularity.Note,
                        bar: barNumber,
                        trackId: trackId,
                        startStep: stepIndex,
                        endStep: stepIndex,
                        noteId,
                    });

                    if (noteId !== undefined) {
                        rowHasSoundingNotes = true;
                    }
                }
            }

            // If no individual notes/rests were hit, try beams → NoteGroup entries.
            if (noteEntries.filter((e) => {
                return e.trackId === trackId;
            }).length === 0) {
                const beamElements = row.querySelectorAll<HTMLElement>(".staff-note-viewer-beam");
                const hitBeamSteps = new Set<number>();

                for (const beam of beamElements) {
                    const beamRect = beam.getBoundingClientRect();
                    if (rectsIntersect(rect, beamRect.left, beamRect.top, beamRect.right, beamRect.bottom, 0)) {
                        const runParent = beam.closest<HTMLElement>(
                            ".staff-note-viewer-run[data-step-index]",
                        );

                        if (runParent) {
                            const step = parseInt(runParent.getAttribute("data-step-index") ?? "", 10);
                            if (!isNaN(step)) {
                                hitBeamSteps.add(step);
                            }
                        }
                    }
                }

                if (hitBeamSteps.size > 0) {
                    const allRuns = row.querySelectorAll<HTMLElement>(
                        ".staff-note-viewer-run[data-step-index]",
                    );

                    // Build connections from shared-right beams: step → step + extent.
                    // The beam width is `${extent * 100}%`, so parsing the percentage
                    // gives us the extent in step units.
                    const beamConnections = new Map<number, number>();

                    for (const run of allRuns) {
                        const step = parseInt(run.getAttribute("data-step-index") ?? "", 10);
                        if (isNaN(step)) {
                            continue;
                        }

                        const beam = run.querySelector<HTMLElement>(".staff-note-viewer-beam");
                        if (!beam) {
                            continue;
                        }

                        const widthStyle = beam.style.width;
                        const percentMatch = /^(\d+)%$/.exec(widthStyle);
                        if (percentMatch) {
                            const extent = parseInt(percentMatch[1], 10) / 100;
                            beamConnections.set(step, step + extent);
                        }
                    }

                    // Build reverse map for walking left.
                    const reverseConnections = new Map<number, number>();
                    for (const [from, to] of beamConnections) {
                        reverseConnections.set(to, from);
                    }

                    // Collect distinct beam groups from all hit steps.
                    const beamGroups = new Set<string>();

                    for (const hitStep of hitBeamSteps) {
                        let groupStart = hitStep;
                        while (reverseConnections.has(groupStart)) {
                            groupStart = reverseConnections.get(groupStart)!;
                        }

                        let groupEnd = hitStep;
                        while (beamConnections.has(groupEnd)) {
                            groupEnd = beamConnections.get(groupEnd)!;
                        }

                        beamGroups.add(`${groupStart}-${groupEnd}`);
                    }

                    for (const groupKey of beamGroups) {
                        const [startStr, endStr] = groupKey.split("-");
                        const groupStart = parseInt(startStr, 10);
                        const groupEnd = parseInt(endStr, 10);

                        noteEntries.push({
                            granularity: SelectionGranularity.NoteGroup,
                            bar: barNumber,
                            trackId: trackId,
                            startStep: groupStart,
                            endStep: groupEnd,
                        });
                        rowHasSoundingNotes = true;
                    }
                }
            }

            // If still no entries for this track, try tuplet bracket/number → NoteGroup.
            if (noteEntries.filter((e) => {
                return e.trackId === trackId;
            }).length === 0) {
                const tupletElements = row.querySelectorAll<HTMLElement>(
                    ".staff-note-viewer-tuplet-number, .staff-note-viewer-tuplet-bracket",
                );

                for (const tupletEl of tupletElements) {
                    const tRect = tupletEl.getBoundingClientRect();
                    if (rectsIntersect(rect, tRect.left, tRect.top, tRect.right, tRect.bottom, TOLERANCE)) {
                        // Find all run elements whose horizontal range overlaps the tuplet.
                        const runs = row.querySelectorAll<HTMLElement>(
                            ".staff-note-viewer-run[data-step-index]",
                        );
                        let minStep = Infinity;
                        let maxStep = -Infinity;

                        for (const run of runs) {
                            const rRect = run.getBoundingClientRect();
                            if (rRect.right > tRect.left && rRect.left < tRect.right) {
                                const step = parseInt(run.getAttribute("data-step-index") ?? "", 10);
                                if (!isNaN(step)) {
                                    if (step < minStep) {
                                        minStep = step;
                                    }

                                    if (step > maxStep) {
                                        maxStep = step;
                                    }
                                }
                            }
                        }

                        if (minStep !== Infinity) {
                            noteEntries.push({
                                granularity: SelectionGranularity.NoteGroup,
                                bar: barNumber,
                                trackId: trackId,
                                startStep: minStep,
                                endStep: maxStep,
                            });
                            rowHasSoundingNotes = true;
                        }

                        break;
                    }
                }
            }

            if (!rowHasSoundingNotes) {
                trackPieceEntries.push({
                    granularity: SelectionGranularity.TrackPiece,
                    bar: barNumber,
                    trackId: trackId,
                });
            }
        }

        if (noteEntries.length > 0) {
            return noteEntries;
        }

        if (trackPieceEntries.length > 0) {
            return trackPieceEntries;
        }

        return [{
            granularity: SelectionGranularity.Measure,
            bar: barNumber,
            trackId: 0,
        }];
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, arrangementPlayer, services, touchEditingEnabled, undoManager,
            dataModel, ownLabel, inheritedLabel } = this.props;
        const { tracks } = this.state;

        return (
            <div className="bar-viewer staff-mode" data-bar={barNumber}>
                <StaffMeasureBeam
                    measureNumber={barNumber}
                    ownLabel={ownLabel}
                    inheritedLabel={inheritedLabel}
                />
                {tracks.map((track) => {
                    const trackPlayer = arrangementPlayer.trackPlayers.get(track);
                    if (!trackPlayer) {
                        return null;
                    }

                    return (
                        <StaffBarTrackRow
                            key={track.id}
                            track={track}
                            barNumber={barNumber}
                            timeParams={arrangement.timeParams}
                            trackPlayer={trackPlayer}
                            arrangementPlayer={arrangementPlayer}
                            touchEditingEnabled={touchEditingEnabled}
                            services={services}
                            undoManager={undoManager}
                            dataModel={dataModel}
                        />
                    );
                })}
            </div>
        );
    }

    private handleArrangementChanged = (arrangementId: number): Promise<boolean> => {
        const { arrangement, tracks } = this.props;

        if (arrangementId !== arrangement.id) {
            return Promise.resolve(false);
        }

        this.setState({ tracks: tracks ?? [...arrangement.tracks] });

        return Promise.resolve(true);
    };
}
