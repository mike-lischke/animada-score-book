/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import {
    NoteLength, noteValueForUnits, noteValueFraction, type INoteValue,
} from "../../../core/rest-notation.js";
import { compareFractions } from "../../../core/serialisation/numeric-functions.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { SelectionGranularity, type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
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
    shortcut: number;
}

interface INoteLengthToolbarState {
    hasSelection: boolean;

    /** The value the buttons apply: the one the selection shares, otherwise the last chosen one. */
    activeValue: INoteValue;

    /** Base length of the value the whole selection shares, for the highlight; undefined when mixed. */
    markedLength?: NoteLength;
}

/** Standard note lengths offered for note entry, longest first. */
const noteLengthOptions: INoteLengthOption[] = [
    { length: NoteLength.Whole, tooltip: "Whole note", shortcut: 1 },
    { length: NoteLength.Half, tooltip: "Half note", shortcut: 2 },
    { length: NoteLength.Quarter, tooltip: "Quarter note", shortcut: 3 },
    { length: NoteLength.Eighth, tooltip: "Eighth note", shortcut: 4 },
    { length: NoteLength.Sixteenth, tooltip: "Sixteenth note", shortcut: 5 },
    { length: NoteLength.ThirtySecond, tooltip: "Thirty-second note", shortcut: 6 },
];

/**
 * Toolbar for selecting the duration of the next note to enter. The selection is shared with the
 * input controller through the {@link requisitions} bus.
 */
export class NoteLengthToolbar extends UIComponent<INoteLengthToolbarProps, INoteLengthToolbarState> {
    public constructor(props: INoteLengthToolbarProps) {
        super(props);

        this.state = {
            hasSelection: false,
            activeValue: { length: NoteLength.Quarter, dotted: false },
        };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        requisitions.register("arrangementReverted", this.handleArrangementReverted);
        requisitions.register("arrangementMutated", this.handleArrangementMutated);
        requisitions.register("noteLengthChanged", this.handleNoteLengthChanged);
        this.refreshState(true);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
        requisitions.unregister("arrangementReverted", this.handleArrangementReverted);
        requisitions.unregister("arrangementMutated", this.handleArrangementMutated);
        requisitions.unregister("noteLengthChanged", this.handleNoteLengthChanged);
    }

    public override render(): ComponentChild {
        const { hasSelection, markedLength, activeValue } = this.state;

        const lengthButtons = noteLengthOptions.map((option) => {
            const value: INoteValue = { length: option.length, dotted: activeValue.dotted };
            const disabled = !hasSelection || !this.isAvailable(value);

            return (
                <Button
                    key={option.length}
                    className="noteLengthButton"
                    isDefault={option.length === markedLength}
                    disabled={disabled}
                    data-tooltip={`${option.tooltip} (Alt/Cmd+${option.shortcut})`}
                    onClick={() => {
                        this.selectLength(option.length);
                    }}
                >
                    {this.renderIcon(option.length)}
                </Button>
            );
        });

        // The dot is a modifier of the chosen length, so it sits behind the lengths and switches
        // their augmentation dot for the selection and for subsequently entered notes.
        const toggledValue: INoteValue = { length: activeValue.length, dotted: !activeValue.dotted };
        const dotButton = (
            <Button
                className="noteDotButton"
                isDefault={activeValue.dotted}
                disabled={!hasSelection || !this.isAvailable(toggledValue)}
                data-tooltip="Dotted (Alt/Cmd+.)"
                onClick={() => {
                    this.toggleDots();
                }}
            >
                {this.renderDotIcon()}
            </Button>
        );

        const buttons = [...lengthButtons, dotButton];

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
        this.refreshState(true);

        return Promise.resolve(true);
    };

    private handleArrangementReverted = (): Promise<boolean> => {
        // An undo restores content, so it is a content change like any other and must not announce a
        // length: the announcement would resize the just restored selection to the length it had
        // before the undo.
        this.refreshState(false);

        return Promise.resolve(true);
    };

    /**
     * Re-reads the marked length after a content change. It deliberately does not announce a length
     * on the bus, since a content change must never resize the selection.
     *
     * @returns True to signal that the event was handled.
     */
    private handleArrangementMutated = (): Promise<boolean> => {
        this.refreshState(false);

        return Promise.resolve(true);
    };

    private handleNoteLengthChanged = (value: INoteValue): Promise<boolean> => {
        this.setState({ activeValue: value, markedLength: value.length });

        return Promise.resolve(true);
    };

