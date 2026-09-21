/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel }
    from "../../../../core/ScoreBookDataModel.js";
import type { ArrangementPlayer } from "../../../../player/ArrangementPlayer.js";
import {
    MeasureProjection, NoteGroupKind, type INoteGroup, type INotationGrid,
} from "../../../../core/MeasureProjection.js";
import { addFractions, compareFractions } from "../../../../core/serialisation/numeric-functions.js";
import type { IMeasureEvent } from "../../../../core/types/general.js";
import { requisitions } from "../../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../../ui/SelectionManager.js";
import {
    ScoreElementKind, type ScoreElementRegistry,
} from "../../../../ui/ScoreElementRegistry.js";
import {
    SelectionGranularity, SelectionSerializer, type ISelectionEntry, type ISelectionHitTester,
} from "../../../../ui/SelectionSerializer.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffMeasureTrackRow } from "./StaffMeasureTrackRow.js";

/** Tolerance in px around note heads, stems and group markers when a hit region is tested. */
const hitTolerance = 2;

/**
 * Tests whether a selection rectangle touches a rectangular region.
 *
 * @param selection The selection rectangle in viewport coordinates.
 * @param left Left edge of the region.
 * @param top Top edge of the region.
 * @param right Right edge of the region.
 * @param bottom Bottom edge of the region.
 * @param tolerance Extra px added to the region on all sides.
 *
 * @returns True when the expanded region overlaps the selection rectangle.
 */
const rectsIntersect = (selection: DOMRect, left: number, top: number, right: number, bottom: number,
    tolerance: number): boolean => {
    return right + tolerance >= selection.left && left - tolerance <= selection.right
        && bottom + tolerance >= selection.top && top - tolerance <= selection.bottom;
};

/**
 * Tests whether the selection rectangle touches a rendered element.
 *
 * @param selection The selection rectangle in viewport coordinates.
 * @param element The element to test.
 *
 * @returns True when the element's bounds overlap the selection rectangle.
 */
const touchesElement = (selection: DOMRect, element: HTMLElement): boolean => {
    const bounds = element.getBoundingClientRect();

    return rectsIntersect(selection, bounds.left, bounds.top, bounds.right, bounds.bottom, hitTolerance);
};

/**
 * Orders the groups a selection touched by their position in the measure.
 *
 * @param groups The groups to order.
 *
 * @returns The groups, earliest first.
 */
const groupsInMeasureOrder = (groups: INoteGroup[]): INoteGroup[] => {
    return groups.sort((first, second) => {
        return compareFractions(first.start, second.start);
    });
};

export interface IStaffMeasureViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    inEditMode: boolean;
    selectionManager: SelectionManager;
    dataModel: ScoreBookDataModel;
    scoreElementRegistry?: ScoreElementRegistry;

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

interface IStaffMeasureViewerState {
    tracks: ISbDmTrack[];
}

