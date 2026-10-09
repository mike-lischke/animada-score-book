/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmArrangement, ISbDmTrack, ISbDmTrackPiece, ScoreBookDataModel }
    from "../../../../core/ScoreBookDataModel.js";
import { MeasureLayout, staffSpacePx } from "../../../../core/MeasureLayout.js";
import { RangeArticulations } from "../../../../core/RangeArticulations.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "../../../../core/StaffRowGeometry.js";
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
    SelectionGranularity, SelectionSerializer, type ISelectionEntry, type ISelectionHitEntry,
    type ISelectionHitTester,
} from "../../../../ui/SelectionSerializer.js";
import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";
import { StaffMeasureTrackRow } from "./StaffMeasureTrackRow.js";

/** Tolerance in px around note heads, stems and group markers when a hit region is tested. */
const hitTolerance = 2;

/** Half the thickness a beam stroke's hit zone keeps around the beam line, in px. */
const beamStrokeHalfHeight = 3;

/** A point on a beam's line, in viewport coordinates. */
interface IBeamHitPoint {
    x: number;
    y: number;
}

/**
 * The zone a beam group can be selected through: the band the group's strokes run through, derived
 * from the height of the beam line at each of its stems.
 */
interface IBeamBand {
    /** Points on the primary beam line, at the group's stems, in viewport coordinates. */
    points: IBeamHitPoint[];

    /** Number of beam levels the group draws, the stack that hangs below the primary line. */
    levels: number;

    /** Vertical distance between two beam levels, in viewport px. */
    advance: number;

    /** Bounds of the group's stems, which a hit entry reports as the marker it was found at. */
    rect: DOMRect;
}

/** A note group a hit test found, together with the rect of the marker it was found at. */
interface INoteGroupHit {
    group: INoteGroup;
    rect: DOMRect;
}

export interface IStaffMeasureViewerProps extends ICommonUIProperties {
    barNumber: number;
    arrangement: ISbDmArrangement;
    arrangementPlayer: ArrangementPlayer;
    inEditMode: boolean;
    selectionManager: SelectionManager;
    dataModel: ScoreBookDataModel;
    scoreElementRegistry?: ScoreElementRegistry;

    /**
     * If given, render only these tracks (in this order) instead of all tracks of the arrangement.
     * Used by the print feature to limit output to the user's selection.
     */
    tracks?: ISbDmTrack[];

    /**
     * The column's layout width in px at 100 % zoom, which the note rows derive their beam slopes from.
     * The print view states its halved width, so the same engraving rules hold on paper.
     */
    measureWidth: number;
    /** The shared row geometry of every track, so all measures and side controls lay a track out alike. */
    rowGeometries?: ReadonlyMap<number, IStaffRowGeometry>;
    /**
     * True to draw the hairpins and `f` markings of each row. The print view sets this; the screen view leaves it
     * off, because its markings are drawn into the viewer's decoration layer instead.
     */
    showRangeArticulations?: boolean;
}

interface IStaffMeasureViewerState {
    tracks: ISbDmTrack[];
}

