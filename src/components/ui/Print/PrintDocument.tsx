/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { PrintLayout } from "../../../core/PrintLayout.js";
import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { TrackViewMode } from "../../../core/types/general.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { PrintSession } from "../../../ui/PrintSession.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { PrintSheet, PrintSheetRendering } from "./PrintSheet.js";

export interface IPrintDocumentProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    arrangementPlayer: ArrangementPlayer;
    selectionManager: SelectionManager;

    /** The session state the document is laid out with, which the preview shares. */
    session: PrintSession;

    viewMode: TrackViewMode;

    /** Called once the document is in the DOM, so the native print dialog can wait for its content. */
    onReady?: () => void;
}

/**
 * The printed document: one paper sheet per page of the print layout, drawn from the same layout data and with the
 * same renderers as the preview, but without its magnification, floating bars and margin guides.
 *
 * The document stays hidden on screen and becomes the printed page only while `body` carries the `printing` class
 * (see `print.scss`), so the native dialog prints exactly the sheets the preview shows.
 */
export class PrintDocument extends UIComponent<IPrintDocumentProperties> {
    public override componentDidMount(): void {
        const { onReady } = this.props;

        onReady?.();
    }

    public override render(): ComponentChild {
        const { dataModel, arrangementPlayer, selectionManager, session, viewMode } = this.props;
        const arrangement = dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const tracks = session.printedTracks(arrangement);
        const layout = PrintLayout.layout({
            arrangement,
            barCount: arrangementPlayer.scoreMetrics.bars,
            grid: arrangementPlayer.scoreMetrics,
            setup: session.pageSetup,
            tracks,
            viewMode,
            widthOverrides: session.widthOverrides(arrangement),
        });

        const sheets = layout.pages.map((page) => {
            return (
                <PrintSheet
                    key={page.number}
                    rendering={PrintSheetRendering.Print}
                    layout={layout}
                    page={page}
                    arrangement={arrangement}
                    viewMode={viewMode}
                    tracks={tracks}
                    printScale={session.pageSetup.printScale}
                    previewZoom={1}
                    dataModel={dataModel}
                    arrangementPlayer={arrangementPlayer}
                    selectionManager={selectionManager}
                />
            );
        });

        return (
            <div className={this.generateFinalClassName(["print-root"])} role="document">
                {sheets}
            </div>
        );
    }
}
