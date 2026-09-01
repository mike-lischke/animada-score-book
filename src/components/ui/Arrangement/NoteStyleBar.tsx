/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { compareFractions, reduceFraction } from "../../../core/serialisation/numeric-functions.js";
import type { IAudioData } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/selection-types.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { NoteStyleSymbolViewer } from "../Note/NoteStyleSymbolViewer.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Label } from "../framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface INoteStyleBarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

interface INoteStyleBarState {
    noteStyles: IAudioData[];
    markedStyleId?: string;
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
        const { noteStyles, markedStyleId } = this.state;

        const buttons = noteStyles.map((style, index) => {
            const tooltip = style.symbol?.description ?? style.symbol?.shortDescription ?? style.id;

            return (
                <Button
                    key={style.id}
                    className="noteStyleButton"
                    isDefault={style.id === markedStyleId}
                    data-tooltip={`${tooltip} (${index + 1})`}
                    onClick={() => {
                        void requisitions.execute("noteEntryRequested", style.id);
                    }}
                >
                    <NoteStyleSymbolViewer noteStyle={style} data-tooltip="inherit" />
                </Button>
            );
        });

        let label: ComponentChild;
        if (noteStyles.length > 0) {
            label = <Label caption="Note Styles" className="noteStyleLabel" />;
        }

        return (
            <Container
                className="noteStyleBarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                style={{ flex: 1, minWidth: 0 }}
            >
                {label}
                <GooeyGroup
                    className="noteStyleBar"
                    background="var(--color-base-200)"
                    style={{ flex: 1, minWidth: 0, overflowX: "auto" }}
                >
                    {buttons}
                </GooeyGroup>
            </Container>
        );
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

        this.setState({ noteStyles, markedStyleId });
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
     * Resolves the note styles to display. Styles are shown only when all selected tracks share the
     * same instrument, so a single consistent style set applies to the whole selection.
     *
     * @param tracks The distinct selected tracks.
     *
     * @returns The shared instrument's note styles, or an empty array without a shared instrument.
     */
    private resolveNoteStyles(tracks: ISbDmTrack[]): IAudioData[] {
        if (tracks.length === 0) {
            return [];
        }

        const instrumentId = tracks[0].instrument.id;
        const allShareInstrument = tracks.every((track) => {
            return track.instrument.id === instrumentId;
        });

        return allShareInstrument ? Object.values(tracks[0].instrument.noteStyles) : [];
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
