/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { compareFractions, reduceFraction } from "../../../core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/selection-types.js";
import { NoteStyleIcon } from "../Note/NoteStyleIcon.js";
import { NoteStyleLineIcon, type INoteStyleLineEntry } from "../Note/NoteStyleLineIcon.js";
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

/** A note style together with its 0-based position in the instrument's style list. */
interface IStyleGroupEntry {
    style: IAudioData;
    index: number;
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
     * Renders the staff-mode controls. Styles that share the same note head are grouped into a
     * dropdown whose entries place each style on its note line, so they remain distinguishable.
     *
     * @param noteStyles The resolved note styles.
     * @param markedStyleId The style shared by the current selection, if any.
     * @param canEnter Whether note entry is currently possible.
     *
     * @returns The staff-mode control nodes.
     */
    private renderStaffControls(noteStyles: IAudioData[], markedStyleId: string | undefined,
        canEnter: boolean): ComponentChild[] {
        const groups = this.groupBySignature(noteStyles);
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
        const { style, index } = entry;

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
                <NoteStyleIcon noteStyle={style} data-tooltip="inherit" />
            </Button>
        );
    }

    /**
     * Renders a dropdown for a group of styles that share the same note head. The button shows all
     * styles stacked on their lines, while each entry renders one style on its own line.
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

        const entries: INoteStyleLineEntry[] = group.map((entry) => {
            return { noteStyle: entry.style, line: entry.style.noteLine ?? 1 };
        });

        const marked = group.find((entry) => {
            return entry.style.id === markedStyleId;
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
                icon={<NoteStyleLineIcon entries={entries} lineCount={lineCount} />}
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
     * Groups note styles by their visual signature, preserving the order of first appearance.
     *
     * @param noteStyles The note styles to group.
     *
     * @returns The groups, each containing the style entries with their original indices.
     */
    private groupBySignature(noteStyles: IAudioData[]): IStyleGroupEntry[][] {
        const groups: IStyleGroupEntry[][] = [];
        const bySignature = new Map<string, IStyleGroupEntry[]>();

        noteStyles.forEach((style, index) => {
            const signature = this.styleSignature(style);
            const group = bySignature.get(signature);
            if (group) {
                group.push({ style, index });
            } else {
                const newGroup = [{ style, index }];
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

        this.setState({ noteStyles, markedStyleId, canEnter: this.canEnterNotes(tracks) });
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
        if (tracks.length > 0) {
            const instrumentId = tracks[0].instrument.id;
            const allShareInstrument = tracks.every((track) => {
                return track.instrument.id === instrumentId;
            });

            if (allShareInstrument) {
                return Object.values(tracks[0].instrument.noteStyles);
            }
        }

        // Without a shared instrument (mixed selection or no selection) fall back to the first
        // track so the buttons stay visible, but disabled.
        const { dataModel } = this.props;
        const firstTrack = dataModel.arrangement?.tracks[0];

        return firstTrack ? Object.values(firstTrack.instrument.noteStyles) : [];
    }

    /**
     * Checks whether note entry is currently possible: a selection exists and all selected tracks
     * share the same instrument.
     *
     * @param tracks The distinct selected tracks.
     *
     * @returns True when the toolbar buttons can be used.
     */
    private canEnterNotes(tracks: ISbDmTrack[]): boolean {
        if (tracks.length === 0) {
            return false;
        }

        const instrumentId = tracks[0].instrument.id;

        return tracks.every((track) => {
            return track.instrument.id === instrumentId;
        });
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
