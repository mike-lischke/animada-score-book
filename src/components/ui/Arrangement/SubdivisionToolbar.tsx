/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { AppStorage } from "../../../core/AppStorage.js";
import { MeasureProjection } from "../../../core/MeasureProjection.js";
import { NoteLength, noteLengthDenominator } from "../../../core/rest-notation.js";
import type { ISbDmTrackPiece, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import { addFractions, compareFractions, subtractFractions } from "../../../core/serialisation/numeric-functions.js";
import type { IFraction } from "../../../core/types/general.js";
import { RepeatMark } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { maxTupletLevels } from "../../../core/tuplets.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type INoteCellTarget, type ISelectionEntry,
} from "../../../ui/SelectionSerializer.js";
import { TupletIcon } from "../Note/TupletIcon.js";
import { Separator } from "../Separator.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface ISubdivisionToolbarProps extends ICommonUIProperties {
    selectionManager: SelectionManager;
    dataModel: ScoreBookDataModel;
    showTuplets?: boolean;
    showSimile?: boolean;
    showRepeatBars?: boolean;
}

interface ISubdivisionToolbarState {
    canCreate: boolean;

    /** How many slots the selection can hold: one per shortest note value that fits into its span. */
    maxSlots: number;

    /** Whether the whole selection is track pieces the one-bar repeat mark can be toggled on. */
    canToggleSimile: boolean;

    /** Whether every addressed track piece carries the one-bar repeat mark. */
    simileActive: boolean;

    /** Whether every addressed bar can open a repeated section, which a bar closing it has to follow. */
    canMarkRepeatStart: boolean;

    /** Whether every addressed bar can close a repeated section, which a bar opening it has to precede. */
    canMarkRepeatEnd: boolean;

    /** Whether every addressed bar opens a repeated section. */
    repeatStartActive: boolean;

    /** Whether every addressed bar closes a repeated section. */
    repeatEndActive: boolean;

    /** True while the staff view is shown, the only view that offers the dynamics and repeat controls. */
    staffMode: boolean;
}

interface ISubdivisionOption {
    label: string;
    actual: number;
    normal: number;
}

/** The span one addressed element covers, as fractions of its measure. */
interface ISelectionBounds {
    start: IFraction;
    end: IFraction;
}

/** The shortest note value the score can express, which is also the shortest subdivision slot. */
const shortestNoteUnits = noteLengthDenominator(NoteLength.ThirtySecond);

/** Common tuplet ratios, mirroring the tuplet list MuseScore offers. */
const subdivisionOptions: ISubdivisionOption[] = [
    { label: "Duplet", actual: 2, normal: 3 },
    { label: "Triplet", actual: 3, normal: 2 },
    { label: "Quadruplet", actual: 4, normal: 3 },
    { label: "Quintuplet", actual: 5, normal: 4 },
    { label: "Sextuplet", actual: 6, normal: 4 },
    { label: "Septuplet", actual: 7, normal: 4 },
    { label: "Octuplet", actual: 8, normal: 6 },
    { label: "Nontuplet", actual: 9, normal: 8 },
];

/**
 * Toolbar for creating subdivisions. A subdivision is created either from the current cursor
 * position (a single selected note cell) or from a contiguous selection within a single track.
 * The grid view shows the tuplet dropdown alone; the dynamics and repeat controls belong to the
 * staff view, which draws what they mark.
 */
export class SubdivisionToolbar extends UIComponent<ISubdivisionToolbarProps, ISubdivisionToolbarState> {
    public constructor(props: ISubdivisionToolbarProps) {
        super(props);

        const settings = AppStorage.loadUISettings();
        this.state = {
            canCreate: false,
            maxSlots: 1,
            canToggleSimile: false,
            simileActive: false,
            canMarkRepeatStart: false,
            canMarkRepeatEnd: false,
            repeatStartActive: false,
            repeatEndActive: false,
            staffMode: (settings?.viewSettings?.arrangementViewSettings?.displayMode ?? "grid") === "staff",
        };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        requisitions.register("arrangementMutated", this.handleArrangementReverted);
        requisitions.register("trackViewModeToggled", this.handleViewModeToggled);
        this.refreshState();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
        requisitions.unregister("arrangementMutated", this.handleArrangementReverted);
        requisitions.unregister("trackViewModeToggled", this.handleViewModeToggled);
    }