/** Renders the staff-mode measure column with track rows only. */
export class StaffMeasureViewer extends UIComponent<IStaffMeasureViewerProps, IStaffMeasureViewerState>
    implements ISelectionHitTester {
    private viewerElement?: HTMLDivElement;

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
    public hitTest(rect: DOMRect): ISelectionHitEntry[] {
        const { barNumber, arrangement, arrangementPlayer, scoreElementRegistry } = this.props;
        const element = this.viewerElement;
        if (!element) {
            return [];
        }

        const elRect = element.getBoundingClientRect();

        // A measure draws its tuplet markers beside the note band, and a marker below the notation reaches
        // into the room the row keeps for it, which lies outside the measure's own box. A rectangle that
        // touches only such a marker still addresses the tuplet it belongs to, and nothing else.
        const insideMeasure = StaffMeasureViewer.rectsIntersect(rect, elRect.left, elRect.top, elRect.right,
            elRect.bottom, 0);
        if (!insideMeasure && !StaffMeasureViewer.touchesTupletMarker(rect, element)) {
            return [];
        }

        const rows = element.querySelectorAll<HTMLElement>(".staff-measure-track-row");
        const noteEntries: ISelectionHitEntry[] = [];
        const trackPieceEntries: ISelectionHitEntry[] = [];

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
            // row. Expand the coarse row bounds by the maximum line spread and by the room a note's marks
            // hang into below its head, so noteheads on the lowest line and a note's accent stay reachable.
            // The fine-grained checks below do the precise hit-testing.
            const lineSpread = ((this.maxNoteLineForTrack(trackId) - 1) / 2) * staffSpacePx;
            const expandedTop = rowRect.top - lineSpread;
            const expandedBottom = rowRect.bottom + lineSpread + (staffSpacePx * 2);

            if (!StaffMeasureViewer.rectsIntersect(rect, rowRect.left, expandedTop, rowRect.right, expandedBottom,
                0)) {
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

                // 1. A note is what it draws: its head, and the marks that hang on the head's wrapper — the
                //    accent under it, the ghost note's parentheses, its dot. A rest draws its symbol and
                //    its dot the same way, so a click on any of them addresses the run's event.
                const wrapper = runEl.querySelector<HTMLElement>(
                    isSoundingNote ? ".staff-note-head" : ".staff-note-viewer-rest-symbol",
                );
                const marks = wrapper === null ? [] : [wrapper, ...wrapper.children];
                for (const mark of marks) {
                    // A stem reaches up to the beam, which addresses the note group and not the note.
                    const isStem = mark.classList.contains("staff-note-head-stem")
                        || mark.classList.contains("staff-note-viewer-custom-stem");
                    if (isStem) {
                        continue;
                    }

                    const mr = mark.getBoundingClientRect();
                    if (StaffMeasureViewer.rectsIntersect(rect, mr.left, mr.top, mr.right, mr.bottom, hitTolerance)) {
                        noteHit = true;
                        break;
                    }
                }

                // 2. Stems carry a note as well, which is what a click beside the head aims at.
                if (!noteHit) {
                    const headStem = runEl.querySelector<HTMLElement>(
                        ".staff-note-head-stem, .staff-note-viewer-custom-stem",
                    );
                    if (headStem) {
                        const r = headStem.getBoundingClientRect();

                        // The top of a beamed stem is where its beam sits, so that zone falls through to
                        // the note group check instead: the beam itself, whose thickness the font states,
                        // and two staff spaces of slack below it, where a click aims at the beam.
                        const beam = runEl.querySelector<HTMLElement>(".staff-note-viewer-beam");
                        const reserve = beam === null
                            ? 0
                            : (beam.getBoundingClientRect().bottom - r.top) + (staffSpacePx * 2);
                        noteHit = StaffMeasureViewer.rectsIntersect(rect, r.left, r.top + reserve, r.right,
                            r.bottom, hitTolerance);
                    }
                }

                if (noteHit) {
                    const target = scoreElementRegistry?.getTarget(runEl);
                    if (target !== undefined && "duration" in target && measure !== undefined) {
                        // A staff run is the whole event, so it is copied with its full duration.
                        noteEntries.push({
                            ...this.eventEntry(measure, target),
                            rect: runEl.getBoundingClientRect()
                        });
                    }

                    if (runLocation.noteId !== undefined) {
                        rowHasSoundingNotes = true;
                    }
                }
            }

            // A track piece owns the room below it: the row's box plus its bottom margin, which is what
            // separates it from the next piece. The expanded bounds above and below only reach the notes
            // drawn outside the row, so a rectangle above the piece addresses the measure.
            const pieceBottom = rowRect.bottom + (parseFloat(getComputedStyle(row).marginBottom) || 0);
            const hitsTrackPiece = StaffMeasureViewer.rectsIntersect(rect, rowRect.left, rowRect.top, rowRect.right,
                pieceBottom, 0);

            if (!rowHasSoundingNotes && hitsTrackPiece) {
                if (track !== undefined && measure !== undefined) {
                    trackPieceEntries.push({
                        granularity: SelectionGranularity.TrackPiece,
                        target: { granularity: SelectionGranularity.TrackPiece, track, measure },
                        rect: new DOMRect(rowRect.left, rowRect.top, rowRect.width, pieceBottom - rowRect.top),
                    });
                }
            }
        }

        // A click on a beam stroke or on a tuplet marker addresses the group that marker belongs to,
        // not just the events the marker happens to cover. Which events form a group is a rule of the
        // measure, so the groups come from the model and the markers only tell which groups were hit.
        // Markers are drawn beside the note band, so the groups are applied after the rows: a row
        // whose bounds reject the click must still give up its group. Every group the rectangle covers
        // is selected as the group it is — a rectangle over markers alone does not contain the notes
        // those groups cover, so resolving it at note granularity would select what the user did not
        // touch. Notes keep priority.
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

            for (const { group, rect: markerRect } of groups) {
                noteEntries.push({ ...this.noteGroupEntry(measure, group), rect: markerRect });
            }
        }

        if (noteEntries.length > 0) {
            return noteEntries;
        }

        if (trackPieceEntries.length > 0) {
            return trackPieceEntries;
        }

        // Only a marker reaches outside the measure's box; a rectangle there addresses no measure.
        if (!insideMeasure) {
            return [];
        }

        const measure = SelectionSerializer.measureOfBar(arrangement, barNumber);
        if (measure === undefined) {
            return [];
        }

        return [{
            granularity: SelectionGranularity.Measure,
            target: { granularity: SelectionGranularity.Measure, measure },
            rect: elRect,
        }];
    }

    public override render(): ComponentChild {
        const { barNumber, arrangement, arrangementPlayer, inEditMode,
            dataModel, measureWidth, rowGeometries, scoreElementRegistry, style, showRangeArticulations } = this.props;
        const { tracks } = this.state;

        // The barline closing the column is the resize handle, so it exists only where resizing is allowed.
        let resizeHandle: ComponentChild = null;
        if (inEditMode) {
            resizeHandle = (
                <div
                    className="staff-measure-resize-handle"
                    onPointerDown={this.handleResizePointerDown}
                    onDblClick={this.handleResizeDoubleClick}
                />
            );
        }

        const registryRef = scoreElementRegistry?.createRef({
            kind: ScoreElementKind.BarContainer,
            bar: barNumber,
            trackId: 0,
        });
        const setViewerRef = (element: HTMLDivElement | null): void => {
            this.viewerElement = element ?? undefined;
            registryRef?.(element);
        };

        const trackRows = tracks.map((track) => {
            const trackPlayer = arrangementPlayer.trackPlayers.get(track);
            if (!trackPlayer) {
                return null;
            }

            const articulations = showRangeArticulations
                ? (arrangement.rangeArticulations?.all ?? []).filter((articulation) => {
                    return articulation.trackId === track.id
                        && RangeArticulations.portionInBar(articulation, barNumber) !== undefined;
                })
                : undefined;
            const rowGeometry = rowGeometries?.get(track.id)
                ?? StaffRowGeometry.ofTrack(track, arrangement, arrangementPlayer.scoreMetrics);

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
                    measureWidth={measureWidth}
                    rowGeometry={rowGeometry}
                    scoreElementRegistry={scoreElementRegistry}
                    articulations={articulations}
                />
            );
        });

        return (
            <div
                className="staff-measure-viewer"
                style={style}
                ref={setViewerRef}
            >
                <div className="staff-measure-number">{barNumber}</div>
                {trackRows}
                {resizeHandle}
            </div>
        );
    }

    /**
     * @param selection The selection rectangle in viewport coordinates.
     * @param bar The bar element to inspect.
     *
     * @returns Whether the rectangle touches a tuplet marker the bar draws, which may sit outside the
     *          bar's own box in the room a row keeps below its notation.
     */
    private static touchesTupletMarker(selection: DOMRect, bar: HTMLElement): boolean {
        const markers = bar.querySelectorAll<HTMLElement>(
            ".staff-note-viewer-tuplet-number, .staff-note-viewer-tuplet-bracket",
        );

        for (const marker of markers) {
            const number = marker.querySelector<HTMLElement>(".staff-note-viewer-tuplet-text");
            if (StaffMeasureViewer.touchesElement(selection, marker)
                || (number !== null && StaffMeasureViewer.touchesElement(selection, number))) {
                return true;
            }
        }

        return false;
    }

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
    private static rectsIntersect(selection: DOMRect, left: number, top: number, right: number, bottom: number,
        tolerance: number): boolean {
        return right + tolerance >= selection.left && left - tolerance <= selection.right
            && bottom + tolerance >= selection.top && top - tolerance <= selection.bottom;
    }

    /**
     * Tests whether the selection rectangle touches a rendered element.
     *
     * @param selection The selection rectangle in viewport coordinates.
     * @param element The element to test.
     *
     * @returns True when the element's bounds overlap the selection rectangle.
     */
    private static touchesElement(selection: DOMRect, element: HTMLElement): boolean {
        const bounds = element.getBoundingClientRect();

        return StaffMeasureViewer.rectsIntersect(selection, bounds.left, bounds.top, bounds.right, bounds.bottom,
            hitTolerance);
    }

    /**
     * Orders the group hits of a measure by the position of their groups.
     *
     * @param hits The hits to order.
     *
     * @returns The hits, earliest group first.
     */
    private static groupsInMeasureOrder(hits: INoteGroupHit[]): INoteGroupHit[] {
        return hits.sort((first, second) => {
            return compareFractions(first.group.start, second.group.start);
        });
    }

    /**
     * Tests whether a line segment crosses an axis-aligned rectangle, using the Liang-Barsky clipping.
     *
     * @param ax x of the segment's first point.
     * @param ay y of the segment's first point.
     * @param bx x of the segment's second point.
     * @param by y of the segment's second point.
     * @param left Left edge of the rectangle.
     * @param top Top edge of the rectangle.
     * @param right Right edge of the rectangle.
     * @param bottom Bottom edge of the rectangle.
     *
     * @returns True when the segment passes through the rectangle.
     */
    private static segmentIntersectsRect(ax: number, ay: number, bx: number, by: number,
        left: number, top: number, right: number, bottom: number): boolean {
        const dx = bx - ax;
        const dy = by - ay;
        let entry = 0;
        let exit = 1;

        const clip = (p: number, q: number): boolean => {
            if (p === 0) {
                return q >= 0;
            }

            const ratio = q / p;
            if (p < 0) {
                if (ratio > exit) {
                    return false;
                }

                entry = Math.max(entry, ratio);
            } else {
                if (ratio < entry) {
                    return false;
                }

                exit = Math.min(exit, ratio);
            }

            return true;
        };

        return clip(-dx, ax - left) && clip(dx, right - ax) && clip(-dy, ay - top) && clip(dy, bottom - ay);
    }

    /**
     * Tests whether the selection rectangle touches a beam group's band: the line through its stems,
     * once per beam level, kept to the stroke's own thickness. The empty room a stroke's bounding box
     * spans around that line does not address the group.
     *
     * @param selection The selection rectangle in viewport coordinates.
     * @param band The band to test.
     *
     * @returns True when the rectangle touches the band at any beam level.
     */
    private static touchesBeamBand(selection: DOMRect, band: IBeamBand): boolean {
        const tolerance = hitTolerance + beamStrokeHalfHeight;
        const left = selection.left - tolerance;
        const top = selection.top - tolerance;
        const right = selection.right + tolerance;
        const bottom = selection.bottom + tolerance;

        for (let level = 0; level < band.levels; level++) {
            const offset = level * band.advance;
            for (let i = 0; i + 1 < band.points.length; i++) {
                if (StaffMeasureViewer.segmentIntersectsRect(band.points[i].x, band.points[i].y + offset,
                    band.points[i + 1].x, band.points[i + 1].y + offset, left, top, right, bottom)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Adds a group hit, once per group and track.
     *
     * @param hitsByTrack The hits collected so far, keyed by track id.
     * @param trackId The track the group belongs to.
     * @param group The group that was hit.
     * @param rect The rect of the marker the hit is reported at.
     */
    private static addGroupHit(hitsByTrack: Map<number, INoteGroupHit[]>, trackId: number, group: INoteGroup,
        rect: DOMRect): void {
        let hits = hitsByTrack.get(trackId);
        if (hits === undefined) {
            hits = [];
            hitsByTrack.set(trackId, hits);
        }

        if (!hits.some((hit) => {
            return hit.group === group;
        })) {
            hits.push({ group, rect });
        }
    }

    /**
     * Builds the band a beam group can be selected through. Its stems mark the beam line at each note:
     * a stem's tip is where the group's line runs at that note's horizontal position.
     *
     * @param trackId The track the group belongs to.
     * @param barNumber The one-based measure number of the bar.
     * @param measure The measure the group belongs to.
     * @param group The beam group to resolve.
     * @param registry The element registry the rendered elements are resolved through.
     *
     * @returns The group's band, or undefined while the group's runs are not all mounted.
     */
    private static beamBand(trackId: number, barNumber: number, measure: ISbDmTrackPiece, group: INoteGroup,
        registry: ScoreElementRegistry | undefined): IBeamBand | undefined {
        const runs = registry?.findElements(ScoreElementKind.StaffRun, barNumber, trackId);
        if (runs === undefined) {
            return undefined;
        }

        const stemByEvent = new Map<number, HTMLElement>();
        for (const run of runs) {
            const target = registry?.getTarget(run);
            const eventIndex = target !== undefined && "duration" in target ? measure.events.indexOf(target) : -1;
            const stem = run.querySelector<HTMLElement>(".staff-note-viewer-custom-stem");
            if (eventIndex >= 0 && stem !== null) {
                stemByEvent.set(eventIndex, stem);
            }
        }

        const points: IBeamHitPoint[] = [];
        let levels = 0;
        let advance = 0;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        for (const eventIndex of group.eventIndexes) {
            const stem = stemByEvent.get(eventIndex);
            if (stem === undefined) {
                return undefined;
            }

            const bounds = stem.getBoundingClientRect();
            points.push({ x: bounds.left + (bounds.width / 2), y: bounds.top });
            left = Math.min(left, bounds.left);
            top = Math.min(top, bounds.top);
            right = Math.max(right, bounds.right);
            bottom = Math.max(bottom, bounds.bottom);

            const strokes = stem.closest<HTMLElement>(".staff-note-viewer-run")
                ?.querySelectorAll<HTMLElement>(".staff-note-viewer-beam") ?? [];
            levels = Math.max(levels, strokes.length);
            if (advance === 0 && strokes.length >= 2) {
                advance = strokes[1].getBoundingClientRect().top - strokes[0].getBoundingClientRect().top;
            }
        }

        if (points.length < 2) {
            return undefined;
        }

        return {
            points,
            levels: Math.max(levels, 1),
            advance,
            rect: new DOMRect(left, top, right - left, bottom - top),
        };
    }

    /**
     * Starts a resize of this measure. The gesture follows the pointer on the window rather than on the
     * handle, so it keeps working while the column is re-laid out under the pointer, and it ends with a
     * single undo step.
     *
     * @param event The pointer event on the barline.
     */
    private handleResizePointerDown = (event: PointerEvent): void => {
        const { barNumber, dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        const widths = arrangement?.measureWidths;
        if (!arrangement || !widths || event.button !== 0) {
            return;
        }

        event.preventDefault();
        // The gesture is a resize, not a selection: keeping it from the selection view also keeps the pointer
        // capture there from retargeting the double click that resets the width.
        event.stopPropagation();

        const handle = event.currentTarget as HTMLElement;
        const zoom = handle.currentCSSZoom || 1;
        const startClientX = event.clientX;
        const startWidth = MeasureLayout.widthOf(barNumber, widths);
        const startStored = widths.get(barNumber);

        const handlePointerMove = (moveEvent: PointerEvent): void => {
            dataModel.setMeasureWidth(barNumber, startWidth + ((moveEvent.clientX - startClientX) / zoom));
        };

        const handlePointerUp = (): void => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);

            if (widths.get(barNumber) !== startStored) {
                dataModel.commitMeasureWidths();
            }
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
    };

    /**
     * Resets this measure's width with a double click on its barline: a modified double click restores the
     * default width, an unmodified one shrinks the measure to the floor its content and controls set.
     *
     * @param event The double click on the barline.
     */
    private handleResizeDoubleClick = (event: MouseEvent): void => {
        const { barNumber, dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        if (!arrangement) {
            return;
        }

        const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
        const width = modified ? undefined : MeasureLayout.minimumWidthOfMeasure(arrangement, barNumber);
        if (dataModel.setMeasureWidth(barNumber, width)) {
            dataModel.commitMeasureWidths();
        }
    };

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
     * Resolves the note groups a selection rectangle addresses, per track. A beam group is addressed
     * through the band its strokes run through, so a rectangle inside a stroke's bounding box that
     * misses the stroke itself addresses nothing. A tuplet is addressed through its bracket or the
     * number the bracket carries.
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
        registry: ScoreElementRegistry | undefined, grid: INotationGrid): Map<number, INoteGroupHit[]> {
        const hitsByTrack = new Map<number, INoteGroupHit[]>();
        const groupsByTrack = new Map<number, INoteGroup[]>();

        const measureOf = (trackId: number): ISbDmTrackPiece | undefined => {
            return arrangement.tracks.find((track) => {
                return track.id === trackId;
            })?.measures[barNumber - 1];
        };

        const groupsOf = (trackId: number, measure: ISbDmTrackPiece): INoteGroup[] => {
            let groups = groupsByTrack.get(trackId);
            if (groups === undefined) {
                groups = MeasureProjection.noteGroups(measure, grid);
                groupsByTrack.set(trackId, groups);
            }

            return groups;
        };

        for (const row of bar.querySelectorAll<HTMLElement>(".staff-measure-track-row")) {
            const trackId = registry?.getLocation(row)?.trackId;
            const measure = trackId === undefined ? undefined : measureOf(trackId);
            if (trackId === undefined || measure === undefined) {
                continue;
            }

            for (const group of groupsOf(trackId, measure)) {
                if (group.kind !== NoteGroupKind.Beam) {
                    continue;
                }

                const band = StaffMeasureViewer.beamBand(trackId, barNumber, measure, group, registry);
                if (band !== undefined && StaffMeasureViewer.touchesBeamBand(rect, band)) {
                    StaffMeasureViewer.addGroupHit(hitsByTrack, trackId, group, band.rect);
                }
            }
        }

        // A bracket draws its number outside its own box, so the number counts as part of the marker:
        // clicking the digit a user aims at must address the tuplet as well.
        const markers = bar.querySelectorAll<HTMLElement>(
            ".staff-note-viewer-tuplet-number, .staff-note-viewer-tuplet-bracket",
        );
        for (const marker of markers) {
            const number = marker.querySelector<HTMLElement>(".staff-note-viewer-tuplet-text");
            if (!StaffMeasureViewer.touchesElement(rect, marker)
                && (number === null || !StaffMeasureViewer.touchesElement(rect, number))) {
                continue;
            }

            const row = marker.closest<HTMLElement>(".staff-measure-track-row");
            const trackId = row === null ? undefined : registry?.getLocation(row)?.trackId;
            const measure = trackId === undefined ? undefined : measureOf(trackId);
            if (trackId === undefined || measure === undefined) {
                continue;
            }

            const subdivision = registry?.getTarget(marker);
            const group = groupsOf(trackId, measure).find((candidate) => {
                return candidate.kind === NoteGroupKind.Tuplet && candidate.subdivision === subdivision;
            });
            if (group !== undefined) {
                StaffMeasureViewer.addGroupHit(hitsByTrack, trackId, group, marker.getBoundingClientRect());
            }
        }

        const result = new Map<number, INoteGroupHit[]>();
        for (const [trackId, hits] of hitsByTrack) {
            result.set(trackId, StaffMeasureViewer.groupsInMeasureOrder(hits));
        }

        return result;
    }

    /**
     * Builds the selection entry addressing one measure event as a single note.
     *
     * @param measure The measure the event belongs to.
     * @param event The event to address.
     *
     * @returns The selection entry for the event.
     */
    private eventEntry(measure: ISbDmTrackPiece, event: IMeasureEvent): ISelectionEntry {
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
    private noteGroupEntry(measure: ISbDmTrackPiece, group: INoteGroup): ISelectionEntry {
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