/** Renders the staff-mode measure column with track rows only. */
export class StaffMeasureViewer extends UIComponent<IStaffMeasureViewerProps, IStaffMeasureViewerState>
    implements ISelectionHitTester {
    public constructor(props: IStaffMeasureViewerProps) {
        super(props);

        const { arrangement, tracks } = props;
        this.state = {
            tracks: tracks ?? [...arrangement.tracks],
        };
    }

    public override componentDidMount(): void {
        const { selectionManager } = this.props;
        selectionManager.registerHitTester(this);

        requisitions.register("arrangementChanged", this.handleArrangementChanged);
    }

    public override componentDidUpdate(previousProps: Readonly<IStaffMeasureViewerProps>): void {
        const { arrangement, tracks } = this.props;
        if (arrangement !== previousProps.arrangement || tracks !== previousProps.tracks) {
            this.setState({
                tracks: tracks ?? [...arrangement.tracks],
            });
        }
    }

    public override componentWillUnmount(): void {
        const { selectionManager } = this.props;
        selectionManager.unregisterHitTester(this);

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
        const { barNumber, arrangement, arrangementPlayer, scoreElementRegistry } = this.props;
        const element = this.base as HTMLElement | null;
        if (!element) {
            return [];
        }

        const elRect = element.getBoundingClientRect();
        if (rect.right < elRect.left || rect.left > elRect.right
            || rect.bottom < elRect.top || rect.top > elRect.bottom) {
            return [];
        }

        const rows = element.querySelectorAll<HTMLElement>(".staff-measure-track-row");
        const noteEntries: ISelectionEntry[] = [];
        const trackPieceEntries: ISelectionEntry[] = [];

        // Group markers are drawn outside the note band of a row, so they are resolved from the
        // marker element itself rather than from the row's bounds.
        const groupHits = this.findGroupHits(element, rect, arrangement, barNumber, scoreElementRegistry,
            arrangementPlayer.scoreMetrics);

        for (const row of rows) {
            const rowRect = row.getBoundingClientRect();
            const rowLocation = scoreElementRegistry?.getLocation(row);
            if (!rowLocation) {
                continue;
            }

            const trackId = rowLocation.trackId;
            const track = arrangement.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
            const measure = track?.measures[barNumber - 1];
            // Notes are translated vertically per staff line, so the note symbol can extend below the
            // row. Expand the coarse row bounds by the maximum line spread so noteheads on the lowest
            // line stay reachable. The fine-grained checks below do the precise hit-testing.
            const lineSpread = ((this.maxNoteLineForTrack(trackId) - 1) / 2) * 10;
            const expandedTop = rowRect.top - lineSpread;
            const expandedBottom = rowRect.bottom + lineSpread + 4;

            if (!rectsIntersect(rect, rowRect.left, expandedTop, rowRect.right, expandedBottom, 0)) {
                continue;
            }

            const noteRunElements = scoreElementRegistry?.findElements(
                ScoreElementKind.StaffRun, barNumber, trackId,
            ) ?? [];

            let rowHasSoundingNotes = false;

            for (const runEl of noteRunElements) {
                const runLocation = scoreElementRegistry?.getLocation(runEl);
                if (runLocation?.step === undefined) {
                    continue;
                }

                let noteHit = false;
                const isSoundingNote = runLocation.noteId !== undefined;

                // 1. Check the .note-image SVG for notehead and stem.
                const noteImage = runEl.querySelector<HTMLElement>(".note-image");
                if (noteImage) {
                    const sr = noteImage.getBoundingClientRect();

                    if (isSoundingNote) {
                        // Notehead: bottom 29 % of the SVG height (viewBox: 0 0 60 120,
                        // notehead occupies roughly y=85..120 → 35/120 ≈ 0.29).
                        const nhTop = sr.bottom - (sr.height * 0.29);
                        noteHit = rectsIntersect(rect, sr.left, nhTop, sr.right, sr.bottom, hitTolerance);

                        // Stem: only for notes whose stem is inside the SVG (non-beamed).
                        if (!noteHit && !runEl.querySelector(".staff-note-viewer-custom-stem")) {
                            const stemHalfW = 4;
                            const centerX = (sr.left + sr.right) / 2;
                            noteHit = rectsIntersect(
                                rect,
                                centerX - stemHalfW, sr.top + (sr.height * 0.04),
                                centerX + stemHalfW, sr.bottom - (sr.height * 0.15),
                                hitTolerance,
                            );
                        }
                    } else {
                        // Rest: the rest symbol fills most of the SVG; use the full rect.
                        noteHit = rectsIntersect(rect, sr.left, sr.top, sr.right, sr.bottom, hitTolerance);
                    }
                }

                // 2. CSS stem for non-oval, non-beamed notes.
                if (!noteHit) {
                    const headStem = runEl.querySelector<HTMLElement>(".staff-note-head-stem");
                    if (headStem) {
                        const r = headStem.getBoundingClientRect();
                        noteHit = rectsIntersect(rect, r.left, r.top, r.right, r.bottom, hitTolerance);
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
                            rect, r.left, r.top + beamReserve, r.right, r.bottom, hitTolerance,
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
                            hitTolerance,
                        );
                    }
                }

                // 5. Cross head (separate SVG element).
                if (!noteHit) {
                    const crossHead = runEl.querySelector<HTMLElement>(".staff-note-head-cross-svg");
                    if (crossHead) {
                        const r = crossHead.getBoundingClientRect();
                        noteHit = rectsIntersect(rect, r.left, r.top, r.right, r.bottom, hitTolerance);
                    }
                }

                if (noteHit) {
                    const target = scoreElementRegistry?.getTarget(runEl);
                    if (target !== undefined && "duration" in target && measure !== undefined) {
                        // A staff run is the whole event, so it is copied with its full duration.
                        noteEntries.push(this.eventEntry(measure, target));
                    }

                    if (runLocation.noteId !== undefined) {
                        rowHasSoundingNotes = true;
                    }
                }
            }

            if (!rowHasSoundingNotes) {
                if (track !== undefined && measure !== undefined) {
                    trackPieceEntries.push({
                        granularity: SelectionGranularity.TrackPiece,
                        target: { granularity: SelectionGranularity.TrackPiece, track, measure },
                    });
                }
            }
        }

        // A click on a beam stroke or on a tuplet marker addresses the group that marker belongs to,
        // not just the events the marker happens to cover. Which events form a group is a rule of the
        // measure, so the groups come from the model and the markers only tell which groups were hit.
        // Markers are drawn beside the note band, so the groups are applied after the rows: a row
        // whose bounds reject the click must still give up its group. Notes keep priority.
        for (const [trackId, groups] of groupHits) {
            const measure = arrangement.tracks.find((track) => {
                return track.id === trackId;
            })?.measures[barNumber - 1];
            const hasNoteHits = noteEntries.some((entry) => {
                return SelectionSerializer.trackOf(entry).id === trackId;
            });

            if (measure === undefined || hasNoteHits) {
                continue;
            }

            if (groups.length === 1) {
                noteEntries.push(this.noteGroupEntry(measure, groups[0]));

                continue;
            }

            // A selection that addresses several groups of one track addresses an area rather than a
            // group, so it resolves at the finer granularity of notes under those groups.
            for (const group of groups) {
                for (const index of group.eventIndexes) {
                    noteEntries.push(this.eventEntry(measure, measure.events[index]));
                }
            }
        }

        if (noteEntries.length > 0) {
            return noteEntries;
        }

        if (trackPieceEntries.length > 0) {
            return trackPieceEntries;
        }

        const measure = SelectionSerializer.measureOfBar(arrangement, barNumber);
        if (measure === undefined) {
            return [];
        }

        return [{
            granularity: SelectionGranularity.Measure,
            target: { granularity: SelectionGranularity.Measure, measure },
        }];
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, arrangementPlayer, inEditMode,
            dataModel, ownLabel, inheritedLabel, scoreElementRegistry } = this.props;
        const { tracks } = this.state;
        const label = ownLabel ?? inheritedLabel;
        const isInherited = ownLabel === undefined && inheritedLabel !== undefined;
        let labelContent: ComponentChild = undefined;
        if (label !== undefined) {
            labelContent = <div className={`staff-measure-label${isInherited ? " inherited" : ""}`}>{label}</div>;
        }

        return (
            <div
                className="staff-measure-viewer"
                ref={scoreElementRegistry?.createRef({
                    kind: ScoreElementKind.BarContainer,
                    bar: barNumber,
                    trackId: 0,
                })}
            >
                <div className="staff-measure-number">{barNumber}</div>
                {labelContent}
                {tracks.map((track) => {
                    const trackPlayer = arrangementPlayer.trackPlayers.get(track);
                    if (!trackPlayer) {
                        return null;
                    }

                    return (
                        <StaffMeasureTrackRow
                            key={track.id}
                            track={track}
                            barNumber={barNumber}
                            timeParams={arrangement.timeParams}
                            trackPlayer={trackPlayer}
                            arrangementPlayer={arrangementPlayer}
                            inEditMode={inEditMode}
                            dataModel={dataModel}
                            scoreElementRegistry={scoreElementRegistry}
                        />
                    );
                })}
            </div>
        );
    }

    private maxNoteLineForTrack(trackId: number): number {
        const { arrangement } = this.props;
        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === trackId;
        });
        if (!track) {
            return 1;
        }

        return Math.max(1, ...Object.values(track.instrument.noteStyles).map((noteStyle) => {
            return noteStyle.noteLine ?? 1;
        }));
    }

    /**
     * Resolves the note groups the markers under the selection rectangle address, per track. A click
     * resolves to the group of the marker it touched; a rectangle that touches markers of several
     * groups of one track is an area selection, which the caller resolves at note granularity.
     *
     * @param bar The bar element the hit test runs on.
     * @param rect The selection rectangle in viewport coordinates.
     * @param arrangement The arrangement the bar belongs to.
     * @param barNumber The one-based measure number of the bar.
     * @param registry The element registry the rendered elements are resolved through.
     * @param grid The timing of the arrangement.
     *
     * @returns The groups hit per track id, for the tracks whose markers were touched.
     */
    private findGroupHits(bar: HTMLElement, rect: DOMRect, arrangement: ISbDmArrangement, barNumber: number,
        registry: ScoreElementRegistry | undefined, grid: INotationGrid): Map<number, INoteGroup[]> {
        const hitsByTrack = new Map<number, INoteGroup[]>();
        const groupsByTrack = new Map<number, INoteGroup[]>();
        const markers = bar.querySelectorAll<HTMLElement>(
            ".staff-note-viewer-beam, .staff-note-viewer-tuplet-number, .staff-note-viewer-tuplet-bracket",
        );

        for (const marker of markers) {
            // A bracket draws its number outside its own box, so the number counts as part of the
            // marker: clicking the digit a user aims at must address the tuplet as well.
            const number = marker.querySelector<HTMLElement>(".staff-note-viewer-tuplet-text");
            if (!touchesElement(rect, marker) && (number === null || !touchesElement(rect, number))) {
                continue;
            }

            const row = marker.closest<HTMLElement>(".staff-measure-track-row");
            const trackId = row === null ? undefined : registry?.getLocation(row)?.trackId;
            const measure = trackId === undefined
                ? undefined
                : arrangement.tracks.find((track) => {
                    return track.id === trackId;
                })?.measures[barNumber - 1];
            if (trackId === undefined || measure === undefined) {
                continue;
            }

            let groups = groupsByTrack.get(trackId);
            if (groups === undefined) {
                groups = MeasureProjection.noteGroups(measure, grid);
                groupsByTrack.set(trackId, groups);
            }

            const isBeam = marker.classList.contains("staff-note-viewer-beam");
            const group = this.markerGroup(marker, measure, groups, registry, isBeam);
            if (group === undefined) {
                continue;
            }

            let hits = hitsByTrack.get(trackId);
            if (hits === undefined) {
                hits = [];
                hitsByTrack.set(trackId, hits);
            }

            if (!hits.includes(group)) {
                hits.push(group);
            }
        }

        const result = new Map<number, INoteGroup[]>();
        for (const [trackId, hits] of hitsByTrack) {
            result.set(trackId, groupsInMeasureOrder(hits));
        }

        return result;
    }

    /**
     * Resolves the group a single marker stands for.
     *
     * @param marker The beam stroke or tuplet marker that was hit.
     * @param measure The measure the marker is drawn in.
     * @param groups The measure's note groups, innermost first.
     * @param registry The element registry the rendered elements are resolved through.
     * @param isBeam Whether the marker is a beam stroke.
     *
     * @returns The group the marker addresses, or undefined when it stands for none.
     */
    private markerGroup(marker: HTMLElement, measure: ISbDmTrackMeasure, groups: INoteGroup[],
        registry: ScoreElementRegistry | undefined, isBeam: boolean): INoteGroup | undefined {
        if (isBeam) {
            const run = marker.closest<HTMLElement>(".staff-note-viewer-run");
            const target = run === null ? undefined : registry?.getTarget(run);
            const eventIndex = target !== undefined && "duration" in target
                ? measure.events.indexOf(target)
                : -1;

            return groups.find((group) => {
                return group.kind === NoteGroupKind.Beam && group.eventIndexes.includes(eventIndex);
            });
        }

        const subdivision = registry?.getTarget(marker);

        return groups.find((group) => {
            return group.kind === NoteGroupKind.Tuplet && group.subdivision === subdivision;
        });
    }

    /**
     * Builds the selection entry addressing one measure event as a single note.
     *
     * @param measure The measure the event belongs to.
     * @param event The event to address.
     *
     * @returns The selection entry for the event.
     */
    private eventEntry(measure: ISbDmTrackMeasure, event: IMeasureEvent): ISelectionEntry {
        return {
            granularity: SelectionGranularity.Note,
            target: {
                granularity: SelectionGranularity.Note,
                measure,
                event,
                start: { ...event.start },
                end: addFractions(event.start, event.duration),
            },
        };
    }

    /**
     * Builds the selection entry addressing every event of a note group.
     *
     * @param measure The measure the group belongs to.
     * @param group The group to address.
     *
     * @returns The selection entry for the group.
     */
    private noteGroupEntry(measure: ISbDmTrackMeasure, group: INoteGroup): ISelectionEntry {
        return {
            granularity: SelectionGranularity.NoteGroup,
            target: {
                granularity: SelectionGranularity.NoteGroup,
                measure,
                events: group.eventIndexes.map((index) => {
                    return measure.events[index];
                }),
                subdivision: group.subdivision,
            },
        };
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