    /**
     * Derives the marked note value from the selected notes and rests. The mark is dropped as soon as
     * the selection mixes values, so it always shows the value shared by the whole selection.
     *
     * @param announceValue Whether the resolved value is published on the {@link requisitions} bus.
     */
    private refreshState(announceValue: boolean): void {
        const { selectionManager } = this.props;
        const entries = [...selectionManager.currentSelection.values()];
        const selectedValue = this.resolveMarkedValue(entries);

        if (announceValue && selectedValue !== undefined) {
            void requisitions.execute("noteLengthChanged", selectedValue);
        }

        this.setState({
            hasSelection: entries.length > 0,
            activeValue: selectedValue ?? this.state.activeValue,
            markedLength: selectedValue?.length,
        });
    }

    /**
     * Resolves the note value shared by all currently selected notes.
     *
     * @param entries All current selection entries.
     *
     * @returns The common note value, or undefined when no single value is shared.
     */
    private resolveMarkedValue(entries: ISelectionEntry[]): INoteValue | undefined {
        const noteEntries = entries.filter((entry) => {
            return entry.granularity === SelectionGranularity.Note;
        });

        if (noteEntries.length === 0) {
            return undefined;
        }

        const firstUnits = this.noteUnitsOf(noteEntries[0]);
        if (firstUnits === undefined) {
            return undefined;
        }

        const allMatch = noteEntries.every((entry) => {
            return this.noteUnitsOf(entry) === firstUnits;
        });

        return allMatch ? noteValueForUnits(firstUnits) : undefined;
    }

    /**
     * Resolves the duration of the event a selection entry addresses, in 32nd-note units.
     *
     * @param entry The selection entry to resolve.
     *
     * @returns The duration in 32nd-note units, or undefined when the entry addresses no event.
     */
    private noteUnitsOf(entry: ISelectionEntry): number | undefined {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const { target } = entry;
        if (target.granularity !== SelectionGranularity.Note) {
            return undefined;
        }

        // An entry refers to the measure it was resolved against. An undo replaces a track's measures
        // while the track object stays the same, so the current measure is found through the track.
        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === target.measure.track.id;
        });
        const measure = track?.measures[target.measure.number - 1];
        if (measure === undefined) {
            return undefined;
        }

        const cellStart = target.start ?? target.event.start;
        const event = measure.events.find((candidate) => {
            return compareFractions(cellStart, candidate.start) === 0;
        });
        if (!event) {
            return undefined;
        }

        const units = (event.duration.numerator * 32) / event.duration.denominator;

        return units;
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

    /**
     * Renders the dot the button adds to a value: a note head with an augmentation dot beside it.
     *
     * @returns The SVG symbol for the dot toggle.
     */
    private renderDotIcon(): ComponentChild {
        return (
            <svg className="noteLengthIcon" viewBox="0 0 24 32" width={24} height={32}
                stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle className="noteLengthIconHead hollow" cx="8" cy="16" r="6" />
                <circle className="noteLengthIconDot" cx="18" cy="16" r="3" />
            </svg>
        );
    }

    private selectLength(length: NoteLength): void {
        void requisitions.execute("noteLengthChanged", { length, dotted: this.state.activeValue.dotted });
    }

    /**
     * Switches the augmentation dot of the active value. The local state follows immediately, so the
     * button reflects the choice even when the edit itself changes nothing; the selection and the
     * arrangement handlers keep it in sync afterwards.
     */
    private toggleDots(): void {
        const { activeValue } = this.state;
        const value: INoteValue = { length: activeValue.length, dotted: !activeValue.dotted };

        this.setState({ activeValue: value });
        void requisitions.execute("noteLengthChanged", value);
    }

    /**
     * Checks whether a note value fits into a single bar on the current step grid.
     *
     * @param value The note value to evaluate.
     *
     * @returns True when the value resolves to a whole number of grid steps within one bar.
     */
    private isAvailable(value: INoteValue): boolean {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement;
        const stepsPerWholeNote = arrangement?.timeParams.stepResolution;
        const stepsPerBar = arrangement?.tracks[0]?.measures[0]?.meter.stepResolution;

        if (stepsPerWholeNote === undefined || stepsPerBar === undefined) {
            return false;
        }

        const fraction = noteValueFraction(value);
        const steps = (stepsPerWholeNote * fraction.numerator) / fraction.denominator;

        return Number.isInteger(steps) && steps >= 1 && steps <= stepsPerBar;
    }
}
