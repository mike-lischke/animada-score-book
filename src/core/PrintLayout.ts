/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { MeasureLayout, noteHeightPx, staffPrefixWidth, staffSpacePx } from "./MeasureLayout.js";
import type { INotationGrid } from "./MeasureProjection.js";
import type { ISbDmArrangement, ISbDmTrack } from "./ScoreBookDataModel.js";
import { StaffRowGeometry, type IStaffRowGeometry } from "./StaffRowGeometry.js";
import { TrackViewMode } from "./types/general.js";

/** A4 paper dimensions in millimeters, the only format of the first version. */
const a4WidthMm = 210;
const a4HeightMm = 297;

/** CSS px per millimeter: CSS defines a px as 1/96 inch, which states the physical page in px. */
export const pxPerMillimeter = 96 / 25.4;

/** Height of the running header band above the content of every page, in printed px. */
const runningHeaderHeight = 28;

/** Extra height the title and tempo block takes above the content of the first page, in printed px. */
const titleBlockHeight = 60;

/** Width of the printed instrument-name column, in layout px at 100% zoom. Mirrors print.scss. */
export const printInstrumentColumnWidth = 140;

/** Distance the instrument-name column keeps from the first measure, in layout px at 100% zoom. */
export const printInstrumentGap = 12;

/** Air above the first row of a printed staff system, in layout px at 100% zoom: the staff columns' head room. */
export const printStaffHeadRoom = 24;

/** Distance two rows of a printed system keep, in layout px at 100% zoom. Mirrors `.staff-note-viewer`. */
export const printRowGap = 20;

/** Height of one grid track row of a printed system: the note cell and the 8 px margins of its row. */
export const printGridRowHeight = noteHeightPx + 16;

/** Room the grid keeps above its first row for the bracket end and the system's measure number, in layout px. */
export const printGridHeadRoom = 32;

/** Distance two systems keep on a page, in layout px at 100% zoom. */
export const printSystemGap = 24;

/** Distance a system's measure number keeps above the bracket's upper end, in layout px at 100% zoom. */
export const printSystemNumberGap = 16;

/** Staff space the digits of a system's measure number are drawn at: a little smaller than the notation. */
export const printSystemNumberStaffSpace = staffSpacePx * 0.65;

/** Orientation of the printed paper. The values are the CSS keyword of the `@page size` rule. */
export enum PageOrientation {
    Portrait = "portrait",
    Landscape = "landscape",
}

/** Page margins in millimeters. */
export interface IPageMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/** The print settings that are the same for every arrangement of an application session. */
export interface IPrintPageSetup {
    orientation: PageOrientation;
    margins: IPageMargins;

    /**
     * Factor the score is drawn at on paper, applied to the measure widths and row heights the track viewer uses
     * at 100% zoom. It is a printed length, so it never inherits the track viewer's zoom.
     */
    printScale: number;
}

/**
 * Physical page and content dimensions, in printed px. The page states its paper and the room its header bands
 * take, so the layout knows how much space the notation has before it knows how large the notation is.
 */
export interface IPrintPageGeometry {
    readonly orientation: PageOrientation;
    readonly marginsMm: IPageMargins;

    /** Paper width in millimeters. The printed sheets state their size in this unit, so they fill the paper. */
    readonly widthMm: number;

    /** Paper height in millimeters. */
    readonly heightMm: number;

    readonly widthPx: number;
    readonly heightPx: number;

    /** Width between the left and right margin, in printed px. */
    readonly contentWidthPx: number;

    /** Height between the top and bottom margin, in printed px, before the header bands are taken. */
    readonly contentHeightPx: number;

    /** Height the running header takes at the top of every page, in printed px. */
    readonly runningHeaderHeightPx: number;

    /** Extra height the title and tempo block takes at the top of the first page, in printed px. */
    readonly titleBlockHeightPx: number;
}

/** One measure column of a printed system, in layout px at 100% zoom. */
export interface IPrintMeasureColumn {
    /** 1-based measure number. */
    readonly bar: number;

    /** Offset of the measure's left edge from the system's left edge, in layout px at 100% zoom. */
    readonly offsetPx: number;

    readonly widthPx: number;
}

/** One row of measures a printed page holds. */
export interface IPrintSystem {
    /** 1-based page number the system is placed on. */
    readonly page: number;

    /** Offset of the system's top edge from the content area's top edge, in layout px at 100% zoom. */
    readonly topPx: number;