    public override render(): ComponentChild {
        const { staffMode } = this.state;
        const { showTuplets = true, showSimile = true, showRepeatBars = true } = this.props;

        let tupletGroup: ComponentChild;
        if (showTuplets) {
            tupletGroup = this.renderTupletGroup();
        }

        let repeatGroup: ComponentChild;
        if (staffMode && (showSimile || showRepeatBars)) {
            repeatGroup = this.renderRepeatGroup(showSimile, showRepeatBars);
        }

        return (
            <Container
                className="subdivisionToolbarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                {tupletGroup}
                {repeatGroup}
            </Container>
        );
    }

    /**
     * Builds the group the grid view keeps: the tuplet dropdown and, in the staff view, the dynamics buttons.
     *
     * @returns The group's content.
     */
    private renderTupletGroup(): ComponentChild {
        const { canCreate } = this.state;
        const dropdownItems = this.buildDropdownItems();

        return (
            <GooeyGroup
                className="subdivisionToolbar"
                background="var(--color-base-200)"
            >
                <Dropdown
                    icon={<TupletIcon />}
                    disabled={!canCreate}
                    closeOnSelect
                    items={dropdownItems}
                    data-tooltip="Add subdivision"
                />
            </GooeyGroup>
        );
    }

    private renderRepeatGroup(showSimile: boolean, showRepeatBars: boolean): ComponentChild {
        const { canToggleSimile, simileActive } = this.state;
        const { canMarkRepeatStart, canMarkRepeatEnd, repeatStartActive, repeatEndActive } = this.state;
        let simileGroup: ComponentChild;
        if (showSimile) {
            simileGroup = (
                <GooeyGroup className="subdivisionToolbar" background="var(--color-base-200)">
                    <Button
                        isDefault={simileActive}
                        disabled={!canToggleSimile}
                        className="simileButton"
                        data-tooltip="One-bar repeat (simile)"
                        onClick={this.handleToggleSimile}
                    >
                        <ScoreSymbolView symbol={ScoreSymbol.MeasureRepeat} staffSpace={staffSpacePx} icon />
                    </Button>
                </GooeyGroup>
            );
        }

        let repeatButtons: ComponentChild;
        if (showRepeatBars) {
            repeatButtons = (
                <>
                    {showSimile && <Separator />}
                    <GooeyGroup
                        className="subdivisionToolbar"
                        background="var(--color-base-200)"
                    >
                        <Button
                            isDefault={repeatStartActive}
                            disabled={!canMarkRepeatStart}
                            data-tooltip="Repeat start"
                            onClick={this.handleToggleRepeatStart}
                        >
                            <ScoreSymbolView symbol={ScoreSymbol.RepeatStart} staffSpace={staffSpacePx} icon />
                        </Button>
                        <Button
                            isDefault={repeatEndActive}
                            disabled={!canMarkRepeatEnd}
                            data-tooltip="Repeat end"
                            onClick={this.handleToggleRepeatEnd}
                        >
                            <ScoreSymbolView symbol={ScoreSymbol.RepeatEnd} staffSpace={staffSpacePx} icon />
                        </Button>
                    </GooeyGroup>
                </>
            );
        }

        return (
            <>
                {simileGroup}
                {repeatButtons}
            </>
        );
    }

    private handleSelectionChanged = (): Promise<boolean> => {
        this.refreshState();

        return Promise.resolve(true);
    };

    private handleArrangementReverted = (): Promise<boolean> => {
        this.refreshState();

        return Promise.resolve(true);
    };

    private handleViewModeToggled = (mode: "grid" | "staff"): Promise<boolean> => {
        this.setState({ staffMode: mode === "staff" });

        return Promise.resolve(true);
    };

    private buildDropdownItems(): IDropdownItem[] {
        const { maxSlots } = this.state;
        const entries = [...this.props.selectionManager.currentSelection.values()];
        const selectedSubdivisionSlot = entries.length === 1
            && SelectionSerializer.addressesSubdivisionSlot(entries[0].target);

        return subdivisionOptions.map((option) => {
            const enabled = selectedSubdivisionSlot || option.actual <= maxSlots;

            return {
                label: option.label,
                disabled: !enabled,
                onClick: enabled
                    ? () => {
                        this.handleCreate(option);
                    }
                    : undefined,
            };
        });
    }

