/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import {
    NoteLength, noteLengthDenominator, noteValueForUnits, noteValueFraction, type INoteValue,
} from "../../../core/rest-notation.js";
import { compareFractions, reduceFraction } from "../../../core/serialisation/numeric-functions.js";
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

/** Position, size and border width of a note head symbol, in the user units of the icon. */
interface INoteHeadGeometry {
    centerX: number;
    centerY: number;
    radius: number;
    lineWidth: number;
}

/** The two paths a note head is drawn from, which carry the outline and the fill color. */
interface INoteHeadPaths {
    outline: string;
    segment: string;
}

/** Size of the square icon the note symbols are drawn in. */
const noteIconSize = 20;

/** Border width of the note symbols. */
const noteHeadLineWidth = 2;

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
     * Renders the note symbol for a note length: an outline carrying a segment filled from its
     * apex, which spans the share of a whole circle the note value stands for. Outline and segment
     * are separate paths, because they carry different colors.
     *
     * @param length The note length to render.
     *
     * @returns The SVG symbol for the note length.
     */
    private renderIcon(length: NoteLength): ComponentChild {
        const { outline, segment } = this.headPathsFor(length);
        const outlinePath = <path className="noteLengthIconOutline" d={outline} />;
        const segmentPath = segment.length > 0
            ? <path className="noteLengthIconFill" d={segment} />
            : undefined;

        return (
            <svg className="noteLengthIcon" viewBox={`0 0 ${noteIconSize} ${noteIconSize}`}
                width={noteIconSize} height={noteIconSize} aria-hidden="true">
                {segmentPath}
                {outlinePath}
            </svg>
        );
    }

    /**
     * Builds the note head as two paths: the outline plus the segment of the note value, which
     * reaches into the outline. The outline is drawn over the segment, so it covers the overlap and
     * the two colors meet without a seam. The whole note has no segment.
     *
     * @param length The note length to build the head for.
     *
     * @returns The `d` attributes of the head paths.
     */
    private headPathsFor(length: NoteLength): INoteHeadPaths {
        if (this.isFlagged(length)) {
            return {
                outline: this.quarterOutlinePathFor(noteHeadQuarter),
                segment: this.segmentPathFor(noteHeadQuarter, length),
            };
        }

        return {
            outline: this.circleOutlinePathFor(noteHeadCircle),
            segment: this.segmentPathFor(noteHeadCircle, length),
        };
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
     * Describes the outline of a plain value as a ring: the outer circle plus, in opposite winding,
     * the inner one, which keeps the middle of the head open.
     *
     * @param head The geometry of the head to build the outline for.
     *
     * @returns The `d` attribute of the ring subpaths.
     */
    private circleOutlinePathFor(head: INoteHeadGeometry): string {
        const { centerX, centerY, radius, lineWidth } = head;
        const half = lineWidth / 2;
        const outer = this.circlePathFor(centerX, centerY, radius + half, true);
        const inner = this.circlePathFor(centerX, centerY, radius - half, false);

        return `${outer} ${inner}`;
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
        const topEdge = `M ${centerX - half} ${centerY + half} L ${centerX - half} ${centerY - outerRadius} ` +
            `L ${centerX + half} ${centerY - outerRadius} L ${centerX + half} ${centerY + half} Z`;
        const rightEdge = `M ${centerX - half} ${centerY - half} L ${centerX + outerRadius} ${centerY - half} ` +
            `L ${centerX + outerRadius} ${centerY + half} L ${centerX - half} ${centerY + half} Z`;

        return `${arc} ${topEdge} ${rightEdge}`;
    }

    /**
     * Builds the filled segment of a note head. It has the full radius of the head, so it reaches
     * into the outline, which covers the overlap and leaves the visible segment bounded by the
     * inner edge of the outline.
     *
     * @param head The geometry of the head to build the segment for.
     * @param length The note length to build the segment for.
     *
     * @returns The `d` attribute of the segment, or an empty string when the head stays empty.
     */
    private segmentPathFor(head: INoteHeadGeometry, length: NoteLength): string {
        const { centerX, centerY, radius } = head;

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

        return `M ${centerX} ${centerY} L ${centerX} ${centerY - radius} ` +
            `A ${radius} ${radius} 0 0 1 ${endX} ${endY} Z`;
    }

    /**
     * Describes a full circle as an SVG arc pair.
     *
     * @param cx The horizontal center of the circle.
     * @param cy The vertical center of the circle.
     * @param radius The radius of the circle.
     * @param clockwise The winding direction; opposite windings cut a hole into the shape.
     *
     * @returns The `d` attribute of the circle subpath.
     */
    private circlePathFor(cx: number, cy: number, radius: number, clockwise: boolean): string {
        const sweep = clockwise ? 1 : 0;
        const left = `${cx - radius} ${cy}`;
        const right = `${cx + radius} ${cy}`;

        return `M ${left} A ${radius} ${radius} 0 0 ${sweep} ${right} ` +
            `A ${radius} ${radius} 0 0 ${sweep} ${left} Z`;
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