    /** Width of the name and prefix columns before the first measure, in layout px at 100% zoom. */
    readonly leadingWidthPx: number;

    /** Width of the whole system, its leading columns and its measures included, in layout px at 100% zoom. */
    readonly widthPx: number;

    /** Height of the system, in layout px at 100% zoom. */
    readonly heightPx: number;

    /** Height of each track row, in the order of the printed tracks, in layout px at 100% zoom. */
    readonly rowHeightsPx: readonly number[];

    readonly measures: readonly IPrintMeasureColumn[];
}

/** One sheet of paper of the printed document. */
export interface IPrintPage {
    /** 1-based page number. */
    readonly number: number;

    /** Offset of the content area, below the header bands, from the page's top edge, in printed px. */
    readonly contentTopPx: number;

    /** Width the systems may use, in layout px at 100% zoom. */
    readonly availableWidthPx: number;

    /** Height the systems may use, in layout px at 100% zoom. */
    readonly availableHeightPx: number;

    readonly systems: readonly IPrintSystem[];
}

/** The kind of content a printed page cannot hold. */
export enum PrintOverflowKind {
    /** A system is wider than the page content, so its notation would reach into the right margin. */
    MeasureTooWide,

    /** A system is taller than the page content, so it does not fit between the header and the bottom margin. */
    SystemTooTall,
}

/** A piece of content the print layout could not place inside the page content area. */
export interface IPrintOverflow {
    readonly kind: PrintOverflowKind;

    /** 1-based page number the affected system is placed on. */
    readonly page: number;

    /** 1-based number of the first measure the affected system holds. */
    readonly firstBar: number;

    /** 1-based number of the last measure the affected system holds. */
    readonly lastBar: number;

    /** Width or height the system needs, in layout px at 100% zoom. */
    readonly requiredPx: number;

    /** Width or height the page offers, in layout px at 100% zoom. */
    readonly availablePx: number;
}

/** A page while the layout is being built, which still takes systems. */
interface IPageDraft extends Omit<IPrintPage, "systems"> {
    readonly systems: IPrintSystem[];
}

/** The paginated form of a score: its pages, the systems on them and what did not fit. */
export interface IPrintLayout {
    readonly geometry: IPrintPageGeometry;
    readonly pages: readonly IPrintPage[];
    readonly overflows: readonly IPrintOverflow[];

    /**
     * The staff geometry the layout measured for every printed track, keyed by track id. Empty in grid mode, where
     * the rows keep the grid cell height.
     */
    readonly rowGeometries: ReadonlyMap<number, IStaffRowGeometry>;
}

/** Everything the printed layout is derived from. */
export interface IPrintLayoutInput {
    readonly arrangement: ISbDmArrangement;

    /** Number of measures to print, in the order the tracks hold them. */
    readonly barCount: number;

    /** The arrangement's timing grid, which the notation rules that derive the row heights work on. */
    readonly grid: INotationGrid;

    readonly setup: IPrintPageSetup;

    /** Tracks to print, in display order. */
    readonly tracks: readonly ISbDmTrack[];

    readonly viewMode: TrackViewMode;

    /** Print-only measure widths, keyed by 1-based measure number, in layout px at 100% zoom. */
    readonly widthOverrides?: ReadonlyMap<number, number>;
}

/**
 * Lays a score out for printing: A4 pages, systems packed from the measures' actual widths and pages packed from
 * the systems' notation-derived heights.
 *
 * Every length the layout states for the score content is in layout px at 100% zoom — the unit of
 * {@link MeasureLayout} and {@link StaffRowGeometry}. The physical page is in printed px, and
 * {@link IPrintPageSetup.printScale} is the only conversion between them. Hence the print scale changes how many
 * measures a system holds, while a preview zoom, which is not part of the setup, cannot.
 *
 * A system keeps the widths its measures have; a partial system leaves its unused room on the right instead of
 * stretching its measures, and no system is split over two pages. Content that still does not fit is reported in
 * {@link IPrintLayout.overflows} rather than shrunk.
 */