    /**
     * Resolves how many slots the selection can hold. The limit is the shortest note value the score
     * can express: a cell of a sixteenth grid holds two thirty-seconds, a selected quarter note in the
     * staff holds eight. The span comes from the addressed elements, so it matches what the view's
     * editor replaces — a staff run covers its whole event, a grid cell its cell.
     *
     * @param entries The selection entries to measure.
     *
     * @returns The number of slots, at least one.
     */
    private getMaxSlots(entries: ISelectionEntry[]): number {
        const duration = this.getSelectionDuration(entries);
        if (duration === undefined) {
            return 1;
        }

        return Math.max(1, Math.floor((duration.numerator * shortestNoteUnits) / duration.denominator));
    }

    /**
     * Resolves the duration the subdivision would replace: from the start of the first addressed
     * element to the end of the last one.
     *
     * @param entries The selection entries to measure.
     *
     * @returns The duration as a fraction of a bar, or undefined when nothing note-like is selected.
     */
    private getSelectionDuration(entries: ISelectionEntry[]): IFraction | undefined {
        let start: IFraction | undefined;
        let end: IFraction | undefined;

        for (const entry of entries) {
            const { target } = entry;
            if (!addressesNoteCells(target)) {
                continue;
            }

            const bounds = this.getBounds(target);
            if (start === undefined || compareFractions(bounds.start, start) < 0) {
                start = bounds.start;
            }

            if (end === undefined || compareFractions(bounds.end, end) > 0) {
                end = bounds.end;
            }
        }

        return start === undefined || end === undefined ? undefined : subtractFractions(end, start);
    }

    /**
     * Resolves the span one addressed element covers. A group spans its events, a single note the
     * addressed cell or run, which the serialiser stores as its end.
     *
     * @param target The addressed note or note group.
     *
     * @returns The start and end of the addressed span.
     */
    private getBounds(target: INoteCellTarget): ISelectionBounds {
        if (target.granularity === SelectionGranularity.Note) {
            return {
                start: target.start ?? target.event.start,
                end: target.end ?? addFractions(target.event.start, target.event.duration),
            };
        }

        const first = target.events[0];
        const last = target.events[target.events.length - 1];

        return { start: first.start, end: addFractions(last.start, last.duration) };
    }

    /**
     * Refreshes what the toolbar offers for the current selection.
     */
    private refreshState(): void {
        const { selectionManager } = this.props;
        const entries = [...selectionManager.currentSelection.values()];

        let canCreate = false;

        if (entries.length === 1 && entries[0].granularity === SelectionGranularity.Note) {
            canCreate = true;
        } else if (entries.length > 1) {
            canCreate = this.isSingleTrackNoteSelection(entries);
        }

        if (canCreate) {
            canCreate = this.shareTupletLevel(entries);
        }

        const measures = this.selectedTrackPieces();
        const canToggleSimile = measures.length > 0 && measures.every((measure) => {
            return measure.number > 1;
        });
        const simileActive = canToggleSimile && measures.every((measure) => {
            return measure.simile === true;
        });

        // A repeat mark is set on whole bars, and only where it can pair up with a counterpart: one that opens
        // needs a bar after it that closes it, one that closes needs a bar before it that opens it. A mark that
        // nothing can set or take off again is not shown as active either, so a button that does nothing is
        // neither lit nor clickable.
        const bars = this.selectedBars();
        const repeats = this.props.dataModel.arrangement?.repeatBars;
        const barCount = this.props.dataModel.arrangement?.timeParams.length ?? 0;
        const canMarkRepeatStart = bars.length > 0 && bars.every((bar) => {
            return bar < barCount;
        });
        const canMarkRepeatEnd = bars.length > 0 && bars.every((bar) => {
            return bar > 1;
        });
        const repeatStartActive = canMarkRepeatStart && bars.every((bar) => {
            return repeats?.get(bar)?.start === true;
        });
        const repeatEndActive = canMarkRepeatEnd && bars.every((bar) => {
            return repeats?.get(bar)?.end === true;
        });

        this.setState({
            canCreate,
            maxSlots: this.getMaxSlots(entries),
            canToggleSimile,
            simileActive,
            canMarkRepeatStart,
            canMarkRepeatEnd,
            repeatStartActive,
            repeatEndActive,
        });
    }

