/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Articulation, articulationOf, availableArticulations } from "../../../core/articulation.js";
import type { ISbDmTrack, ISbDmTrackMeasure, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { compareFractions } from "../../../core/serialisation/numeric-functions.js";
import type { IAudioData, IFraction } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionSerializer, type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
import { selectionEventsOf } from "../../../ui/selection-ranges.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface IArticulationToolbarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

interface IArticulationToolbarState {
    canEnter: boolean;
    activeArticulation?: Articulation;
    available: Set<Articulation>;
}

interface IArticulationOption {
    articulation: Articulation;
    tooltip: string;
}

/** The articulation choices offered by the toolbar, in display order. */
const articulationOptions: IArticulationOption[] = [
    { articulation: Articulation.Accent, tooltip: "Accent" },
    { articulation: Articulation.Muted, tooltip: "Damped" },
    { articulation: Articulation.Ghost, tooltip: "Ghost" },
];

/**
 * Toolbar for selecting the articulation (accent, damping, ghost) of notes. The availability of
 * each articulation and the currently active one are derived from the selected instrument's note
 * styles.
 */
export class ArticulationToolbar extends UIComponent<IArticulationToolbarProps, IArticulationToolbarState> {
    public constructor(props: IArticulationToolbarProps) {
        super(props);

        this.state = {
            canEnter: false,
            available: new Set(),
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
        const { canEnter, activeArticulation, available } = this.state;

        const buttons = articulationOptions.map((option) => {
            const isAvailable = available.has(option.articulation);

            return (
                <Button
                    key={option.articulation}
                    className="articulationButton"
                    isDefault={option.articulation === activeArticulation}
                    disabled={!canEnter || !isAvailable}
                    data-tooltip={option.tooltip}
                    onClick={() => {
                        this.selectArticulation(option.articulation);
                    }}
                >
                    {this.renderIcon(option.articulation)}
                </Button>
            );
        });

        return (
            <Container
                className="articulationToolbarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <GooeyGroup
                    className="articulationToolbar"
                    background="var(--color-base-200)"
                >
                    {buttons}
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

    private refreshState(): void {
        const { selectionManager } = this.props;

        const entries = [...selectionManager.currentSelection.values()];
        const tracks = this.resolveSelectedTracks(entries);
        const noteStyles = this.resolveNoteStyles(tracks);
        const markedStyleId = this.resolveMarkedStyleId(entries);

        const noteStyleList = Object.values(noteStyles);
        const markedStyle = markedStyleId === undefined
            ? undefined
            : noteStyleList.find((style) => {
                return style.id === markedStyleId;
            });

        // The mark follows the selection: it is dropped as soon as the addressed events do not share
        // one style. The buttons still show the styles of the selected instrument's reference style.
        const buttonStyle = markedStyle ?? noteStyleList.at(0);
        const activeArticulation = markedStyle === undefined
            ? undefined
            : articulationOf(markedStyle);
        const available = buttonStyle === undefined
            ? new Set<Articulation>()
            : availableArticulations(noteStyles, buttonStyle.id);

        this.setState({
            canEnter: this.canEnterNotes(tracks),
            activeArticulation,
            available,
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
        const tracks: ISbDmTrack[] = [];
        for (const entry of entries) {
            const track = SelectionSerializer.trackOf(entry);
            if (!tracks.includes(track)) {
                tracks.push(track);
            }
        }

        return tracks;
    }

    /**
     * Resolves the note styles of the selected instrument. With a shared instrument the styles of
     * that instrument are shown; otherwise the first track's instrument is used so the buttons can
     * still reflect a state while disabled.
     *
     * @param tracks The distinct selected tracks.
     *
     * @returns The resolved note styles, or an empty object without a usable instrument.
     */
    private resolveNoteStyles(tracks: ISbDmTrack[]): Record<string, IAudioData> {
        if (tracks.length > 0) {
            const instrumentId = tracks[0].instrument.id;
            const allShareInstrument = tracks.every((track) => {
                return track.instrument.id === instrumentId;
            });

            if (allShareInstrument) {
                return tracks[0].instrument.noteStyles;
            }
        }

        const { dataModel } = this.props;
        const firstTrack = dataModel.arrangement?.tracks[0];

        return firstTrack ? firstTrack.instrument.noteStyles : {};
    }

    /**
     * Checks whether articulation can be changed: a selection exists and all selected tracks share
     * the same instrument.
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
     * Determines the note style shared by all events the selection addresses. A whole track or measure
     * covers every one of its events, so one accented note among plain ones is enough to leave the
     * toolbar without a mark.
     *
     * @param entries All current selection entries.
     *
     * @returns The common note style id, or undefined when no single style is shared.
     */
    private resolveMarkedStyleId(entries: ISelectionEntry[]): string | undefined {
        const arrangement = this.props.dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const styleIds: string[] = [];

        for (const covered of selectionEventsOf(arrangement, entries)) {
            for (const index of covered.indexes) {
                const styleId = this.noteStyleIdAt(covered.measure, covered.measure.events[index].start);
                if (styleId === undefined) {
                    return undefined;
                }

                styleIds.push(styleId);
            }
        }

        const firstStyleId = styleIds.at(0);
        if (firstStyleId === undefined) {
            return undefined;
        }

        const allMatch = styleIds.every((styleId) => {
            return styleId === firstStyleId;
        });

        return allMatch ? firstStyleId : undefined;
    }

    /**
     * Resolves the note style of the event that starts at the given position. A rest carries none,
     * which leaves the selection without a common style.
     *
     * @param measure The measure holding the event.
     * @param start The exact start of the event.
     *
     * @returns The style id, or undefined without a usable note event.
     */
    private noteStyleIdAt(measure: ISbDmTrackMeasure, start: IFraction): string | undefined {
        const noteEvent = measure.noteEvents.find((candidate) => {
            return candidate.audioData !== undefined && compareFractions(candidate.start, start) === 0;
        });

        return noteEvent?.audioData?.id;
    }

    private selectArticulation(articulation: Articulation): void {
        this.setState({ activeArticulation: articulation });
        void requisitions.execute("articulationChanged", articulation);
    }

    private renderIcon(articulation: Articulation): ComponentChild {
        switch (articulation) {
            case Articulation.Accent: {
                return (
                    <svg className="articulation-icon" viewBox="0 0 16 16" width={16} height={16}
                        fill="none" stroke="currentColor" strokeWidth={2.5}
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="4,4 11,8 4,12" />
                    </svg>
                );
            }

            case Articulation.Muted: {
                return (
                    <svg className="articulation-icon" viewBox="0 0 16 16" width={16} height={16}
                        stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                        <line x1="8" y1="3" x2="8" y2="13" />
                        <line x1="3" y1="8" x2="13" y2="8" />
                    </svg>
                );
            }

            case Articulation.Ghost: {
                return (
                    <svg className="articulation-icon" viewBox="0 0 20 16" width={20} height={16}
                        fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                        aria-hidden="true">
                        <path d="M7 2 C4.5 4.5 4.5 11.5 7 14" />
                        <path d="M13 2 C15.5 4.5 15.5 11.5 13 14" />
                    </svg>
                );
            }

            default: {
                return null;
            }
        }
    }
}