export class PrintLayout {
    /**
     * @param setup The page settings to resolve.
     *
     * @returns The paper and content dimensions of an A4 page.
     */
    public static pageGeometry(setup: IPrintPageSetup): IPrintPageGeometry {
        const isLandscape = setup.orientation === PageOrientation.Landscape;
        const widthMm = isLandscape ? a4HeightMm : a4WidthMm;
        const heightMm = isLandscape ? a4WidthMm : a4HeightMm;
        const widthPx = widthMm * pxPerMillimeter;
        const heightPx = heightMm * pxPerMillimeter;
        const { margins } = setup;

        return {
            orientation: setup.orientation,
            marginsMm: { ...margins },
            widthMm,
            heightMm,
            widthPx,
            heightPx,
            contentWidthPx: Math.max(1, widthPx - ((margins.left + margins.right) * pxPerMillimeter)),
            contentHeightPx: Math.max(1, heightPx - ((margins.top + margins.bottom) * pxPerMillimeter)),
            runningHeaderHeightPx: runningHeaderHeight,
            titleBlockHeightPx: titleBlockHeight,
        };
    }

    /**
     * Resolves the width every measure prints at: its own or the view's default width, a print override where one
     * exists, and never below what the measure's notation needs.
     *
     * @param arrangement The arrangement to measure.
     * @param barCount The number of measures to resolve.
     * @param overrides Print-only widths, keyed by 1-based measure number.
     *
     * @returns The width of every measure, in measure order, in layout px at 100% zoom.
     */
    public static effectiveWidths(arrangement: ISbDmArrangement, barCount: number,
        overrides?: ReadonlyMap<number, number>): number[] {
        const widths: number[] = [];
        for (let bar = 1; bar <= barCount; bar++) {
            const width = overrides?.get(bar) ?? MeasureLayout.widthOf(bar, arrangement.measureWidths);
            widths.push(Math.max(width, MeasureLayout.contentMinimumWidthOfMeasure(arrangement, bar)));
        }

        return widths;
    }

    /**
     * @param input The score, the tracks and the page settings to lay out.
     *
     * @returns The pages of the document with their systems placed, plus the content that did not fit.
     */
    public static layout(input: IPrintLayoutInput): IPrintLayout {
        const { arrangement, barCount, grid, setup, tracks, viewMode, widthOverrides } = input;
        const geometry = PrintLayout.pageGeometry(setup);
        const widths = PrintLayout.effectiveWidths(arrangement, barCount, widthOverrides);
        const widthMap = new Map<number, number>();
        widths.forEach((width, index) => {
            widthMap.set(index + 1, width);
        });

        const rowGeometries = new Map<number, IStaffRowGeometry>();
        const rowHeightsPx = tracks.map((track) => {
            if (viewMode === TrackViewMode.Grid) {
                return printGridRowHeight;
            }

            const geometry = StaffRowGeometry.ofTrack(track, arrangement, grid, 1, widthMap);
            rowGeometries.set(track.id, geometry);

            return geometry.heightPx;
        });

        const leadingWidthPx = PrintLayout.leadingWidth(viewMode);
        const systemHeightPx = PrintLayout.systemHeight(viewMode, rowHeightsPx);
        const blocks = PrintLayout.packSystems(widths, leadingWidthPx,
            geometry.contentWidthPx / setup.printScale);

        const pages: IPrintPage[] = [];
        let page = PrintLayout.pageOf(1, geometry, setup.printScale);
        let usedHeightPx = 0;

        for (const block of blocks) {
            const startsNewPage = usedHeightPx > 0
                && usedHeightPx + printSystemGap + systemHeightPx > page.availableHeightPx;
            if (startsNewPage) {
                pages.push(page);
                page = PrintLayout.pageOf(pages.length + 1, geometry, setup.printScale);
                usedHeightPx = 0;
            }

            const topPx = usedHeightPx === 0 ? 0 : usedHeightPx + printSystemGap;
            page.systems.push({
                page: page.number,
                topPx,
                leadingWidthPx,
                widthPx: leadingWidthPx + block.reduce((sum, bar) => {
                    return sum + widths[bar - 1];
                }, 0),
                heightPx: systemHeightPx,
                rowHeightsPx,
                measures: PrintLayout.measureColumns(block, widths, leadingWidthPx),
            });
            usedHeightPx = topPx + systemHeightPx;
        }

        pages.push(page);

        return {
            geometry,
            pages,
            overflows: PrintLayout.overflowsOf(pages),
            rowGeometries,
        };
    }

    /**
     * @param viewMode The view the score is printed in.
     *
     * @returns The width of the columns before the first measure, in layout px at 100% zoom.
     */
    private static leadingWidth(viewMode: TrackViewMode): number {
        const instrumentWidth = printInstrumentColumnWidth + printInstrumentGap;

        switch (viewMode) {
            case TrackViewMode.Grid: {
                return instrumentWidth;
            }
            case TrackViewMode.Staff: {
                return instrumentWidth + staffPrefixWidth;
            }
        }
    }

