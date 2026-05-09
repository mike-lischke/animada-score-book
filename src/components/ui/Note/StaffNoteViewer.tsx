/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import sixteenthNoteIcon from "../../../assets/images/notes/16th-note.svg";
import sixteenthRestIcon from "../../../assets/images/notes/16th-rest.svg";
import thirtySecondNoteIcon from "../../../assets/images/notes/32th-note.svg";
import thirtySecondRestIcon from "../../../assets/images/notes/32th-rest.svg";
import quarterNoteIcon from "../../../assets/images/notes/4th-note.svg";
import quarterRestIcon from "../../../assets/images/notes/4th-rest.svg";
import eighthNoteIcon from "../../../assets/images/notes/8th-note.svg";
import eighthRestIcon from "../../../assets/images/notes/8th-rest.svg";
import commonTimeIcon from "../../../assets/images/notes/common-time.svg";
import halfNoteIcon from "../../../assets/images/notes/half-note.svg";
import halfRestIcon from "../../../assets/images/notes/half-rest.svg";
import wholeNoteIcon from "../../../assets/images/notes/whole-note.svg";
import wholeRestIcon from "../../../assets/images/notes/whole-rest.svg";

import { type ComponentChild, type VNode } from "preact";

import type { ISbDmNoteEvent } from "../../../core/ScoreBookDataModel.js";
import type { IScoreMetrics } from "../../../player/TimeCoordinator.js";
import { Icon } from "../framework/Icon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IStaffNoteViewerProps extends ICommonUIProperties {
    isFirstBar: boolean;
    isLastBar: boolean;
    timeSignature: string;
    scoreMetrics: IScoreMetrics;
    barNotes: ReadonlyArray<Pick<ISbDmNoteEvent, "timing" | "noteStyle" | "start" | "duration">>;
    slotCount?: number;
}

interface ITupletLabel {
    leftPercent: number;
    /** Bracket span as a percentage of the bar (only used when bracket is true). */
    widthPercent: number;
    text: string;
    /** When true, render a bracket around the number; otherwise show only the number. */
    bracket: boolean;
}

interface IRestGroup {
    /** 1-based start step within the bar. */
    startStep: number;
    /** Length of the rest group in steps. */
    lengthSteps: number;
    /** Rest icon to render. */
    icon: string;
    /** When true an augmentation dot is drawn next to the rest icon. */
    dotted: boolean;
}

interface IRestCandidate {
    /** Total length in steps the rendered rest covers (base length, plus half of it when dotted). */
    steps: number;

    /** Base rest length in steps; used for metric alignment of the start position when crossing pulses. */
    alignmentSteps: number;

    /** Icon for the underlying base rest value. */
    icon: string;

    /** Whether an augmentation dot extends the base rest by half. */
    dotted: boolean;
}

/**
 * Internal record describing one sounding note's layout in the staff bar. Built from the props' barNotes
 * and the actual durations carried by the underlying note events.
 */
interface IStaffNote {
    /** 1-based start step within the bar. */
    step: number;

    /** Number of grid slots this note occupies (derived from its duration). Layout-relevant. */
    lengthSteps: number;

    /**
     * Note length in *effective* grid slots, used solely for glyph and beam-level decisions. In a
     * regular grid this equals lengthSteps. Inside a tuplet pulse it is rescaled so the picker treats
     * the note as the implied tuplet base (e.g. a 1-step note in a triplet pulse becomes 1 effective
     * slot of an 8-step bar, and is picked as an 8th note).
     */
    glyphLengthSteps: number;

    /** Display glyph and dotted state for a standalone (un-beamed) rendering. */
    glyph: INoteGlyph;

    /** True when this note's duration is short enough to participate in a beam group. */
    beamable: boolean;
}

interface INoteGlyph {
    icon: string;
    dotted: boolean;
}

/**
 * Per-note beam information. A note participates in a beam group when the map carries an entry for
 * its start step. The segments describe the individual beam strokes attached to this note: shared
 * strokes that bridge to the next beam member, and partial (fractional) stubs that point inward
 * toward the strong beat for unmatched beam levels.
 */
interface IBeamInfo {
    segments: IBeamSegment[];
}

interface IBeamSegment {
    /** 1-based beam level: 1 = primary (8th-beam), 2 = secondary (16th-beam), 3 = tertiary (32nd-beam). */
    level: number;
    kind: "shared-right" | "partial-left" | "partial-right";
    /** Number of slot widths from this notehead to the next beam member's notehead (shared beams only). */
    extentSteps?: number;
}

