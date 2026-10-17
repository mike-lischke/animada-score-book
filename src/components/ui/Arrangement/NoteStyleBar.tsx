/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Articulation, articulationOf, voiceKey } from "../../../core/articulation.js";
import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import { compareFractions } from "../../../core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../../core/types/general.js";
import { EditEntryMode, TrackViewMode } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
import { selectionTracksOf } from "../../../ui/selection-ranges.js";
import { NoteStyleIcon } from "../Note/NoteStyleIcon.js";
import { NoteStyleLineIcon } from "../Note/NoteStyleLineIcon.js";
import { NoteStyleSymbolViewer } from "../Note/NoteStyleSymbolViewer.js";
import { Button } from "../framework/Button.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface INoteStyleBarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;

    /** The active view mode; determines whether grid symbols or staff note heads are shown. */
    trackViewMode?: TrackViewMode;

    /**
     * The entry mode the view works in. Insert mode marks nothing, because an entry names the style
     * it writes; the selection there is merely the insertion point.
     */
    entryMode?: EditEntryMode;
}

interface INoteStyleBarState {
    noteStyles: IAudioData[];
    markedStyle?: IMarkedStyle;
    canEnter: boolean;
}

/** What the current selection shares: a note style, rests only, or nothing when it mixes. */
interface IMarkedStyle {
    /** The shared note style id, or undefined when every addressed event is a rest. */
    noteStyleId?: string;

    /** True when every addressed event is a rest. */
    isRest: boolean;
}

/** A note style voice shown in the toolbar, with the representative's 0-based position and all member ids. */
interface IStyleGroupEntry {
    style: IAudioData;
    index: number;
    memberIds: string[];
}

/**
 * Button bar showing the note styles of the currently selected track.
 * Clicking a style enters that note at the current grid cursor position.
 */
