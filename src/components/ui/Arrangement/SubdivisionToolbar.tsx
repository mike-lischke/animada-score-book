/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import {
    addressesNoteCells, SelectionGranularity, SelectionSerializer, type ISelectionEntry,
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
    selectionSpan: number;
}

interface ISubdivisionOption {
    label: string;
    actual: number;
    normal: number;
}

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
            selectionSpan: 1,
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
        const { selectionSpan } = this.state;
        const entries = [...this.props.selectionManager.currentSelection.values()];
        const selectedSubdivisionSlot = entries.length === 1
            && SelectionSerializer.addressesSubdivisionSlot(entries[0].target);

        return subdivisionOptions.map((option) => {
            const enabled = selectedSubdivisionSlot || option.actual <= selectionSpan * 2;

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

    private getSelectionSpan(entries: ISelectionEntry[]): number {
        let minCell = Number.MAX_SAFE_INTEGER;
        let maxCell = Number.MIN_SAFE_INTEGER;

        for (const entry of entries) {
            const { target } = entry;
            if (!addressesNoteCells(target)) {
                continue;
            }

            const first = target.granularity === SelectionGranularity.Note
                ? target.start ?? target.event.start
                : target.events[0].start;
            const last = target.granularity === SelectionGranularity.Note
                ? first
                : target.events[target.events.length - 1].start;

            minCell = Math.min(minCell, SelectionSerializer.cellOf(first, target.measure));
            maxCell = Math.max(maxCell, SelectionSerializer.cellOf(last, target.measure));
        }

        return maxCell === Number.MIN_SAFE_INTEGER ? 1 : maxCell - minCell + 1;
    }

    private handleCreate(option: ISubdivisionOption): void {
        void requisitions.execute("subdivisionCreationRequested", {
            actual: option.actual,
            normal: option.normal,
        });
    }

    private refreshState(): void {
        const { selectionManager } = this.props;
        const entries = [...selectionManager.currentSelection.values()];

        let canCreate = false;

        if (entries.length === 1 && entries[0].granularity === SelectionGranularity.Note) {
            canCreate = true;
        } else if (entries.length > 1) {
            canCreate = this.isSingleTrackNoteSelection(entries);
        }

        this.setState({ canCreate, selectionSpan: this.getSelectionSpan(entries) });
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