    /**
     * @param viewMode The view the score is printed in.
     * @param rowHeightsPx The height of every track row.
     *
     * @returns The height of a system, in layout px at 100% zoom.
     */
    private static systemHeight(viewMode: TrackViewMode, rowHeightsPx: readonly number[]): number {
        const rowsHeightPx = rowHeightsPx.reduce((sum, height) => {
            return sum + height;
        }, 0);

        switch (viewMode) {
            case TrackViewMode.Grid: {
                return printGridHeadRoom + rowsHeightPx;
            }
            case TrackViewMode.Staff: {
                return printStaffHeadRoom + rowsHeightPx + (printRowGap * Math.max(0, rowHeightsPx.length - 1));
            }
        }
    }

    /**
     * Packs the measures into systems by their widths. A measure that does not fit the remaining room starts the
     * next system, and a measure that does not fit a system of its own still keeps it.
     *
     * @param widths The width of every measure, in measure order.
     * @param leadingWidthPx The width of the columns before the first measure.
     * @param availableWidthPx The width a system may use.
     *
     * @returns The measures of each system, as 1-based measure numbers.
     */
    private static packSystems(widths: readonly number[], leadingWidthPx: number,
        availableWidthPx: number): number[][] {
        const systems: number[][] = [];
        let current: number[] = [];
        let usedWidthPx = leadingWidthPx;

        for (let index = 0; index < widths.length; index++) {
            const width = widths[index];
            if (current.length > 0 && usedWidthPx + width > availableWidthPx) {
                systems.push(current);
                current = [];
                usedWidthPx = leadingWidthPx;
            }

            current.push(index + 1);
            usedWidthPx += width;
        }

        if (current.length > 0) {
            systems.push(current);
        }

        return systems;
    }

    /**
     * @param bars The 1-based numbers of the measures a system holds.
     * @param widths The width of every measure, in measure order.
     * @param leadingWidthPx The width of the columns before the first measure.
     *
     * @returns The columns of the system, in layout px at 100% zoom.
     */
    private static measureColumns(bars: readonly number[], widths: readonly number[],
        leadingWidthPx: number): IPrintMeasureColumn[] {
        const columns: IPrintMeasureColumn[] = [];
        let offsetPx = leadingWidthPx;

        for (const bar of bars) {
            const widthPx = widths[bar - 1];
            columns.push({ bar, offsetPx, widthPx });
            offsetPx += widthPx;
        }

        return columns;
    }

    /**
     * @param number The 1-based page number.
     * @param geometry The dimensions of the paper.
     * @param printScale The factor the score content is drawn at.
     *
     * @returns An empty page whose content area starts below its header bands.
     */
    private static pageOf(number: number, geometry: IPrintPageGeometry, printScale: number): IPageDraft {
        const headerHeightPx = geometry.runningHeaderHeightPx
            + (number === 1 ? geometry.titleBlockHeightPx : 0);

        return {
            number,
            contentTopPx: (geometry.marginsMm.top * pxPerMillimeter) + headerHeightPx,
            availableWidthPx: geometry.contentWidthPx / printScale,
            availableHeightPx: Math.max(0, geometry.contentHeightPx - headerHeightPx) / printScale,
            systems: [],
        };
    }

    /**
     * @param pages The paginated systems.
     *
     * @returns The systems that are wider or taller than the page area they were placed in.
     */
    private static overflowsOf(pages: readonly IPrintPage[]): IPrintOverflow[] {
        const overflows: IPrintOverflow[] = [];

        for (const page of pages) {
            for (const system of page.systems) {
                const firstBar = system.measures[0].bar;
                const lastBar = system.measures[system.measures.length - 1].bar;

                if (system.widthPx > page.availableWidthPx) {
                    overflows.push({
                        kind: PrintOverflowKind.MeasureTooWide,
                        page: page.number,
                        firstBar,
                        lastBar,
                        requiredPx: system.widthPx,
                        availablePx: page.availableWidthPx,
                    });
                }

                if (system.heightPx > page.availableHeightPx) {
                    overflows.push({
                        kind: PrintOverflowKind.SystemTooTall,
                        page: page.number,
                        firstBar,
                        lastBar,
                        requiredPx: system.heightPx,
                        availablePx: page.availableHeightPx,
                    });
                }
            }
        }

        return overflows;
    }
}
