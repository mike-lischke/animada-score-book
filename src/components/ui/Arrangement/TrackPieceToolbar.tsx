/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ITrackPieceTarget } from "../../../ui/SelectionSerializer.js";
import { Icon } from "../framework/Icon.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIIcon } from "../framework/UIIcon.js";
import { type ICommonUIProperties } from "../framework/UIComponent.js";
import { SelectionToolbar, type ISelectionToolbarSection, type ISelectionToolbarTitle } from "./SelectionToolbar.js";

/** The header title of a track-piece selection, split into the instrument and the measures it covers. */
interface ITrackPieceToolbarTitle {
    instrument: string;
    position: string;
}

export interface ITrackPieceToolbarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

interface ITrackPieceToolbarState {
    /** Whether every addressed piece can carry the one-bar repeat mark; the first piece of a track cannot. */
    canToggleSimile: boolean;

    /** Whether every addressed piece already carries the one-bar repeat mark. */
    simileActive: boolean;
}

/**
 * The tools of a track-piece selection in the staff view. The title names the instrument and the measures the
 * selection covers, the actions below toggle the one-bar repeat (simile) mark or clear the selected pieces.
 */
export class TrackPieceToolbar extends SelectionToolbar<ITrackPieceToolbarProps, ITrackPieceToolbarState> {
    public constructor(props: ITrackPieceToolbarProps) {
        super(props);

        this.state = { canToggleSimile: false, simileActive: false };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleRefresh);
        requisitions.register("arrangementReverted", this.handleRefresh);
        requisitions.register("arrangementMutated", this.handleRefresh);
        this.refreshState();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleRefresh);
        requisitions.unregister("arrangementReverted", this.handleRefresh);
        requisitions.unregister("arrangementMutated", this.handleRefresh);
    }

    protected override get toolbarTitle(): ISelectionToolbarTitle {
        const pieces = this.selectedPieces();
        const { instrument, position } = TrackPieceToolbar.titleOf(pieces);

        return { instrument, position, color: pieces[0]?.track.instrument.color };
    }

    protected override get toolbarSections(): ISelectionToolbarSection[] {
        const { canToggleSimile, simileActive } = this.state;
        const simileTooltip = canToggleSimile
            ? "One-bar repeat (simile)"
            : "Simile is not applicable in the first bar";

        return [{
            actions: [{
                id: "simile",
                tooltip: simileTooltip,
                icon: <ScoreSymbolView symbol={ScoreSymbol.MeasureRepeat} staffSpace={staffSpacePx} icon />,
                active: simileActive,
                disabled: !canToggleSimile,
                onClick: this.handleToggleSimile,
            }, {
                id: "clear",
                tooltip: "Clear track piece",
                icon: <Icon src={UIIcon.ClearAll} />,
                onClick: this.handleClear,
            }],
        }];
    }

    /**
     * Builds the header title of the given pieces: the instruments that play them and the measures they cover.
     *
     * @param pieces The addressed track pieces.
     *
     * @returns The two title parts.
     */
    private static titleOf(pieces: ITrackPieceTarget[]): ITrackPieceToolbarTitle {
        const instruments = [...new Set(pieces.map((piece) => {
            return piece.track.instrument.displayName;
        }))];
        const bars = [...new Set(pieces.map((piece) => {
            return piece.measure.number;
        }))];

        bars.sort((left, right) => {
            return left - right;
        });

        return { instrument: instruments.join(", "), position: TrackPieceToolbar.positionOf(bars) };
    }

    /**
     * Names the bars a selection covers: one bar, a contiguous run of them, or their count.
     *
     * @param bars The covered bar numbers, ascending.
     *
     * @returns The name of the covered bars.
     */
    private static positionOf(bars: number[]): string {
        if (bars.length === 0) {
            return "";
        }

        if (bars.length === 1) {
            return `Measure ${bars[0]}`;
        }

        const first = bars[0];
        const last = bars[bars.length - 1];
        if (last - first === bars.length - 1) {
            return `Measures ${first} – ${last}`;
        }

        return `${bars.length} measures`;
    }

    /**
     * Resolves the track pieces the selection addresses.
     *
     * @returns The addressed pieces.
     */
    private selectedPieces(): ITrackPieceTarget[] {
        const entries = [...this.props.selectionManager.currentSelection.values()];
        const pieces: ITrackPieceTarget[] = [];
        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity === SelectionGranularity.TrackPiece) {
                pieces.push(target);
            }
        }

        return pieces;
    }

    /** Refreshes what the toolbar offers for the current selection. */
    private refreshState(): void {
        const pieces = this.selectedPieces();
        const canToggleSimile = pieces.length > 0 && pieces.every((piece) => {
            return piece.measure.number > 1;
        });
        const simileActive = canToggleSimile && pieces.every((piece) => {
            return piece.measure.simile === true;
        });

        this.setState({ canToggleSimile, simileActive });
    }

    private handleRefresh = (): Promise<boolean> => {
        this.refreshState();

        return Promise.resolve(true);
    };

    private handleToggleSimile = (): void => {
        const { dataModel } = this.props;
        const pieces = this.selectedPieces();
        if (pieces.length === 0) {
            return;
        }

        const value = !pieces.every((piece) => {
            return piece.measure.simile === true;
        });

        dataModel.setMeasureSimiles(pieces.map((piece) => {
            return { trackId: piece.track.id, bar: piece.measure.number };
        }), value);
    };

    private handleClear = (): void => {
        void requisitions.execute("selectionDeleteRequested", undefined);
    };
}
