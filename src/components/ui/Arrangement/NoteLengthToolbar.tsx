/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrackMeasure, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { MeasureProjection } from "../../../core/MeasureProjection.js";
import {
    NoteLength, noteLengthDenominator, noteValueForEvent, noteValueFraction, type INoteValue,
} from "../../../core/rest-notation.js";
import { reduceFraction } from "../../../core/serialisation/numeric-functions.js";
import { TimeCoordinator } from "../../../player/TimeCoordinator.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { type ISelectionEntry } from "../../../ui/SelectionSerializer.js";
import { selectionEventsOf, type IAddressedMeasureEvents } from "../../../ui/selection-ranges.js";
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
    /** Whether the selection holds an event the model can give a new length. */
    canResize: boolean;

    /** The value the buttons apply: the one the selection shares, otherwise the last chosen one. */
    activeValue: INoteValue;

    /** Base length of the value the whole selection shares, for the highlight; undefined when mixed. */
    markedLength?: NoteLength;

    /** Augmentation dot the whole selection shares, for the dot button; undefined when mixed. */
    markedDotted?: boolean;
}

/** The note value a selection shares, with each property undefined when its members differ. */
interface ISharedNoteValue {
    length?: NoteLength;
    dotted?: boolean;
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

/** Position, size and border width of a note head symbol, in the user units of the icon. */
interface INoteHeadGeometry {
    centerX: number;
    centerY: number;
    radius: number;
    lineWidth: number;
}

/** Size of the square icon the note symbols are drawn in. */
const noteIconSize = 20;

/** Border width of the note symbols. */
const noteHeadLineWidth = 1;

/** The circle the plain note values show, centered in the icon. */
const noteHeadCircle: INoteHeadGeometry = {
    centerX: noteIconSize / 2,
    centerY: noteIconSize / 2,
    radius: 8,
    lineWidth: noteHeadLineWidth,
};

/**
 * The quarter the flagged values show. It carries twice the radius of the circle and is centered in
 * the icon as a shape, so it deliberately does not follow the circles of the longer values.
 */
const noteHeadQuarter: INoteHeadGeometry = {
    centerX: (noteIconSize - (noteHeadCircle.radius * 2)) / 2,
    centerY: (noteIconSize + (noteHeadCircle.radius * 2)) / 2,
    radius: noteHeadCircle.radius * 2,
    lineWidth: noteHeadLineWidth,
};

/**
 * Rounds a path coordinate, which trims the floating point noise of trigonometric end points.
 *
 * @param value The coordinate to round.
 *
 * @returns The coordinate, rounded to two decimals.
 */
const roundCoordinate = (value: number): number => {
    return Math.round(value * 100) / 100;
};

/**
 * Toolbar for selecting the duration of the next note to enter. The selection is shared with the
 * input controller through the {@link requisitions} bus.
 */
export class NoteLengthToolbar extends UIComponent<INoteLengthToolbarProps, INoteLengthToolbarState> {
    public constructor(props: INoteLengthToolbarProps) {
        super(props);

        this.state = {
            canResize: false,
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
        const { canResize, markedLength, markedDotted, activeValue } = this.state;

        const lengthButtons = noteLengthOptions.map((option) => {
            const value: INoteValue = { length: option.length, dotted: activeValue.dotted };
            const disabled = !canResize || !this.isAvailable(value);

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
                isDefault={markedDotted === true}
                disabled={!canResize || !this.isAvailable(toggledValue)}
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
        // The announcement is a request: only the model decides whether the value applies. With a
        // selection the mark is therefore taken from the events, and without one the value is the
        // one the next note is entered with.
        if (this.props.selectionManager.currentSelection.size === 0) {
            this.setState({
                activeValue: value,
                markedLength: undefined,
                markedDotted: undefined,
            });
        } else {
            this.refreshState(false);
        }

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
        const shared = this.resolveSharedValue(entries);
        const { activeValue } = this.state;

        if (announceValue && shared.length !== undefined) {
            void requisitions.execute("noteLengthChanged", {
                length: shared.length,
                dotted: shared.dotted ?? activeValue.dotted,
            });
        }

        this.setState({
            canResize: this.canResizeSelection(entries),
            activeValue: { length: shared.length ?? activeValue.length, dotted: shared.dotted ?? activeValue.dotted },
            markedLength: shared.length,
            markedDotted: shared.dotted,
        });
    }

    /**
     * Checks whether the selection holds an event the model can give a new length. A slot of a
     * subdivision keeps the length its ratio dictates, so it offers none. Every other selection does,
     * a whole track or measure as much as a single note.
     *
     * @param entries All current selection entries.
     *
     * @returns True when at least one addressed event takes a length change.
     */
    private canResizeSelection(entries: ISelectionEntry[]): boolean {
        return this.addressedEvents(entries).some((covered) => {
            return covered.indexes.some((index) => {
                return MeasureProjection.subdivisionDepthOf(covered.measure, index) === 0;
            });
        });
    }

    /**
     * Resolves the note value the selection shares. The base length and the augmentation dot are
     * resolved on their own, so a selection whose members share only their lengths still marks that
     * length. A property the members do not share stays undefined, which leaves it without a mark.
     *
     * @param entries All current selection entries.
     *
     * @returns The shared length and dot, each undefined when the selection does not share it.
     */
    private resolveSharedValue(entries: ISelectionEntry[]): ISharedNoteValue {
        const values: INoteValue[] = [];

        for (const covered of this.addressedEvents(entries)) {
            for (const index of covered.indexes) {
                const value = this.noteValueOf(covered.measure, index);
                if (value === undefined) {
                    return {};
                }

                values.push(value);
            }
        }

        const firstValue = values.at(0);
        if (firstValue === undefined) {
            return {};
        }

        const lengthsMatch = values.every((value) => {
            return value.length === firstValue.length;
        });
        const dotsMatch = values.every((value) => {
            return value.dotted === firstValue.dotted;
        });

        return {
            length: lengthsMatch ? firstValue.length : undefined,
            dotted: dotsMatch ? firstValue.dotted : undefined,
        };
    }

    /**
     * Resolves the note value the staff view draws a measure event with. A slot of a real subdivision
     * has no value of its own, so it resolves to the value of its subdivision.
     *
     * @param measure The measure holding the event.
     * @param index The index of the event in the measure.
     *
     * @returns The note value, or undefined when the arrangement is not loaded.
     */
    private noteValueOf(measure: ISbDmTrackMeasure, index: number): INoteValue | undefined {
        const arrangement = this.props.dataModel.arrangement;
        if (!arrangement) {
            return undefined;
        }

        const depth = MeasureProjection.subdivisionDepthOf(measure, index);

        return noteValueForEvent(measure.events[index].duration, depth, measure.meter.stepResolution,
            TimeCoordinator.stepsPerPulseOf(arrangement.timeParams));
    }

    /**
     * Resolves the measure events the selection addresses. A whole track or a whole measure covers all
     * of its events, so it takes a length like any other selection.
     *
     * @param entries All current selection entries.
     *
     * @returns The addressed measures with their event indexes.
     */
    private addressedEvents(entries: ISelectionEntry[]): IAddressedMeasureEvents[] {
        const arrangement = this.props.dataModel.arrangement;

        return arrangement ? selectionEventsOf(arrangement, entries) : [];
    }

    /**
     * Renders the note symbol for a note length: the head outline plus a segment filled from its
     * apex, which spans the share of a whole circle the note value stands for. The segment is drawn
     * over the outline and reaches exactly to its outer edge, so it hides the outline where it lies.
     * Both are separate elements, because they carry different colors.
     *
     * @param length The note length to render.
     *
     * @returns The SVG symbol for the note length.
     */
    private renderIcon(length: NoteLength): ComponentChild {
        const flagged = this.isFlagged(length);
        const head = flagged ? noteHeadQuarter : noteHeadCircle;
        const segment = this.segmentPathFor(head, length);
        const segmentPath = segment.length > 0
            ? <path className="noteLengthIconFill" d={segment} />
            : undefined;

        // The quarter of the flagged values is a band with straight edges, which only a path can
        // describe. The plain values are a full circle, so a stroked circle draws their outline.
        let outline: ComponentChild;
        if (flagged) {
            outline = <path className="noteLengthIconOutline" d={this.quarterOutlinePathFor(head)} />;
        } else {
            outline = (
                <circle className="noteLengthIconRing" cx={head.centerX} cy={head.centerY} r={head.radius}
                    strokeWidth={head.lineWidth} />
            );
        }

        return (
            <svg className="noteLengthIcon" viewBox={`0 0 ${noteIconSize} ${noteIconSize}`}
                width={noteIconSize} height={noteIconSize} aria-hidden="true">
                {outline}
                {segmentPath}
            </svg>
        );
    }

    /**
     * Note values shorter than a quarter are flagged. Their head shows a quarter of the outline
     * instead of a full circle.
     *
     * @param length The note length to check.
     *
     * @returns True for the flagged values, which follow the quarter note in the enum order.
     */
    private isFlagged(length: NoteLength): boolean {
        return length >= NoteLength.Eighth;
    }

    /**
     * Describes the band along the vertical edge of a flagged value, which runs from the apex to the
     * arc. The filled segment takes the same band over, so it covers the outline there completely.
     *
     * @param head The geometry of the head to build the band for.
     *
     * @returns The `d` attribute of the band.
     */
    private verticalEdgePathFor(head: INoteHeadGeometry): string {
        const { centerX, centerY, radius, lineWidth } = head;
        const half = lineWidth / 2;
        const outerRadius = radius + half;

        return `M ${centerX - half} ${centerY + half} L ${centerX - half} ${centerY - outerRadius} ` +
            `L ${centerX + half} ${centerY - outerRadius} L ${centerX + half} ${centerY + half} Z`;
    }

    /**
     * Describes the outline of a flagged value as the border of the top-right quarter: the band
     * along the arc plus a band along each of the two straight edges, which close the quarter into
     * a shape. Both edge bands reach past the apex, so they overlap there and form the square
     * corner of a mitred join.
     *
     * @param head The geometry of the head to build the outline for.
     *
     * @returns The `d` attribute of the quarter outline subpaths.
     */
    private quarterOutlinePathFor(head: INoteHeadGeometry): string {
        const { centerX, centerY, radius, lineWidth } = head;
        const half = lineWidth / 2;
        const outerRadius = radius + half;
        const innerRadius = radius - half;
        const arc = `M ${centerX} ${centerY - outerRadius} A ${outerRadius} ${outerRadius} 0 0 1 ` +
            `${centerX + outerRadius} ${centerY} L ${centerX + innerRadius} ${centerY} ` +
            `A ${innerRadius} ${innerRadius} 0 0 0 ${centerX} ${centerY - innerRadius} Z`;
        const rightEdge = `M ${centerX - half} ${centerY - half} L ${centerX + outerRadius} ${centerY - half} ` +
            `L ${centerX + outerRadius} ${centerY + half} L ${centerX - half} ${centerY + half} Z`;

        return `${arc} ${this.verticalEdgePathFor(head)} ${rightEdge}`;
    }

    /**
     * Builds the filled segment of a note head. It carries the outer radius of the outline, so it
     * ends where the outline ends and covers it completely in the share of the circle it spans.
     *
     * @param head The geometry of the head to build the segment for.
     * @param length The note length to build the segment for.
     *
     * @returns The `d` attribute of the segment, or an empty string when the head stays empty.
     */
    private segmentPathFor(head: INoteHeadGeometry, length: NoteLength): string {
        const { centerX, centerY, lineWidth } = head;
        const radius = head.radius + (lineWidth / 2);

        if (length === NoteLength.Whole) {
            return "";
        }

        if (length === NoteLength.Half) {
            // The half note fills the upper half of the head.
            const left = `${centerX - radius} ${centerY}`;
            const right = `${centerX + radius} ${centerY}`;

            return `M ${left} A ${radius} ${radius} 0 0 1 ${right} Z`;
        }

        // The quarter note and the flagged values fill a wedge from the apex, which reaches from the
        // vertical top edge clockwise by the share of a circle the value stands for.
        const radians = ((360 / noteLengthDenominator(length)) * Math.PI) / 180;
        const endX = roundCoordinate(centerX + (radius * Math.sin(radians)));
        const endY = roundCoordinate(centerY - (radius * Math.cos(radians)));
        const wedge = `M ${centerX} ${centerY} L ${centerX} ${centerY - radius} ` +
            `A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;

        if (!this.isFlagged(length)) {
            return wedge;
        }

        // The flagged head carries a band along its vertical edge instead of a full ring, so the
        // wedge takes that band over and ends flush with the outer edge of the outline.
        return `${this.verticalEdgePathFor(head)} ${wedge}`;
    }

    /**
     * Renders the dot the button adds to a value: a single augmentation dot, centered
     * horizontally at the bottom edge of the button.
     *
     * @returns The SVG symbol for the dot toggle.
     */
    private renderDotIcon(): ComponentChild {
        return (
            <svg className="noteLengthIcon" viewBox="0 0 24 32" width={24} height={32} aria-hidden="true">
                <circle className="noteLengthIconDot" cx="12" cy="27" r="3" />
            </svg>
        );
    }

    private selectLength(length: NoteLength): void {
        void requisitions.execute("noteLengthChanged", { length, dotted: this.state.activeValue.dotted });
    }

    /**
     * Switches the augmentation dot of the active value. The mark follows the model, so a value the
     * model refuses leaves the button where it was.
     */
    private toggleDots(): void {
        const { activeValue } = this.state;

        void requisitions.execute("noteLengthChanged", { length: activeValue.length, dotted: !activeValue.dotted });
    }

    /**
     * Checks whether a note value fits into a single bar. The toolbar belongs to the staff view, which
     * has no raster: every value the meter can express is available, including one that does not land
     * on a grid step.
     *
     * @param value The note value to evaluate.
     *
     * @returns True when the value fits into one bar.
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
        const duration = reduceFraction(stepsPerWholeNote * fraction.numerator,
            fraction.denominator * stepsPerBar);

        return duration.numerator > 0 && duration.numerator <= duration.denominator;
    }
}
