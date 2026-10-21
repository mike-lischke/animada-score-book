/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, CSSProperties } from "preact";

import { pxPerMillimeter, type IPrintLayout, type IPrintPage } from "../../../core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { TrackViewMode } from "../../../core/types/general.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { PrintSystemView } from "./PrintSystemView.js";

export interface IPrintSheetProperties extends ICommonUIProperties {
    /** The complete page layout, which states the paper and the staff row geometry. */
    layout: IPrintLayout;

    /** The page to render. */
    page: IPrintPage;

    arrangement: ISbDmArrangement;
    viewMode: TrackViewMode;

    /** Tracks to print, in display order. */
    tracks: readonly ISbDmTrack[];

    /** Factor the notation is drawn at on paper. */
    printScale: number;

    /** Magnification of the sheet on screen, which never changes its printed dimensions. */
    previewZoom: number;

    dataModel: ScoreBookDataModel;
    arrangementPlayer: ArrangementPlayer;
    selectionManager: SelectionManager;

    /** Invoked when a staff measure boundary was dragged to a new print width, in layout px at 100% zoom. */
    onMeasureResized?: (bar: number, widthPx: number) => void;

    /** Invoked when the print width of one measure returns to the width the score states. */
    onMeasureReset?: (bar: number) => void;
}

/**
 * One sheet of paper: the running header, the title block of the first page, the margin guides and the systems the
 * print layout placed on it.
 *
 * The sheet itself is paper-sized in printed px. Its content area is zoomed by the print scale and holds the
 * systems at their layout px offsets, so the printed output and the preview place every system at the same
 * position.
 */
export class PrintSheet extends UIComponent<IPrintSheetProperties> {
    public override render(): ComponentChild {
        const { layout, page, arrangement, viewMode, tracks, printScale, previewZoom } = this.props;
        const geometry = layout.geometry;
        const leftPx = geometry.marginsMm.left * pxPerMillimeter;
        const topPx = geometry.marginsMm.top * pxPerMillimeter;

        const sheetStyle: CSSProperties = {
            width: `${geometry.widthPx}px`,
            height: `${geometry.heightPx}px`,
            zoom: previewZoom,
        };
        const guideStyle: CSSProperties = {
            left: `${leftPx}px`,
            top: `${topPx}px`,
            width: `${geometry.contentWidthPx}px`,
            height: `${geometry.contentHeightPx}px`,
        };
        const headerStyle: CSSProperties = {
            left: `${leftPx}px`,
            top: `${topPx}px`,
            width: `${geometry.contentWidthPx}px`,
            height: `${geometry.runningHeaderHeightPx}px`,
        };
        const contentStyle: CSSProperties = {
            left: `${leftPx}px`,
            top: `${page.contentTopPx}px`,
            width: `${geometry.contentWidthPx}px`,
            height: `${page.availableHeightPx * printScale}px`,
        };
        const scaleStyle: CSSProperties = {
            zoom: printScale,
            width: `${page.availableWidthPx}px`,
            height: `${page.availableHeightPx}px`,

            // Lets the preview's controls keep their screen size inside the scaled content.
            "--print-scale-inverse": 1 / printScale,
        };

        const headerTitle = page.number === 1
            ? undefined
            : <span className="print-sheet-running-title">{arrangement.title}</span>;
        const titleBlock = this.renderTitleBlock(leftPx, topPx + geometry.runningHeaderHeightPx);

        const systems = page.systems.map((system) => {
            return (
                <PrintSystemView
                    key={`system-${system.measures[0].bar}`}
                    system={system}
                    viewMode={viewMode}
                    tracks={tracks}
                    rowGeometries={layout.rowGeometries}
                    arrangement={arrangement}
                    arrangementPlayer={this.props.arrangementPlayer}
                    dataModel={this.props.dataModel}
                    selectionManager={this.props.selectionManager}
                    contentZoom={previewZoom * printScale}
                    availableWidthPx={page.availableWidthPx}
                    onMeasureResized={this.props.onMeasureResized}
                    onMeasureReset={this.props.onMeasureReset}
                />
            );
        });

        return (
            <div className={this.generateFinalClassName(["print-sheet"])} style={sheetStyle} data-page={page.number}>
                <div className="print-sheet-guides" style={guideStyle} aria-hidden="true" />
                <div className="print-sheet-header" style={headerStyle}>
                    {headerTitle}
                    <span className="print-sheet-page-number">Page {page.number}</span>
                </div>
                {titleBlock}
                <div className="print-sheet-content" style={contentStyle}>
                    <div className="print-sheet-content-scale" style={scaleStyle}>
                        {systems}
                    </div>
                </div>
            </div>
        );
    }

    /**
     * @param leftPx Left edge of the content area, in printed px.
     * @param topPx Top edge of the title band, in printed px.
     *
     * @returns The title block of the first page, or undefined on the pages that carry only the running header.
     */
    private renderTitleBlock(leftPx: number, topPx: number): ComponentChild {
        const { page, arrangement, layout } = this.props;
        if (page.number !== 1) {
            return undefined;
        }

        const style: CSSProperties = {
            left: `${leftPx}px`,
            top: `${topPx}px`,
            width: `${layout.geometry.contentWidthPx}px`,
            height: `${layout.geometry.titleBlockHeightPx}px`,
        };

        return (
            <div className="print-sheet-title-block" style={style}>
                <h1 className="print-sheet-title">{arrangement.title}</h1>
            </div>
        );
    }
}
