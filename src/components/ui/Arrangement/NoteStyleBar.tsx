/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Articulation, articulationOf, voiceKey } from "../../../core/articulation.js";
import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { compareFractions, reduceFraction } from "../../../core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
import { NoteStyleIcon } from "../Note/NoteStyleIcon.js";
import { NoteStyleLineIcon } from "../Note/NoteStyleLineIcon.js";
import { NoteStyleSymbolViewer } from "../Note/NoteStyleSymbolViewer.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface INoteStyleBarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;

    /** The active view mode; determines whether grid symbols or staff note heads are shown. */
    trackViewMode?: "grid" | "staff";
}

interface INoteStyleBarState {
    noteStyles: IAudioData[];
    markedStyleId?: string;
    canEnter: boolean;
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

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
    }

    public override render(): ComponentChild {
        const { noteStyles, markedStyleId, canEnter } = this.state;
        const { trackViewMode = "grid" } = this.props;

        const controls = trackViewMode === "staff"
            ? this.renderStaffControls(noteStyles, markedStyleId, canEnter)
            : this.renderGridControls(noteStyles, markedStyleId, canEnter);

        return (
            <Container
                className="noteStyleBarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                style={{ flex: 1, minWidth: 0 }}
            >
                <GooeyGroup
                    className="noteStyleBar"
                    background="var(--color-base-200)"
                    style={{ flex: 1, minWidth: 0, overflowX: "auto" }}
                >
                    {controls}
                </GooeyGroup>
            </Container>
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
                    className="noteStyleButton"
                    isDefault={style.id === markedStyleId}
                    disabled={!canEnter}
                    data-tooltip={`${this.styleDescription(style)} (${index + 1})`}
                    onClick={() => {
                        void requisitions.execute("noteEntryRequested", style.id);
                    }}
                >
                    <NoteStyleSymbolViewer noteStyle={style} data-tooltip="inherit" />
                </Button>
            );
        });
    }

    /**
     * Renders the staff-mode controls. Styles that differ only in articulation collapse into one
     * voice, and voices that share the same note head are grouped into a dropdown whose entries
     * place each voice on its note line, so they remain distinguishable.
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

        return groups.map((group) => {
            if (group.length === 1) {
                return this.renderStyleButton(group[0], markedStyleId, canEnter);
            }

            return this.renderStyleDropdown(group, markedStyleId, canEnter, lineCount);
        });
    }

    private renderStyleButton(entry: IStyleGroupEntry, markedStyleId: string | undefined,
        canEnter: boolean): ComponentChild {
        const { style, index, memberIds } = entry;
        const isMarked = markedStyleId !== undefined && memberIds.includes(markedStyleId);

        return (
            <Button
                key={style.id}
                className="noteStyleButton"
                isDefault={isMarked}
                disabled={!canEnter}
                data-tooltip={`${this.styleDescription(style)} (${index + 1})`}
                onClick={() => {
                    void requisitions.execute("noteEntryRequested", style.id);
                }}
            >
                <NoteStyleIcon noteStyle={style} data-tooltip="inherit" />
            </Button>
        );
    }

    /**
     * Renders a dropdown for a group of styles that share the same note head. The button shows the
     * shared note head alone, while each entry renders one style on its own note line.
     *
     * @param group The grouped style entries.
     * @param markedStyleId The style shared by the current selection, if any.
     * @param canEnter Whether note entry is currently possible.
     * @param lineCount The total number of staff lines for the instrument.
     *
     * @returns The dropdown node for the group.
     */
    private renderStyleDropdown(group: IStyleGroupEntry[], markedStyleId: string | undefined,
        canEnter: boolean, lineCount: number): ComponentChild {
        const items: IDropdownItem[] = group.map((entry) => {
            const { style, index } = entry;

            return {
                label: `${this.styleDescription(style)} (${index + 1})`,
                icon: (
                    <NoteStyleLineIcon
                        entries={[{ noteStyle: style, line: style.noteLine ?? 1 }]}
                        lineCount={lineCount}
                    />
                ),
                onClick: () => {
                    void requisitions.execute("noteEntryRequested", style.id);
                },
            };
        });

        const marked = group.find((entry) => {
            return markedStyleId !== undefined && entry.memberIds.includes(markedStyleId);
        });
        const selectedItem = marked !== undefined
            ? `${this.styleDescription(marked.style)} (${marked.index + 1})`
            : undefined;
        const tooltip = group.map((entry) => {
            return entry.style.symbol?.shortDescription ?? entry.style.id;
        }).join(", ");

        return (
            <Dropdown
                key={group[0].style.id}
                className="noteStyleDropdown"
                icon={<NoteStyleIcon noteStyle={group[0].style} />}
                items={items}
                closeOnSelect
                disabled={!canEnter}
                selectedItem={selectedItem}
                data-tooltip={tooltip}
            />
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
        const { selectionManager } = this.props;

        const entries = [...selectionManager.currentSelection.values()];
        const tracks = this.resolveSelectedTracks(entries);
        const noteStyles = this.resolveNoteStyles(tracks);
        const markedStyleId = this.resolveMarkedStyleId(tracks, entries);

        this.setState({ noteStyles, markedStyleId, canEnter: this.shareInstrument(tracks) });
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
     * Collects the distinct tracks referenced by the current selection.
     *
     * @param entries All current selection entries.
     *
     * @returns The distinct selected tracks, in order of first appearance.
     */
    private resolveSelectedTracks(entries: ISelectionEntry[]): ISbDmTrack[] {
        const { dataModel } = this.props;

        const trackIds = new Set(entries.map((entry) => {
            return entry.trackId;
        }));

        const tracks: ISbDmTrack[] = [];
        for (const trackId of trackIds) {
            const track = dataModel.arrangement?.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
            if (track) {
                tracks.push(track);
            }
        }

        return tracks;
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
     * Determines the note style shared by all currently selected notes across all selected tracks.
     *
     * @param tracks The distinct selected tracks.
     * @param entries All current selection entries.
     *
     * @returns The common note style id, or undefined when no single style is shared.
     */
    private resolveMarkedStyleId(tracks: ISbDmTrack[], entries: ISelectionEntry[]): string | undefined {
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

        const firstStyleId = this.noteStyleIdOf(tracks, noteEntries[0]);
        const allMatch = noteEntries.every((entry) => {
            return this.noteStyleIdOf(tracks, entry) === firstStyleId;
        });

        return allMatch ? firstStyleId : undefined;
    }

    private noteStyleIdOf(tracks: ISbDmTrack[], entry: ISelectionEntry): string | undefined {
        const track = tracks.find((candidate) => {
            return candidate.id === entry.trackId;
        });
        const measure = track?.measures.find((candidate) => {
            return candidate.number === entry.bar;
        });
        if (!measure) {
            return undefined;
        }

        const cellStart = entry.start ?? (entry.startStep === undefined
            ? undefined
            : reduceFraction(entry.startStep, measure.meter.stepResolution));
        if (cellStart === undefined) {
            return undefined;
        }

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
