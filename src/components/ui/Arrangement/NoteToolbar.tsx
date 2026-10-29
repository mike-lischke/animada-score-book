/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { EditEntryMode, TrackViewMode } from "../../../core/types/general.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, SelectionSerializer, type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";
import { ArticulationToolbar } from "./ArticulationToolbar.js";
import { NoteLengthToolbar } from "./NoteLengthToolbar.js";
import { NoteStyleBar } from "./NoteStyleBar.js";
import { SelectionToolbar, type ISelectionToolbarSection, type ISelectionToolbarTitle } from "./SelectionToolbar.js";
import { SubdivisionToolbar } from "./SubdivisionToolbar.js";

export interface INoteToolbarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
    trackViewMode: TrackViewMode;
    entryMode: EditEntryMode;
}

/**
 * The tools of a note selection, grouped in the card that every selection popup shares: the styles, the values
 * and the articulations the addressed notes can take, plus the tuplets a selection of note cells can become.
 */
export class NoteToolbar extends SelectionToolbar<INoteToolbarProps, Record<string, never>> {
    /**
     * Whether the note tools address anything in the given selection. They need an addressed note: what a whole
     * track or bar carries is not a note of its own.
     *
     * @param entries The selection entries.
     *
     * @returns True when the card offers a tool for the selection.
     */
    public static carriesTools(entries: ISelectionEntry[]): boolean {
        return entries.some((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });
    }

    protected override get toolbarTitle(): ISelectionToolbarTitle {
        const { selectionManager } = this.props;
        const entries = selectionManager.currentCursor === undefined
            ? [...selectionManager.currentSelection.values()] : [selectionManager.currentCursor];
        const tracks = entries.map((entry) => {
            return SelectionSerializer.trackOf(entry);
        });
        const bars = entries.map((entry) => {
            return SelectionSerializer.barOf(entry);
        });

        return SelectionToolbar.titleOf(tracks, bars);
    }

    protected override get toolbarSections(): ISelectionToolbarSection[] {
        const { dataModel, selectionManager, trackViewMode, entryMode } = this.props;
        const entries = [...selectionManager.currentSelection.values()];

        const styleSection: ISelectionToolbarSection = {
            label: "Note style & technique",
            badge: "Percussion",
            className: "note-style-bar",
            tray: true,
            content: (
                <NoteStyleBar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    trackViewMode={trackViewMode}
                    entryMode={entryMode}
                />
            ),
        };

        // A length is entered at the staff view, which is the only view that draws note values.
        const lengthSection: ISelectionToolbarSection = {
            label: "Note value / duration",
            className: "note-length-toolbar",
            content: (
                <NoteLengthToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={entryMode}
                />
            ),
        };

        const articulationSection: ISelectionToolbarSection = {
            label: "Articulation",
            className: "articulation-toolbar",
            content: (
                <ArticulationToolbar
                    dataModel={dataModel}
                    selectionManager={selectionManager}
                    entryMode={entryMode}
                />
            ),
        };

        // A subdivision is cut out of the note cells of one measure, so a coarser selection cannot take one.
        const tupletSection: ISelectionToolbarSection = {
            label: "Tuplets",
            className: "subdivision-toolbar",
            content: <SubdivisionToolbar selectionManager={selectionManager} />,
        };

        const allNoteCells = entries.every((entry) => {
            return entry.granularity === SelectionGranularity.Note
                || entry.granularity === SelectionGranularity.NoteGroup;
        });

        const sections: ISelectionToolbarSection[] = [styleSection];
        if (trackViewMode === TrackViewMode.Staff) {
            sections.push(lengthSection);
        }

        sections.push(articulationSection);
        if (allNoteCells && entries.length > 0) {
            sections.push(tupletSection);
        }

        return sections;
    }
}