export class NoteStyleBar extends UIComponent<INoteStyleBarProps, INoteStyleBarState> {
    public constructor(props: INoteStyleBarProps) {
        super(props);

        this.state = {
            noteStyles: [],
            canEnter: false,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        this.refreshFromSelection();
    }

    public override componentDidUpdate(previousProps: INoteStyleBarProps): void {
        const { entryMode } = this.props;

        // Switching the mode switches where the mark comes from: the selection in overwrite mode, and
        // no mark at all in insert mode.
        if (previousProps.entryMode !== entryMode) {
            this.refreshFromSelection();
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
    }

    public override render(): ComponentChild {
        const { noteStyles, markedStyle, canEnter } = this.state;
        const { trackViewMode = TrackViewMode.Grid } = this.props;

        const restButton = this.renderRestButton(markedStyle, canEnter);
        const controls = trackViewMode === TrackViewMode.Staff
            ? this.renderStaffControls(noteStyles, markedStyle?.noteStyleId, canEnter)
            : this.renderGridControls(noteStyles, markedStyle?.noteStyleId, canEnter);

        return <>{restButton}{controls}</>;
    }

    /**
     * Renders the rest button, which leads the bar: it enters a rest at the cursor instead of a note
     * style. The button is marked while the selection holds rests only.
     *
     * @param markedStyle The style the selection shares, if any.
     * @param canEnter Whether note entry is currently possible.
     *
     * @returns The rest button node.
     */
    private renderRestButton(markedStyle: IMarkedStyle | undefined, canEnter: boolean): ComponentChild {
        return (
            <Button
                className="selection-toolbar-action noteStyleRestButton"
                isDefault={markedStyle?.isRest === true}
                disabled={!canEnter}
                title="Rest (0)"
                onClick={() => {
                    void requisitions.execute("restEntryRequested", undefined);
                }}
            >
                <ScoreSymbolView symbol={ScoreSymbol.RestQuarter} staffSpace={staffSpacePx} icon />
            </Button>
        );
    }

    /**
     * Renders one button per note style, showing the instrument's grid symbol.
     *
     * @param noteStyles The resolved note styles.
     * @param markedStyleId The style shared by the current selection, if any.
     * @param canEnter Whether note entry is currently possible.
     *
     * @returns The grid-mode control nodes.
     */
    private renderGridControls(noteStyles: IAudioData[], markedStyleId: string | undefined,
        canEnter: boolean): ComponentChild[] {
        return noteStyles.map((style, index) => {
            return (
                <Button
                    key={style.id}
                    className="selection-toolbar-action noteStyleButton"
                    isDefault={style.id === markedStyleId}
                    disabled={!canEnter}
                    title={`${this.styleDescription(style)} (${index + 1})`}
                    onClick={() => {
                        void requisitions.execute("noteEntryRequested", style.id);
                    }}
                >
                    <NoteStyleSymbolViewer noteStyle={style} />
                </Button>
            );
        });
    }

    /**
     * Renders the staff-mode controls: one button per voice. Styles that differ only in articulation collapse
     * into one voice, and a voice that shares its note head with another one shows the head on its note line,
     * which is what tells the two apart.
     *
     * @param noteStyles The resolved note styles.
     * @param markedStyleId The style shared by the current selection, if any.
     * @param canEnter Whether note entry is currently possible.
     *
     * @returns The staff-mode control nodes.
     */
    private renderStaffControls(noteStyles: IAudioData[], markedStyleId: string | undefined,
        canEnter: boolean): ComponentChild[] {
        const voices = this.collapseVoices(noteStyles);
        const groups = this.groupBySignature(voices);
        const lineCount = Math.max(1, ...noteStyles.map((style) => {
            return style.noteLine ?? 1;
        }));

        const buttons: ComponentChild[] = [];
        for (const group of groups) {
            for (const entry of group) {
                // A head that stands alone names its style; one of several voices needs the line it sits on.
                const lines = group.length === 1 ? undefined : lineCount;
                buttons.push(this.renderStyleButton(entry, markedStyleId, canEnter, lines));
            }
        }

        return buttons;
    }

    /**
     * Renders one voice as a button.
     *
     * @param entry The voice to render.
     * @param markedStyleId The style shared by the current selection, if any.
     * @param canEnter Whether note entry is currently possible.
     * @param staffLines The staff lines to draw the head on, or undefined for a head that stands alone.
     *
     * @returns The button carrying the voice.
     */
    private renderStyleButton(entry: IStyleGroupEntry, markedStyleId: string | undefined,
        canEnter: boolean, staffLines: number | undefined): ComponentChild {
        const { style, index, memberIds } = entry;
        const isMarked = markedStyleId !== undefined && memberIds.includes(markedStyleId);

        let icon: ComponentChild;
        if (staffLines === undefined) {
            icon = <NoteStyleIcon noteStyle={style} />;
        } else {
            icon = <NoteStyleLineIcon entries={[{ noteStyle: style, line: style.noteLine ?? 1 }]}
                lineCount={staffLines} />;
        }

        return (
            <Button
                key={style.id}
                className="selection-toolbar-action noteStyleButton"
                isDefault={isMarked}
                disabled={!canEnter}
                title={`${this.styleDescription(style)} (${index + 1})`}
                onClick={() => {
                    void requisitions.execute("noteEntryRequested", style.id);
                }}
            >
                {icon}
            </Button>
        );
    }

    /**
     * Builds a stable key describing the visual appearance of a note style in the toolbar: its
     * excitation mode, technique and note head type. Articulation and note line are excluded.
     *
     * @param style The note style to derive the key from.
     *
     * @returns A string key unique to the style's visual appearance.
     */
    private styleSignature(style: IAudioData): string {
        const { characteristics } = style;
        const technique = "handTechnique" in characteristics && characteristics.handTechnique !== undefined
            ? `hand:${characteristics.handTechnique}`
            : "stickTechnique" in characteristics && characteristics.stickTechnique !== undefined
                ? `stick:${characteristics.stickTechnique}`
                : "none";
        const displayType = "mainDisplayType" in characteristics ? characteristics.mainDisplayType : "";

        return `${characteristics.excitationMode}|${technique}|${displayType}`;
    }

    /**
     * Collapses ghost and muted samples into the preceding matching voice. Other variants remain
     * distinct styles even when they share their visual and playback characteristics.
     *
     * @param noteStyles The note styles to collapse.
     *
     * @returns The toolbar entries, keeping each representative's original index.
     */
    private collapseVoices(noteStyles: IAudioData[]): IStyleGroupEntry[] {
        const byVoice = new Map<string, IStyleGroupEntry>();
        const voices: IStyleGroupEntry[] = [];

        noteStyles.forEach((style, index) => {
            const key = voiceKey(style);
            const articulation = articulationOf(style);
            const isCollapsible = articulation === Articulation.Ghost || articulation === Articulation.Muted;
            const existing = isCollapsible ? byVoice.get(key) : undefined;
            if (existing !== undefined) {
                existing.memberIds.push(style.id);

                return;
            }

            const entry = { style, index, memberIds: [style.id] };
            if (!isCollapsible && !byVoice.has(key)) {
                byVoice.set(key, entry);
            }

            voices.push(entry);
        });

        return voices;
    }

    /**
     * Groups voice entries by their visual signature, preserving the order of first appearance.
     *
     * @param entries The voice entries to group.
     *
     * @returns The groups, each containing the entries of one signature.
     */
    private groupBySignature(entries: IStyleGroupEntry[]): IStyleGroupEntry[][] {
        const groups: IStyleGroupEntry[][] = [];
        const bySignature = new Map<string, IStyleGroupEntry[]>();

        entries.forEach((entry) => {
            const signature = this.styleSignature(entry.style);
            const group = bySignature.get(signature);
            if (group) {
                group.push(entry);
            } else {
                const newGroup = [entry];
                bySignature.set(signature, newGroup);
                groups.push(newGroup);
            }
        });

        return groups;
    }

    private styleDescription(style: IAudioData): string {
        return style.symbol?.description ?? style.symbol?.shortDescription ?? style.id;
    }

    private handleSelectionChanged = (): Promise<boolean> => {
        this.refreshFromSelection();

        return Promise.resolve(true);
    };

    private handleArrangementReverted = (): Promise<boolean> => {
        this.refreshFromSelection();

        return Promise.resolve(true);
    };

    private refreshFromSelection(): void {
        const { selectionManager, entryMode } = this.props;

        const entries = [...selectionManager.currentSelection.values()];
        const tracks = this.resolveSelectedTracks(entries);
        const noteStyles = this.resolveNoteStyles(tracks);
        const canEnter = this.shareInstrument(tracks);

        // Insert mode holds no style of its own: an entry names the style it writes, so no button is
        // marked and the mark of the overwrite mode is dropped.
        if (entryMode === EditEntryMode.Insert) {
            this.setState({ noteStyles, markedStyle: undefined, canEnter });

            return;
        }

        this.setState({ noteStyles, markedStyle: this.resolveMarkedStyle(tracks, entries), canEnter });
    }

    /**
     * Checks whether the given tracks all use the same instrument. Note styles are instrument
     * specific, so only such a selection can be entered or marked.
     *
     * @param tracks The distinct selected tracks.
     *
     * @returns True when at least one track is selected and all of them share one instrument.
     */
    private shareInstrument(tracks: ISbDmTrack[]): boolean {
        if (tracks.length === 0) {
            return false;
        }

        const instrumentId = tracks[0].instrument.id;

        return tracks.every((track) => {
            return track.instrument.id === instrumentId;
        });
    }

    /**
     * Collects the distinct tracks the current selection addresses. A whole measure covers every
     * track of its bar, so such a selection contributes all of them and note styles can only be
     * applied when they all share one instrument.
     *
     * @param entries All current selection entries.
     *
     * @returns The distinct selected tracks, in order of first appearance.
     */
    private resolveSelectedTracks(entries: ISelectionEntry[]): ISbDmTrack[] {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;

        return arrangement ? selectionTracksOf(arrangement, entries) : [];
    }

    /**
     * Resolves the note styles to display. With a shared instrument the styles of that instrument
     * are shown; otherwise the first track's instrument is used so the buttons remain visible.
     *
     * @param tracks The distinct selected tracks.
     *
     * @returns The resolved note styles, or an empty array without a usable instrument.
     */
    private resolveNoteStyles(tracks: ISbDmTrack[]): IAudioData[] {
        if (this.shareInstrument(tracks)) {
            return Object.values(tracks[0].instrument.noteStyles);
        }

        // Without a shared instrument (mixed selection or no selection) fall back to the first
        // track so the buttons stay visible, but disabled.
        const { dataModel } = this.props;
        const firstTrack = dataModel.arrangement?.tracks[0];

        return firstTrack ? Object.values(firstTrack.instrument.noteStyles) : [];
    }

    /**
     * Determines the style the currently selected notes share. Every addressed event has to carry the
     * same style, and a selection of rests marks the rest instead of a style.
     *
     * @param tracks The distinct selected tracks.
     * @param entries All current selection entries.
     *
     * @returns The shared style, or undefined when the selection shares none.
     */
    private resolveMarkedStyle(tracks: ISbDmTrack[], entries: ISelectionEntry[]): IMarkedStyle | undefined {
        const noteEntries = entries.filter((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        });

        if (noteEntries.length === 0) {
            return undefined;
        }

        // Style ids are only comparable within one instrument, so a mixed selection stays unmarked.
        if (!this.shareInstrument(tracks)) {
            return undefined;
        }

        const firstStyleId = this.noteStyleIdOf(noteEntries[0]);
        const allMatch = noteEntries.every((entry) => {
            return this.noteStyleIdOf(entry) === firstStyleId;
        });

        return allMatch ? { noteStyleId: firstStyleId, isRest: firstStyleId === undefined } : undefined;
    }

    private noteStyleIdOf(entry: ISelectionEntry): string | undefined {
        const { target } = entry;
        if (target.granularity !== SelectionGranularity.Note) {
            return undefined;
        }

        const { measure } = target;
        const cellStart = target.start ?? target.event.start;
        const noteEvent = measure.noteEvents.find((candidate) => {
            if (candidate.audioData === undefined) {
                return false;
            }

            // Only a note's start cell carries its style. Cells inside the note's duration are
            // absorbed rest steps and must not keep the style marked while navigating across them.
            return compareFractions(cellStart, candidate.start) === 0;
        });

        return noteEvent?.audioData?.id;
    }
}