    /**
     * Resolves the measures the selection addresses, but only when the whole selection is track pieces.
     *
     * @returns The addressed measures, or an empty list when the selection is mixed or empty.
     */
    private selectedTrackPieces(): ISbDmTrackPiece[] {
        const entries = [...this.props.selectionManager.currentSelection.values()];
        if (entries.length === 0) {
            return [];
        }

        const measures: ISbDmTrackPiece[] = [];
        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.TrackPiece) {
                return [];
            }

            measures.push(target.measure);
        }

        return measures;
    }

    private handleToggleSimile = (): void => {
        const { dataModel } = this.props;
        const measures = this.selectedTrackPieces();
        if (measures.length === 0) {
            return;
        }

        const value = !measures.every((measure) => {
            return measure.simile === true;
        });

        dataModel.setMeasureSimiles(measures.map((measure) => {
            return { trackId: measure.track.id, bar: measure.number };
        }), value);
    };

    private handleToggleRepeatStart = (): void => {
        this.toggleRepeat(RepeatMark.Start);
    };

    private handleToggleRepeatEnd = (): void => {
        this.toggleRepeat(RepeatMark.End);
    };

    /**
     * Sets or clears a repeat mark on the selected bars, taking it off when every of them already carries it.
     *
     * @param mark The mark to toggle.
     */
    private toggleRepeat(mark: RepeatMark): void {
        const { dataModel } = this.props;
        const bars = this.selectedBars();
        if (bars.length === 0) {
            return;
        }

        const repeats = dataModel.arrangement?.repeatBars;
        const value = !bars.every((bar) => {
            return repeats?.get(bar)?.[mark] === true;
        });

        dataModel.setRepeatBars(bars, mark, value);
    }

    /**
     * Resolves the bars the selection addresses, but only when the whole selection is whole bars.
     *
     * @returns The addressed 1-based bar numbers, or an empty list when the selection is mixed or empty.
     */
    private selectedBars(): number[] {
        const entries = [...this.props.selectionManager.currentSelection.values()];
        if (entries.length === 0) {
            return [];
        }

        const bars: number[] = [];
        for (const entry of entries) {
            const { target } = entry;
            if (target.granularity !== SelectionGranularity.Measure) {
                return [];
            }

            bars.push(target.measure.number);
        }

        return bars;
    }

    /**
     * Checks whether the selection holds notes that share their tuplet level and whether one more
     * tuplet fits around them. A note that already sits inside the second level cannot take a third
     * one, because the staff has no room left for another bracket.
     *
     * @param entries The selection entries to inspect.
     *
     * @returns True when every addressed event shares a level that can take another tuplet.
     */
    private shareTupletLevel(entries: ISelectionEntry[]): boolean {
        let level: number | undefined;

        for (const entry of entries) {
            const { target } = entry;
            if (!addressesNoteCells(target)) {
                continue;
            }

            const events = target.granularity === SelectionGranularity.Note ? [target.event] : target.events;

            for (const event of events) {
                const index = target.measure.events.findIndex((candidate) => {
                    return compareFractions(candidate.start, event.start) === 0;
                });
                if (index < 0) {
                    return false;
                }

                const depth = MeasureProjection.tupletDepthOf(target.measure, index);
                if (level === undefined) {
                    level = depth;
                } else if (level !== depth) {
                    return false;
                }
            }
        }

        return level !== undefined && level < maxTupletLevels;
    }

    private handleCreate(option: ISubdivisionOption): void {
        void requisitions.execute("subdivisionCreationRequested", {
            actual: option.actual,
            normal: option.normal,
        });
    }

    private isSingleTrackNoteSelection(entries: ISelectionEntry[]): boolean {
        const first = entries[0].target;
        if (!addressesNoteCells(first)) {
            return false;
        }

        return entries.every((entry) => {
            const { target } = entry;
            if (!addressesNoteCells(target) || target.measure !== first.measure) {
                return false;
            }

            // Only grid-aligned cells form a subdivision span; a subdivision slot cannot.
            return !SelectionSerializer.addressesSubdivisionSlot(target);
        });
    }
}