export class StaffNoteViewer extends UIComponent<IStaffNoteViewerProps> {
    public override render(): ComponentChild {
        const { isFirstBar, isLastBar, timeSignature, scoreMetrics, barNotes, slotCount } = this.props;
        const [beatsPerBar, beatUnit] = timeSignature.split("/");
        const className = this.generateFinalClassName([
            "staff-note-viewer",
            this.classFromProperty(isFirstBar, "first-bar"),
            this.classFromProperty(isLastBar, "last-bar"),
        ]);

        const defaultStepsPerBar = scoreMetrics.stepsPerBar;
        const stepsPerBar = slotCount ?? defaultStepsPerBar;
        const stepScale = defaultStepsPerBar > 0 ? stepsPerBar / defaultStepsPerBar : 1;
        const pulsesPerBar = scoreMetrics.pulsesPerBar;
        const stepsPerPulse = scoreMetrics.stepsPerPulse * stepScale;

        // When a pulse is divided into a non-power-of-2 number of grid slots (e.g. 3 for a triplet
        // grid, 5 for quintuplets, 6 for sextuplets) the pulse is a tuplet. Glyph and beam decisions
        // operate on the *effective* division — the largest power of two not exceeding stepsPerPulse
        // — so a triplet 8th renders with an 8th-note glyph (and one beam), a sextuplet 16th with a
        // 16th-note glyph (two beams), etc. The actual layout (slot positions, occupied steps, rest
        // grouping bypass) keeps using the unmodified stepsPerPulse/stepsPerBar.
        const isTupletGrid = stepsPerPulse > 0 && Number.isInteger(stepsPerPulse)
            && !this.isPowerOfTwo(stepsPerPulse);
        const effectiveStepsPerPulse = isTupletGrid ? this.floorPowerOfTwo(stepsPerPulse) : stepsPerPulse;
        const effectiveStepsPerBar = effectiveStepsPerPulse * pulsesPerBar;

        const noteByStep = this.buildNoteByStep(barNotes, stepsPerBar, effectiveStepsPerBar);
        const occupiedSteps = this.buildOccupiedSteps(noteByStep);

        const beamSpans = this.computeBeamSpans(noteByStep, occupiedSteps, stepsPerBar, stepsPerPulse,
            effectiveStepsPerPulse);
        const tupletLabels = this.computeTupletLabels(noteByStep, beamSpans, stepsPerBar,
            stepsPerPulse, pulsesPerBar);
        const beatUnitValue = Number(beatUnit);
        const beatsPerBarValue = Number(beatsPerBar);
        const stepResolution = beatsPerBarValue > 0
            ? (stepsPerBar * beatUnitValue) / beatsPerBarValue
            : 0;
        const restGroups = Number.isFinite(stepResolution) && stepResolution > 0 && !isTupletGrid
            ? this.computeRestGroups(noteByStep, occupiedSteps, beamSpans, stepsPerBar, stepsPerPulse,
                stepResolution)
            : new Map<number, IRestGroup>();

        return (
            <div className={className} aria-hidden>
                {isFirstBar
                    ? (
                        <div className="staff-note-viewer-prefix">
                            <div className="staff-note-viewer-neutral-clef" />
                            <div className="staff-note-viewer-time-signature">
                                {timeSignature === "4/4"
                                    ? (
                                        <Icon
                                            className="staff-note-viewer-common-time"
                                            src={commonTimeIcon}
                                            alt="Common time"
                                        />
                                    )
                                    : (
                                        <>
                                            <span className="top">{beatsPerBar}</span>
                                            <span className="bottom">{beatUnit}</span>
                                        </>
                                    )}
                            </div>
                        </div>
                    )
                    : null}
                <div className="staff-note-viewer-middle-line" />
                <div className="staff-note-viewer-runs">
                    {this.renderSlots(noteByStep, occupiedSteps, restGroups, beamSpans, stepsPerBar,
                        isTupletGrid, effectiveStepsPerPulse)}
                </div>
                {tupletLabels.length > 0
                    ? (
                        <div className="staff-note-viewer-tuplets">
                            {tupletLabels.map((label) => {
                                const className = label.bracket
                                    ? "staff-note-viewer-tuplet-bracket"
                                    : "staff-note-viewer-tuplet-number";
                                const style = label.bracket
                                    ? { left: `${label.leftPercent}%`, width: `${label.widthPercent}%` }
                                    : { left: `${label.leftPercent + (label.widthPercent / 2)}%` };

                                return (
                                    <span
                                        key={`${label.leftPercent}-${label.text}`}
                                        className={className}
                                        style={style}
                                    >
                                        <span className="staff-note-viewer-tuplet-text">{label.text}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )
                    : null}
                {isLastBar ? <div className="staff-note-viewer-final-barline" /> : null}
            </div>
        );
    }

    /**
     * Builds the step-keyed sounding-note map from props. Each note carries its real duration (in grid
     * slots) so the renderer can pick the correct glyph and let multi-step notes absorb their following
     * rest gap visually.
     *
     * @param barNotes Sounding notes (filtered upstream — empty grid slots are not included).
     * @param stepsPerBar Total number of grid slots in the bar (for the layout slot count).
     * @param effectiveStepsPerBar Bar length in *effective* slots used for glyph picking and the
     *     beamable check. Inside a tuplet pulse this is smaller than stepsPerBar so a triplet 8th
     *     resolves to an 8th-note glyph rather than to a non-standard sub-grid value.
     * @returns Map keyed by 1-based start step.
     */
    private buildNoteByStep(
        barNotes: ReadonlyArray<Pick<ISbDmNoteEvent, "timing" | "noteStyle" | "start" | "duration">>,
        stepsPerBar: number,
        effectiveStepsPerBar: number,
    ): Map<number, IStaffNote> {
        const map = new Map<number, IStaffNote>();
        for (const note of barNotes) {
            if (!note.noteStyle) {
                continue;
            }

            const lengthSteps = this.computeLengthSteps(note.duration, stepsPerBar);
            const glyphLengthSteps = Math.max(1, this.computeLengthSteps(note.duration, effectiveStepsPerBar));
            const glyph = this.getStandaloneNoteGlyph(glyphLengthSteps, effectiveStepsPerBar)
                ?? { icon: sixteenthNoteIcon, dotted: false };

            map.set(note.timing.step, {
                step: note.timing.step,
                lengthSteps,
                glyphLengthSteps,
                glyph,
                beamable: this.isBeamable(glyphLengthSteps, effectiveStepsPerBar),
            });
        }

        return map;
    }

    /**
     * Builds the set of steps that are visually consumed by a sounding note's extended duration. The
     * note's start step itself is NOT included — only the trailing steps (start+1 .. start+length-1).
     * These steps must be skipped during rest grouping and rest rendering.
     *
     * @param noteByStep Sounding notes keyed by start step.
     * @returns Set of step numbers occupied by a previous note's tail.
     */
    private buildOccupiedSteps(noteByStep: Map<number, IStaffNote>): Set<number> {
        const occupied = new Set<number>();
        for (const note of noteByStep.values()) {
            for (let offset = 1; offset < note.lengthSteps; offset++) {
                occupied.add(note.step + offset);
            }
        }

        return occupied;
    }

    /**
     * Converts a fractional duration to a count of grid slots. Sub-grid durations (polyrhythm-shaped)
     * round up to one slot so they remain visible.
     *
     * @param duration Fractional duration of the note (relative to a whole bar).
     * @param stepsPerBar Total grid slots per bar.
     * @returns Length in grid slots, at least 1.
     */
    private computeLengthSteps(
        duration: Pick<ISbDmNoteEvent, "duration">["duration"],
        stepsPerBar: number,
    ): number {
        if (duration.denominator === 0) {
            return 1;
        }

        const exact = (duration.numerator * stepsPerBar) / duration.denominator;

        return Math.max(1, Math.round(exact));
    }

    /**
     * Picks the standalone (un-beamed) display glyph for a note based on its length in grid slots.
     * Recognises whole, half, quarter, eighth, 16th, 32nd and their dotted variants. Falls back to
     * `undefined` when the length doesn't match a standard value (the caller renders a 16th note glyph
     * in that case).
     *
     * @param lengthSteps Note length in grid slots.
     * @param stepsPerBar Total grid slots per bar (defines the whole-note unit).
     * @returns Display glyph descriptor or undefined.
     */
    private getStandaloneNoteGlyph(lengthSteps: number, stepsPerBar: number): INoteGlyph | undefined {
        // Compare durations as fractions of a whole bar by scaling by 32 to keep integer arithmetic.
        // 1 whole = 32, half = 16, quarter = 8, eighth = 4, 16th = 2, 32nd = 1; dotted = 1.5x.
        if (stepsPerBar <= 0) {
            return undefined;
        }

        const units = (lengthSteps * 32) / stepsPerBar;
        switch (units) {
            case 32: {
                return { icon: wholeNoteIcon, dotted: false };
            }

            case 24: {
                return { icon: halfNoteIcon, dotted: true };
            }

            case 16: {
                return { icon: halfNoteIcon, dotted: false };
            }

            case 12: {
                return { icon: quarterNoteIcon, dotted: true };
            }

            case 8: {
                return { icon: quarterNoteIcon, dotted: false };
            }

            case 6: {
                return { icon: eighthNoteIcon, dotted: true };
            }

            case 4: {
                return { icon: eighthNoteIcon, dotted: false };
            }

            case 3: {
                return { icon: sixteenthNoteIcon, dotted: true };
            }

            case 2: {
                return { icon: sixteenthNoteIcon, dotted: false };
            }

            case 1: {
                return { icon: thirtySecondNoteIcon, dotted: false };
            }

            default: {
                return undefined;
            }
        }
    }

    /**
     * @returns true when a note is short enough (< quarter) to participate in a beam group.
     *
     * @param lengthSteps Note length in grid slots.
     * @param stepsPerBar Total grid slots per bar.
     */
    private isBeamable(lengthSteps: number, stepsPerBar: number): boolean {
        // < quarter means lengthSteps * 4 < stepsPerBar.
        return lengthSteps * 4 < stepsPerBar;
    }

    /**
     * Computes the tuplet bracket / number labels above each pulse. A pulse divided into a
     * non-power-of-2 number of slots (3, 5, 6, 7, …) is a tuplet and gets a label centered above
     * its span — regardless of whether the pulse contains sounding notes or only rests, so the
     * reader always sees the implied subdivision. (A bar that's entirely empty bypasses this code
     * path via the whole-bar-rest shortcut in renderSlots.)
     *
     * Engraving convention: a tuplet's beam already conveys the grouping, so when a continuous
     * beam covers every slot in the pulse only the number is drawn. If the pulse contains rests
     * or unbeamed notes we add a bracket around the number so the grouping span is visible.
     *
     * @param noteByStep Sounding notes keyed by start step.
     * @param beamSpans Beam-membership map produced by computeBeamSpans.
     * @param stepsPerBar Layout slot count per bar.
     * @param stepsPerPulse Layout slots per pulse (drives pulse boundaries).
     * @param pulsesPerBar Number of pulses in the bar.
     *
     * @returns One label per tuplet pulse.
     */
    private computeTupletLabels(noteByStep: Map<number, IStaffNote>, beamSpans: Map<number, IBeamInfo>,
        stepsPerBar: number, stepsPerPulse: number, pulsesPerBar: number): ITupletLabel[] {
        const labels: ITupletLabel[] = [];
        const pulseCount = Math.max(1, Math.round(pulsesPerBar));

        for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex++) {
            const start = Math.floor(pulseIndex * stepsPerPulse) + 1;
            const endExclusive = Math.min(stepsPerBar + 1, Math.floor((pulseIndex + 1) * stepsPerPulse) + 1);
            const slotsInPulse = endExclusive - start;
            if (slotsInPulse <= 0 || this.isPowerOfTwo(slotsInPulse)) {
                continue;
            }

            // Bracket whenever the pulse is *not* fully covered by beamed notes — i.e. it
            // contains a rest slot or a sounding note that isn't part of a beam run. A pulse
            // entirely consisting of beamed notes uses the beam itself as the grouping line.
            let bracket = false;
            for (let step = start; step < endExclusive; step++) {
                const note = noteByStep.get(step);
                if (!note || !beamSpans.has(step)) {
                    bracket = true;
                    break;
                }
            }

            labels.push({
                // The bracket spans from the *center* of the first pulse slot to the center of
                // the last one — i.e. it sits over the noteheads rather than the cell edges.
                // This keeps the bracket from extending into the preceding bar's barline at the
                // start of bar 1 and from running into the next pulse on the right.
                leftPercent: ((start - 1 + 0.5) / stepsPerBar) * 100,
                widthPercent: ((slotsInPulse - 1) / stepsPerBar) * 100,
                text: slotsInPulse.toString(),
                bracket,
            });
        }

        return labels;
    }

    private isPowerOfTwo(value: number): boolean {
        if (value <= 0 || !Number.isInteger(value)) {
            return false;
        }

        return (value & (value - 1)) === 0;
    }

    /**
     * @returns the largest power of two that is less than or equal to `value`. For tuplet
     * subdivisions this gives the implied power-of-2 base of the tuplet (3 → 2, 5 → 4, 6 → 4, 7 → 4).
     *
     * @param value Subdivision count (e.g. steps per pulse).
     */
    private floorPowerOfTwo(value: number): number {
        if (value < 1) {
            return 1;
        }
        let result = 1;
        while (result * 2 <= value) {
            result *= 2;
        }

        return result;
    }

    private renderSlots(noteByStep: Map<number, IStaffNote>, occupiedSteps: Set<number>,
        restGroups: Map<number, IRestGroup>, beamSpans: Map<number, IBeamInfo>, stepsPerBar: number,
        isTupletGrid: boolean, effectiveStepsPerPulse: number): VNode[] {
        // Engraving convention: a bar that is entirely empty is shown with a single whole-rest
        // symbol centered horizontally — regardless of the actual time signature. The whole-rest
        // glyph here acts as a generic "empty bar" mark rather than a literal whole-note duration,
        // so this also applies to 3/4, 5/8 etc. We trigger it whenever there are no sounding notes
        // at all; partial-bar empty stretches keep their normal start-step alignment.
        if (noteByStep.size === 0) {
            return [this.renderWholeBarRestSlot()];
        }

        // Inside a tuplet pulse every empty step is rendered as a single tuplet rest with the
        // tuplet-implied glyph (8th rest for triplets, 16th rest for sextuplets, etc.) — rest
        // grouping is intentionally bypassed so the reader sees one rest glyph per tuplet member.
        const tupletRestIcon = isTupletGrid ? this.getTupletRestIcon(effectiveStepsPerPulse) : undefined;

        const slots: VNode[] = [];
        let step = 1;
        while (step <= stepsPerBar) {
            const note = noteByStep.get(step);
            if (note) {
                slots.push(this.renderNoteSlot(note, beamSpans, stepsPerBar));
                step += 1;
                continue;
            }

            // Steps consumed by a previous note's extended duration render as an empty 1-step slot
            // so the note's notehead stays at its original step position. The beam pseudo on the
            // sounding note's slot extends across these empties when needed.
            if (occupiedSteps.has(step)) {
                slots.push(this.renderEmptySlot(step, stepsPerBar));
                step += 1;
                continue;
            }

            const group = restGroups.get(step);
            if (group) {
                // Rest groups render at their start step in a 1-step slot — same as notes — so the
                // glyph sits at its actual metric position. The remaining steps of the group's length
                // emit empty slots, keeping each step uniformly wide.
                slots.push(this.renderRestGroupSlot(group, stepsPerBar));
                for (let tail = 1; tail < group.lengthSteps; ++tail) {
                    slots.push(this.renderEmptySlot(step + tail, stepsPerBar));
                }
                step += group.lengthSteps;
                continue;
            }

            slots.push(this.renderSingleRestSlot(step, stepsPerBar, tupletRestIcon));
            step += 1;
        }

        return slots;
    }

    /**
     * Picks the rest icon for a single tuplet member based on the tuplet's effective (power-of-2)
     * pulse division. The mapping mirrors the note-glyph picker: effective=2 → 8th rest, =4 → 16th
     * rest, =8 → 32nd rest. Pulses with even larger subdivisions fall back to the 32nd rest.
     *
     * @param effectiveStepsPerPulse Power-of-two pulse division (= floorPow2(stepsPerPulse)).
     * @returns Rest SVG icon URL.
     */
    private getTupletRestIcon(effectiveStepsPerPulse: number): string {
        if (effectiveStepsPerPulse <= 2) {
            return eighthRestIcon;
        }
        if (effectiveStepsPerPulse <= 4) {
            return sixteenthRestIcon;
        }

        return thirtySecondRestIcon;
    }

    private renderNoteSlot(note: IStaffNote, beamSpans: Map<number, IBeamInfo>, stepsPerBar: number): VNode {
        const beamInfo = beamSpans.get(note.step);
        const inBeam = beamInfo !== undefined;

        // Notes inside a beam group are rendered with the stem-only (quarter-note) glyph regardless of
        // their individual duration; the connecting beams are drawn as absolutely-positioned <span>
        // children below, one per beam segment. The augmentation dot stays attached to dotted notes
        // so dotted-eighth + 16th beam groups read correctly.
        const icon = inBeam ? quarterNoteIcon : note.glyph.icon;
        const className = "staff-note-viewer-run";

        // One step wide regardless of the note's duration: the notehead stays at its original
        // start-step position, and the duration is conveyed by the glyph (notehead shape, flags)
        // rather than by horizontal width. The note's tail steps render as empty slots.
        const width = `${100 / stepsPerBar}%`;

        return (
            <div key={`note-${note.step}`} className={className} style={{ width }}>
                <Icon className="staff-note-viewer-note-symbol" src={icon} alt="" />
                {note.glyph.dotted ? <span className="staff-note-viewer-note-dot" /> : null}
                {beamInfo ? this.renderBeamSegments(note.step, beamInfo) : null}
            </div>
        );
    }

    /**
     * Renders the beam strokes attached to a single note inside a beam group. Shared strokes bridge
     * to the next beam member (extent given in slot widths); partial stubs occupy a fixed pixel width
     * and point either left or right depending on engraving convention (toward the strong beat).
     *
     * @param step The 1-based start step of the note (used for keying child elements).
     * @param info Beam segments to draw on this note's slot.
     *
     * @returns Array of absolutely-positioned beam-stroke spans.
     */
    private renderBeamSegments(step: number, info: IBeamInfo): VNode[] {
        // Vertical stacking: the primary (8th) beam sits highest above the notehead; secondary and
        // tertiary beams stack below it toward the notehead, 5px apart. Two stroke pixels per beam.
        const beamGap = 5;
        const primaryTopOffset = 36;
        const partialPixels = 12;

        return info.segments.map((segment) => {
            const top = `calc(50% - ${primaryTopOffset - ((segment.level - 1) * beamGap)}px)`;
            const key = `beam-${step}-${segment.level}-${segment.kind}`;
            if (segment.kind === "shared-right") {
                const extent = segment.extentSteps ?? 1;

                // Beam starts 5 px right of the current notehead (clearing the head) and ends 5 px
                // right of the next beam member's notehead center (touching its stem from the left).
                // Distance between consecutive notehead centers = `extent` slot widths, so the total
                // span is exactly `extent * 100%` of one slot width.
                return (
                    <span
                        key={key}
                        className="staff-note-viewer-beam"
                        style={{
                            top,
                            left: "calc(50% + 5px)",
                            width: `${extent * 100}%`,
                        }}
                    />
                );
            }
            if (segment.kind === "partial-right") {
                return (
                    <span
                        key={key}
                        className="staff-note-viewer-beam"
                        style={{
                            top,
                            left: "calc(50% + 5px)",
                            width: `${partialPixels}px`,
                        }}
                    />
                );
            }

            // partial-left: stub points back toward the previous (stronger) beat. Its right edge
            // anchors at the stem (5 px right of this notehead's center, matching the stem-up
            // convention used for shared beams), so it visually grows out of the same stem the
            // shared beam would have ended at.
            return (
                <span
                    key={key}
                    className="staff-note-viewer-beam"
                    style={{
                        top,
                        right: "calc(50% - 5px)",
                        width: `${partialPixels}px`,
                    }}
                />
            );
        });
    }

    private renderEmptySlot(step: number, stepsPerBar: number): VNode {
        const width = `${100 / stepsPerBar}%`;

        return <div key={`empty-${step}`} className="staff-note-viewer-run" style={{ width }} />;
    }

    private renderSingleRestSlot(step: number, stepsPerBar: number, icon?: string): VNode {
        const width = `${100 / stepsPerBar}%`;

        return (
            <div key={`rest-${step}`} className="staff-note-viewer-run" style={{ width }}>
                <Icon className="staff-note-viewer-rest-symbol" src={icon ?? sixteenthRestIcon} alt="" />
            </div>
        );
    }

    private renderRestGroupSlot(group: IRestGroup, stepsPerBar: number): VNode {
        const width = `${100 / stepsPerBar}%`;

        return (
            <div
                key={`rest-${group.startStep}`}
                className="staff-note-viewer-run"
                style={{ width }}
            >
                <Icon className="staff-note-viewer-rest-symbol" src={group.icon} alt="" />
                {group.dotted ? <span className="staff-note-viewer-rest-dot" /> : null}
            </div>
        );
    }

    /**
     * Renders an entirely empty bar as a single full-width slot containing a centered whole-rest
     * symbol — the standard engraving convention for "this bar is silent", used regardless of the
     * actual time signature.
     *
     * @returns A single full-width VNode that replaces the per-step slot list for this bar.
     */
    private renderWholeBarRestSlot(): VNode {
        return (
            <div
                key="rest-whole-bar"
                className="staff-note-viewer-run"
                style={{ width: "100%" }}
            >
                <Icon className="staff-note-viewer-rest-symbol" src={wholeRestIcon} alt="" />
            </div>
        );
    }

    /**
     * Builds the per-step beam information map. Within each pulse, consecutive sounding beamable notes
     * form one beam run; a non-beamable note (quarter or longer) or a true rest gap (an empty step that
     * isn't part of a previous note's extended duration) breaks the run. Runs of one note carry no beam.
     *
     * For each note in a run with >= 2 members, the algorithm computes per-level beam segments:
     * for each beam level L (1=8th, 2=16th, 3=32nd) where the note has at least L beams, it emits
     * either a shared beam to the right neighbor (when that neighbor also has >= L beams) or a partial
     * stub on the side that points toward the strong beat (right at the run's start, left at its end).
     * Levels covered by a left-neighbor's shared beam are skipped (the beam is drawn from the left
     * note's slot). This produces fractional beams for mixed-level groups like dotted-8th + 16th.
     *
     * @param noteByStep Sounding notes keyed by start step.
     * @param occupiedSteps Steps consumed by a previous note's extended duration (do not break beams).
     * @param stepsPerBar Total grid slots per bar.
     * @param stepsPerPulse Number of grid slots per pulse (drives pulse boundaries / beam-run scope).
     * @param effectiveStepsPerPulse Power-of-two pulse division used for beam-count decisions; equals
     *     `stepsPerPulse` for regular grids and `floorPow2(stepsPerPulse)` inside tuplet pulses.
     * @returns Map keyed by every start step that participates in a beam run.
     */
    private computeBeamSpans(noteByStep: Map<number, IStaffNote>, occupiedSteps: Set<number>,
        stepsPerBar: number, stepsPerPulse: number, effectiveStepsPerPulse: number): Map<number, IBeamInfo> {
        const result = new Map<number, IBeamInfo>();
        if (stepsPerPulse <= 0) {
            return result;
        }

        const pulseCount = Math.max(1, Math.ceil(stepsPerBar / stepsPerPulse));
        for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex++) {
            const start = Math.floor(pulseIndex * stepsPerPulse) + 1;
            const endExclusive = Math.min(stepsPerBar + 1, Math.floor((pulseIndex + 1) * stepsPerPulse) + 1);

            // Collect maximal runs of beamable notes within the pulse.
            let runMembers: IStaffNote[] = [];

            const flush = () => {
                if (runMembers.length >= 2) {
                    this.assignBeamSegments(runMembers, effectiveStepsPerPulse, result);
                }
                runMembers = [];
            };

            for (let step = start; step < endExclusive; step++) {
                const note = noteByStep.get(step);
                if (!note) {
                    // A truly empty step (rest gap) breaks the run; steps consumed by a previous
                    // note's extended duration do not.
                    if (!occupiedSteps.has(step)) {
                        flush();
                    }
                    continue;
                }

                if (!note.beamable) {
                    // A non-beamable note (quarter or longer) terminates the current beam run.
                    flush();
                    continue;
                }

                runMembers.push(note);
            }
            flush();
        }

        return result;
    }

    /**
     * Computes the beam-count (= number of beam strokes) for a note whose duration spans `lengthSteps`
     * grid slots. The base value is the largest power of two that fits in `lengthSteps` (so a dotted
     * eighth — length 3 — beams as an eighth: one beam). The count is then `log2(stepsPerPulse / base)`,
     * capped at zero for non-beamable durations.
     *
     * @param lengthSteps Note duration in grid slots.
     * @param stepsPerPulse Grid slots per pulse.
     *
     * @returns The number of beam strokes the note carries (0 = not beamed).
     */
    private beamCountFor(lengthSteps: number, stepsPerPulse: number): number {
        if (lengthSteps <= 0 || stepsPerPulse <= 0) {
            return 0;
        }

        let base = 1;
        while (base * 2 <= lengthSteps) {
            base *= 2;
        }

        if (base >= stepsPerPulse) {
            return 0;
        }

        let count = 0;
        let value = stepsPerPulse;
        while (value > base) {
            value /= 2;
            count += 1;
        }

        return count;
    }

    /**
     * For each member of a beam run, fills in the per-level beam segments and stores the result in the
     * shared map keyed by the note's start step. See `computeBeamSpans` for the algorithm sketch.
     *
     * @param run Sounding notes that share one beam run, in score order.
     * @param stepsPerPulse Grid slots per pulse (used for beam-count calculation).
     * @param target Output map: notes that participate in the beam are added under their start step.
     */
    private assignBeamSegments(run: IStaffNote[], stepsPerPulse: number, target: Map<number, IBeamInfo>): void {
        const counts = run.map((note) => {
            return this.beamCountFor(note.glyphLengthSteps, stepsPerPulse);
        });

        for (let i = 0; i < run.length; i++) {
            const segments: IBeamSegment[] = [];
            for (let level = 1; level <= counts[i]; level++) {
                const leftHasShared = i > 0 && counts[i - 1] >= level;
                const rightHasShared = i + 1 < run.length && counts[i + 1] >= level;

                if (rightHasShared) {
                    segments.push({
                        level,
                        kind: "shared-right",
                        // Distance to next notehead in slot widths = current note's lengthSteps.
                        extentSteps: run[i].lengthSteps,
                    });
                } else if (!leftHasShared) {
                    // No connecting beam at this level — emit a partial stub.
                    // Convention: at the run's start partials point right (away from previous beat),
                    // at the run's end partials point left (back toward the strong beat). For middle
                    // notes (rare given our level-mixing patterns) we default to left as well.
                    const partialKind = i === 0 ? "partial-right" : "partial-left";
                    segments.push({ level, kind: partialKind });
                }
                // else: a left-neighbor's shared beam already covers this level on its own slot.
            }
            if (segments.length > 0) {
                target.set(run[i].step, { segments });
            } else if (counts[i] > 0) {
                // Note participates in the run (will be rendered with stem-only icon) but has no
                // segments to draw on its own slot — still mark it so the renderer knows it's beamed.
                target.set(run[i].step, { segments: [] });
            }
        }
    }

    /**
     * Identifies maximal runs of consecutive empty steps and breaks them into rest groups whose durations
     * match standard rest values (whole, half, quarter, eighth, 16th, 32nd). A group must be metrically
     * aligned (start step minus one is a multiple of its length) and either lie entirely within one pulse
     * or span an integer number of full pulses. Steps consumed by a sounding note's extended duration
     * are not part of any rest run.
     *
     * @param noteByStep Sounding notes keyed by start step.
     * @param occupiedSteps Steps consumed by the tail of a sounding note (excluded from rest runs).
     * @param beamSpans Steps that participate in a beam group (kept untouched here; rests no longer fall
     *     inside beams in the duration-based model, but the parameter remains for parity).
     * @param stepsPerBar Total number of steps in the bar.
     * @param stepsPerPulse Number of steps in a single pulse.
     * @param stepResolution How many steps fit in a whole note for the current time grid.
     *
     * @returns Map keyed by the group's start step.
     */
    private computeRestGroups(noteByStep: Map<number, IStaffNote>, occupiedSteps: Set<number>,
        beamSpans: Map<number, IBeamInfo>, stepsPerBar: number, stepsPerPulse: number,
        stepResolution: number): Map<number, IRestGroup> {
        const baseCandidates: Array<{ steps: number; icon: string; }> = [
            { steps: stepResolution, icon: wholeRestIcon },
            { steps: stepResolution / 2, icon: halfRestIcon },
            { steps: stepResolution / 4, icon: quarterRestIcon },
            { steps: stepResolution / 8, icon: eighthRestIcon },
            { steps: stepResolution / 16, icon: sixteenthRestIcon },
            { steps: stepResolution / 32, icon: thirtySecondRestIcon },
        ];

        const candidates: IRestCandidate[] = [];
        for (const base of baseCandidates) {
            const dottedSteps = base.steps + (base.steps / 2);
            if (Number.isInteger(dottedSteps) && dottedSteps >= 2 && dottedSteps <= stepsPerBar) {
                candidates.push({
                    steps: dottedSteps,
                    alignmentSteps: base.steps,
                    icon: base.icon,
                    dotted: true,
                });
            }
            if (Number.isInteger(base.steps) && base.steps >= 1 && base.steps <= stepsPerBar) {
                candidates.push({
                    steps: base.steps,
                    alignmentSteps: base.steps,
                    icon: base.icon,
                    dotted: false,
                });
            }
        }

        candidates.sort((a, b) => {
            return b.steps - a.steps;
        });

        const result = new Map<number, IRestGroup>();
        if (candidates.length === 0) {
            return result;
        }

        const isRest = (step: number): boolean => {
            if (noteByStep.has(step) || occupiedSteps.has(step)) {
                return false;
            }

            // Beam spans no longer cover rests in the duration-based model, but if they did the rest
            // would still need to be drawn individually so the beam stays continuous.
            if (beamSpans.has(step)) {
                return false;
            }

            return true;
        };

        const flushRun = (runStart: number, runEndExclusive: number): void => {
            let pos = runStart;
            while (pos < runEndExclusive) {
                const remaining = runEndExclusive - pos;
                let chosen: IRestCandidate | undefined;
                for (const candidate of candidates) {
                    if (candidate.steps > remaining) {
                        continue;
                    }

                    const startPulse = Math.floor((pos - 1) / stepsPerPulse);
                    const endPulse = Math.floor((pos + candidate.steps - 2) / stepsPerPulse);
                    const insideSinglePulse = startPulse === endPulse;

                    // Inside a single pulse the pulse itself is the metric reference, so any start
                    // position is acceptable for both plain and dotted rests.
                    //
                    // Across pulse boundaries the rules tighten to follow standard engraving: dotted
                    // rests are not used (a dotted-half rest in 4/4 reads worse than "quarter + half";
                    // a dotted-quarter rest crossing a beat would end mid-beat, which is illegitimate).
                    // Plain rests are allowed only when their length is a multiple of their base length
                    // — i.e. the start step minus one is divisible by `alignmentSteps`. This pins a
                    // half rest to a half-bar grid and a whole rest to the bar start, matching the
                    // strong-beat hierarchy.
                    if (!insideSinglePulse) {
                        if (candidate.dotted) {
                            continue;
                        }
                        if ((pos - 1) % candidate.alignmentSteps !== 0) {
                            continue;
                        }
                    }

                    chosen = candidate;
                    break;
                }

                if (!chosen) {
                    // No matching grouped rest: leave this step as a per-step 16th rest.
                    pos += 1;
                    continue;
                }

                result.set(pos, {
                    startStep: pos,
                    lengthSteps: chosen.steps,
                    icon: chosen.icon,
                    dotted: chosen.dotted,
                });
                pos += chosen.steps;
            }
        };

        let runStart = -1;
        for (let step = 1; step <= stepsPerBar; step++) {
            if (isRest(step)) {
                if (runStart < 0) {
                    runStart = step;
                }
            } else if (runStart >= 1) {
                flushRun(runStart, step);
                runStart = -1;
            }
        }
        if (runStart >= 1) {
            flushRun(runStart, stepsPerBar + 1);
        }

        return result;
    }
}
