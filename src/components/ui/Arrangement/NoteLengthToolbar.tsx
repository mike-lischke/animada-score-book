/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { noteLengthForSteps, NoteLength, noteLengthDenominator } from "../../../core/rest-notation.js";
import { compareFractions, reduceFraction } from "../../../core/serialisation/numeric-functions.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/selection-types.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface INoteLengthToolbarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

interface INoteLengthOption {
    length: NoteLength;
    tooltip: string;
}

interface INoteLengthToolbarState {
    hasSelection: boolean;
    markedLength?: NoteLength;
}

/** Standard note lengths offered for note entry, longest first. */
const noteLengthOptions: INoteLengthOption[] = [
    { length: NoteLength.Whole, tooltip: "Whole note" },
    { length: NoteLength.Half, tooltip: "Half note" },
    { length: NoteLength.Quarter, tooltip: "Quarter note" },
    { length: NoteLength.Eighth, tooltip: "Eighth note" },
    { length: NoteLength.Sixteenth, tooltip: "Sixteenth note" },
    { length: NoteLength.ThirtySecond, tooltip: "Thirty-second note" },
];

/**
 * Toolbar for selecting the duration of the next note to enter. The selection is shared with the
 * input controller through the {@link requisitions} bus.
 */
export class NoteLengthToolbar extends UIComponent<INoteLengthToolbarProps, INoteLengthToolbarState> {
    public constructor(props: INoteLengthToolbarProps) {
        super(props);

        this.state = { hasSelection: false };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        this.refreshState();

        // Sync the input controller with the visible default so a remounted toolbar (e.g. after
        // toggling edit mode) cannot drift from the length the controller actually applies.
        void requisitions.execute("noteLengthChanged", NoteLength.Quarter);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
    }

    public override render(): ComponentChild {
        const { hasSelection, markedLength } = this.state;

        const buttons = noteLengthOptions.map((option) => {
            const disabled = !this.isAvailable(option.length) || !hasSelection;

            return (
                <Button
                    key={option.length}
                    className="noteLengthButton"
                    isDefault={option.length === markedLength}
                    disabled={disabled}
                    data-tooltip={option.tooltip}
                    onClick={() => {
                        this.selectLength(option.length);
                    }}
                >
                    {this.renderIcon(option.length)}
                </Button>
            );
        });

        return (
            <Container
                className="noteLengthToolbarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <GooeyGroup
                    className="noteLengthToolbar"
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

        this.setState({
            hasSelection: entries.length > 0,
            markedLength: this.resolveMarkedLength(tracks, entries),
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
     * Resolves the note length shared by all currently selected notes.
     *
     * @param tracks The distinct selected tracks.
     * @param entries All current selection entries.
     *
     * @returns The common note length, or undefined when no single length is shared.
     */
    private resolveMarkedLength(tracks: ISbDmTrack[], entries: ISelectionEntry[]): NoteLength | undefined {
        const noteEntries = entries.filter((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        });

        if (noteEntries.length === 0) {
            return undefined;
        }

        const firstLength = this.noteLengthOf(tracks, noteEntries[0]);
        const allMatch = noteEntries.every((entry) => {
            return this.noteLengthOf(tracks, entry) === firstLength;
        });

        return allMatch ? firstLength : undefined;
    }

    private noteLengthOf(tracks: ISbDmTrack[], entry: ISelectionEntry): NoteLength | undefined {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

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
            return compareFractions(cellStart, candidate.start) === 0;
        });
        if (!noteEvent) {
            return undefined;
        }

        const steps = (noteEvent.duration.numerator * measure.meter.stepResolution)
            / noteEvent.duration.denominator;
        if (!Number.isInteger(steps)) {
            return undefined;
        }

        return noteLengthForSteps(steps, arrangement.timeParams.stepResolution);
    }

    /**
     * Renders an abstract note symbol for a note length: a circle, an optional vertical line
     * beside it and up to three horizontal lines for shorter values. Whole and half notes use a
     * hollow head.
     *
     * @param length The note length to render.
     *
     * @returns The SVG symbol for the note length.
     */
    private renderIcon(length: NoteLength): ComponentChild {
        const filled = length !== NoteLength.Whole && length !== NoteLength.Half;
        const hasLine = length !== NoteLength.Whole;
        const headX = hasLine ? 8 : 12;

        const flags: ComponentChild[] = [];
        const flagCount = this.flagCountFor(length);
        const spacing = 4;
        const flagSpan = (flagCount - 1) * spacing;
        const topY = 16 - (flagSpan / 2);
        for (let index = 0; index < flagCount; index++) {
            const y = topY + (index * spacing);

            flags.push(<line key={index} x1="18" y1={y} x2="23" y2={y} strokeWidth={1} />);
        }

        return (
            <svg className="noteLengthIcon" viewBox="0 0 24 32" width={24} height={32}
                stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle className={filled ? "noteLengthIconHead" : "noteLengthIconHead hollow"}
                    cx={headX} cy="16" r="6" />
                {hasLine ? <line x1="18" y1="10" x2="18" y2="22" /> : null}
                {flags}
            </svg>
        );
    }

    private flagCountFor(length: NoteLength): number {
        switch (length) {
            case NoteLength.Eighth: {
                return 1;
            }

            case NoteLength.Sixteenth: {
                return 2;
            }

            case NoteLength.ThirtySecond: {
                return 3;
            }

            default: {
                return 0;
            }
        }
    }

    private selectLength(length: NoteLength): void {
        void requisitions.execute("noteLengthChanged", length);
    }

    /**
     * Checks whether a note length fits into a single bar on the current step grid.
     *
     * @param length The note length to evaluate.
     *
     * @returns True when the value resolves to a whole number of grid steps within one bar.
     */
    private isAvailable(length: NoteLength): boolean {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        const stepsPerWholeNote = arrangement?.timeParams.stepResolution;
        const stepsPerBar = arrangement?.tracks[0]?.measures[0]?.meter.stepResolution;

        if (stepsPerWholeNote === undefined || stepsPerBar === undefined) {
            return false;
        }

        const steps = stepsPerWholeNote / noteLengthDenominator(length);

        return Number.isInteger(steps) && steps >= 1 && steps <= stepsPerBar;
    }
}
