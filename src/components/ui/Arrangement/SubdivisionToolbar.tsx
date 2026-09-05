/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/selection-types.js";
import { TupletIcon } from "../Note/TupletIcon.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
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
                className="subdivisionToolbar"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                gap={4}
            >
                <Dropdown
                    icon={<TupletIcon />}
                    disabled={!canCreate}
                    closeOnSelect
                    items={dropdownItems}
                    data-tooltip="Add subdivision"
                />
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
        const selectedSubdivisionSlot = entries.length === 1 && entries[0].start !== undefined;

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
        if (entries.length === 0) {
            return 1;
        }

        const startSteps = entries.map((entry) => {
            return entry.startStep ?? 0;
        });
        const endSteps = entries.map((entry) => {
            return entry.endStep ?? 0;
        });

        return Math.max(...endSteps) - Math.min(...startSteps) + 1;
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
        const first = entries[0];

        return entries.every((entry) => {
            return entry.trackId === first.trackId
                && entry.bar === first.bar
                && entry.start === undefined
                && (entry.granularity === SelectionGranularity.Note
                    || entry.granularity === SelectionGranularity.NoteGroup)
                && entry.startStep !== undefined
                && entry.endStep !== undefined;
        });
    }
}
