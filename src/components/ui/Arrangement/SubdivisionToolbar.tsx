/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { NoteLength, noteLengthDenominator } from "../../../core/rest-notation.js";
import { addFractions, compareFractions, subtractFractions } from "../../../core/serialisation/numeric-functions.js";
import type { IFraction } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type INoteCellTarget, type ISelectionEntry,
} from "../../../ui/SelectionSerializer.js";
import { TupletIcon } from "../Note/TupletIcon.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface ISubdivisionToolbarProps extends ICommonUIProperties {
    selectionManager: SelectionManager;
}

interface ISubdivisionToolbarState {
    canCreate: boolean;

    /** How many slots the selection can hold: one per shortest note value that fits into its span. */
    maxSlots: number;
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
 */
export class SubdivisionToolbar extends UIComponent<ISubdivisionToolbarProps, ISubdivisionToolbarState> {
    public constructor(props: ISubdivisionToolbarProps) {
        super(props);

        this.state = {
            canCreate: false,
            maxSlots: 1,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        this.refreshState();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
    }

    public override render(): ComponentChild {
        const { canCreate } = this.state;

        const dropdownItems = this.buildDropdownItems();

        return (
            <Container
                className="subdivisionToolbarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
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
            </Container>
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

        this.setState({ canCreate, maxSlots: this.getMaxSlots(entries) });
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
