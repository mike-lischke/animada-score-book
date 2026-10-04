/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { compareFractions, subtractFractions } from "./serialisation/numeric-functions.js";
import type { ISbDmArrangement } from "./ScoreBookDataModel.js";
import type {
    IFraction, IForteMark, IHairpin, IMeasureEvent, IRangeArticulation, IRangeArticulationAnchor,
} from "./types/general.js";
import { RangeArticulationKind as Kind } from "./types/general.js";
import { reserveId } from "./utils.js";

/** The end of a hairpin a handle drag moves. */
export enum HairpinEnd {
    From,
    To,
}

/**
 * Rules and transformations for the hairpins and `f` markings of an arrangement. Every anchor is addressed by
 * its measure and exact event onset, so no rule depends on rendered note elements.
 */
export class RangeArticulations {
    /** Smallest span a hairpin keeps, as a bar fraction, so a degenerate or reversed hairpin cannot be created. */
    public static readonly minimumHairpinSpan: IFraction = { numerator: 1, denominator: 32 };

    private static readonly startOfBar: IFraction = { numerator: 0, denominator: 1 };
    private static readonly endOfBar: IFraction = { numerator: 1, denominator: 1 };

    /**
     * @param articulation The marking to inspect.
     *
     * @returns True when the marking is a hairpin rather than an `f`.
     */
    public static isHairpin(articulation: IRangeArticulation): articulation is IHairpin {
        return articulation.kind === Kind.Crescendo || articulation.kind === Kind.Decrescendo;
    }

    /**
     * @param anchor The anchor to copy.
     *
     * @returns A deep copy of the anchor.
     */
    public static cloneAnchor(anchor: IRangeArticulationAnchor): IRangeArticulationAnchor {
        return { bar: anchor.bar, start: { ...anchor.start } };
    }

    /**
     * @param articulation The marking to copy.
     *
     * @returns A deep copy of the marking.
     */
    public static clone(articulation: IRangeArticulation): IRangeArticulation {
        if (this.isHairpin(articulation)) {
            return {
                ...articulation,
                from: this.cloneAnchor(articulation.from),
                to: this.cloneAnchor(articulation.to),
            };
        }

        return { ...articulation, at: this.cloneAnchor(articulation.at) };
    }

    /**
     * @param left The first anchor.
     * @param right The second anchor.
     *
     * @returns Negative when `left` lies before `right`, zero when both name the same event, positive otherwise.
     */
    public static compareAnchors(left: IRangeArticulationAnchor, right: IRangeArticulationAnchor): number {
        if (left.bar !== right.bar) {
            return left.bar - right.bar;
        }

        return compareFractions(left.start, right.start);
    }

    /**
     * @param hairpin The hairpin to measure.
     *
     * @returns The span between its anchors as a bar fraction. Only meaningful while both anchors lie in one
     * measure, which is the only case the minimum span rule has to judge.
     */
    public static spanOf(hairpin: IHairpin): IFraction {
        return subtractFractions(hairpin.to.start, hairpin.from.start);
    }

    /**
     * Moves one end of a hairpin onto another anchor.
     *
     * @param hairpin The hairpin to move an end of.
     * @param end The end to move.
     * @param anchor The anchor to move that end to.
     *
     * @returns A copy of the hairpin with that end at the new anchor. A drag that crosses the other end turns the
     * hairpin around: its anchors swap and the opening follows the direction they then run in, so a crescendo
     * dragged past its own end becomes the decrescendo of the span it then covers.
     */
    public static withMovedEnd(hairpin: IHairpin, end: HairpinEnd,
        anchor: IRangeArticulationAnchor): IHairpin {
        const moved: IHairpin = {
            ...hairpin,
            from: end === HairpinEnd.From ? RangeArticulations.cloneAnchor(anchor) : hairpin.from,
            to: end === HairpinEnd.To ? RangeArticulations.cloneAnchor(anchor) : hairpin.to,
        };

        if (RangeArticulations.compareAnchors(moved.from, moved.to) <= 0) {
            return moved;
        }

        return {
            ...moved,
            kind: moved.kind === Kind.Crescendo ? Kind.Decrescendo : Kind.Crescendo,
            from: moved.to,
            to: moved.from,
        };
    }

    /**
     * Moves a hairpin to the note a pointer grabbed it at, which is what makes it travel as a whole instead of
     * growing away from one of its ends.
     *
     * @param hairpin The hairpin being moved.
     * @param source The note anchors of the track the hairpin stands in, in chronological order.
     * @param target The note anchors of the track it is moved to, in the same order.
     * @param grabbed The note anchor the pointer is on.
     * @param grabOffset How many notes the grabbed note lay behind the hairpin's first end when it was grabbed.
     *
     * @returns The hairpin at the note the pointer names, with the notes it covered and the place it was grabbed at
     * kept, or undefined when the anchors it covers or the grabbed one do not all lie in the tracks.
     */
    public static translate(hairpin: IHairpin, source: readonly IRangeArticulationAnchor[],
        target: readonly IRangeArticulationAnchor[], grabbed: IRangeArticulationAnchor,
        grabOffset: number): IHairpin | undefined {
        const from = this.indexOfAnchor(source, hairpin.from);
        const to = this.indexOfAnchor(source, hairpin.to);
        if (from === undefined || to === undefined) {
            return undefined;
        }

        const span = to - from;
        const grabbedIndex = this.indexOfAnchor(target, grabbed);
        if (span < 1 || grabbedIndex === undefined) {
            return undefined;
        }

        const start = Math.min(Math.max(grabbedIndex - grabOffset, 0), target.length - 1 - span);
        if (start < 0) {
            return undefined;
        }

        return { ...hairpin, from: { ...target[start] }, to: { ...target[start + span] } };
    }

    /**
     * @param anchors The note anchors of the track the hairpin stands in, in chronological order.
     * @param hairpin The hairpin that was grabbed.
     * @param grabbed The note anchor the pointer grabbed it at.
     *
     * @returns How many notes that anchor lies behind the hairpin's first end, which is what a move keeps so the
     * hairpin follows the pointer at the place it was grabbed. Undefined when the hairpin's anchors or the grabbed
     * one do not lie in that track.
     */
    public static grabOffset(anchors: readonly IRangeArticulationAnchor[], hairpin: IHairpin,
        grabbed: IRangeArticulationAnchor): number | undefined {
        const from = this.indexOfAnchor(anchors, hairpin.from);
        const grabbedIndex = this.indexOfAnchor(anchors, grabbed);
        if (from === undefined || grabbedIndex === undefined) {
            return undefined;
        }

        return Math.max(grabbedIndex - from, 0);
    }

    /**
     * @param hairpin The hairpin to check.
     *
     * @returns True when its anchors lie in chronological order and, while both lie in one measure, span at least
     * the minimum. A hairpin that reaches over a barline spans far more than that minimum already.
     */
    public static isWellFormed(hairpin: IHairpin): boolean {
        if (this.compareAnchors(hairpin.from, hairpin.to) >= 0) {
            return false;
        }

        if (hairpin.from.bar !== hairpin.to.bar) {
            return true;
        }

        return compareFractions(this.spanOf(hairpin), this.minimumHairpinSpan) >= 0;
    }

    /**
     * @param arrangement The arrangement the anchors are resolved against.
     * @param hairpin The hairpin to check.
     *
     * @returns True when the hairpin is well formed and both anchors name sounding notes of its track.
     */
    public static isValidHairpin(arrangement: ISbDmArrangement, hairpin: IHairpin): boolean {
        if (!this.isWellFormed(hairpin)) {
            return false;
        }

        return this.findNoteAnchor(arrangement, hairpin.trackId, hairpin.from) !== undefined
            && this.findNoteAnchor(arrangement, hairpin.trackId, hairpin.to) !== undefined;
    }

    /**
     * @param arrangement The arrangement the anchor is resolved against.
     * @param mark The `f` marking to check.
     *
     * @returns True when the marking sits on an event of its track, note or rest.
     */
    public static isValidForteMark(arrangement: ISbDmArrangement, mark: IForteMark): boolean {
        return this.findEvent(arrangement, mark.trackId, mark.at) !== undefined;
    }

    /**
     * Two hairpins overlap when they belong to the same track and their spans share more than a point, in one
     * measure or across a barline. Immediately consecutive hairpins touch at one anchor and are therefore allowed.
     *
     * @param left The first hairpin.
     * @param right The second hairpin.
     *
     * @returns True when the two spans overlap.
     */
    public static overlaps(left: IHairpin, right: IHairpin): boolean {
        if (left.trackId !== right.trackId) {
            return false;
        }

        return this.compareAnchors(left.from, right.to) < 0 && this.compareAnchors(right.from, left.to) < 0;
    }

    /**
     * @param candidate The marking whose placement is checked.
     * @param existing The markings it is placed next to. Must not contain the candidate itself.
     *
     * @returns True when the candidate shares its place with one of them: two hairpins may touch at an anchor, but
     * a hairpin and an `f` may not meet at all — in either order — and two `f` markings may not sit on one event.
     */
    public static conflicts(candidate: IRangeArticulation,
        existing: readonly IRangeArticulation[]): boolean {
        for (const articulation of existing) {
            if (articulation.id === candidate.id || articulation.trackId !== candidate.trackId) {
                continue;
            }

            if (this.isHairpin(candidate)) {
                const clash = this.isHairpin(articulation)
                    ? this.overlaps(candidate, articulation)
                    : this.covers(candidate, articulation.at);
                if (clash) {
                    return true;
                }

                continue;
            }

            const clash = this.isHairpin(articulation)
                ? this.covers(articulation, candidate.at)
                : this.compareAnchors(articulation.at, candidate.at) === 0;
            if (clash) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param hairpin The hairpin whose span is checked.
     * @param anchor The anchor to check.
     *
     * @returns True when the anchor lies within the hairpin's span, its ends included, whether it lies in one of
     * the measures the hairpin covers or in the one it reaches into.
     */
    public static covers(hairpin: IHairpin, anchor: IRangeArticulationAnchor): boolean {
        return this.compareAnchors(anchor, hairpin.from) >= 0 && this.compareAnchors(anchor, hairpin.to) <= 0;
    }

    /**
     * @param arrangement The arrangement to search in.
     * @param trackId The track the anchor belongs to.
     * @param anchor The anchor to resolve.
     *
     * @returns The event the anchor names, or undefined when no event starts at that position.
     */
    public static findEvent(arrangement: ISbDmArrangement, trackId: number,
        anchor: IRangeArticulationAnchor): IMeasureEvent | undefined {
        const track = arrangement.tracks.find((candidate) => {
            return candidate.id === trackId;
        });

        const measure = track?.measures[anchor.bar - 1];

        return measure?.events.find((event) => {
            return compareFractions(event.start, anchor.start) === 0;
        });
    }

    /**
     * Validates the stored chunk of range articulations and keeps every marking that survives it. Markings are
     * dropped when their ids, track, kind, anchors or ordering are invalid, or when a hairpin overlaps one that was
     * already kept.
     *
     * @param chunk The stored chunk, as it was written.
     * @param arrangement The arrangement the anchors are resolved against. Its tracks must be restored already.
     *
     * @returns The valid markings, in stored order.
     */
    public static validateChunk(chunk: unknown, arrangement: ISbDmArrangement): IRangeArticulation[] {
        const result: IRangeArticulation[] = [];
        if (!Array.isArray(chunk)) {
            return result;
        }

        const barCount = arrangement.timeParams.length;
        const usedIds = new Set<number>();

        for (const entry of chunk) {
            const articulation = this.parseArticulation(entry, arrangement, barCount);
            if (articulation === undefined || usedIds.has(articulation.id)) {
                continue;
            }

            if (this.isHairpin(articulation) && this.conflicts(articulation, result)) {
                continue;
            }

            usedIds.add(articulation.id);
            reserveId(articulation.id);
            result.push(articulation);
        }

        return result;
    }

    /**
     * @param anchors The anchors to search.
     * @param anchor The anchor to find.
     *
     * @returns The position of that anchor in the list, or undefined when the list does not hold it.
     */
    private static indexOfAnchor(anchors: readonly IRangeArticulationAnchor[],
        anchor: IRangeArticulationAnchor): number | undefined {
        const index = anchors.findIndex((candidate) => {
            return RangeArticulations.compareAnchors(candidate, anchor) === 0;
        });

        return index < 0 ? undefined : index;
    }

    private static findNoteAnchor(arrangement: ISbDmArrangement, trackId: number,
        anchor: IRangeArticulationAnchor): IMeasureEvent | undefined {
        const event = this.findEvent(arrangement, trackId, anchor);

        return event?.noteStyleId !== undefined ? event : undefined;
    }

    private static parseArticulation(value: unknown, arrangement: ISbDmArrangement,
        barCount: number): IRangeArticulation | undefined {
        if (typeof value !== "object" || value === null) {
            return undefined;
        }

        const candidate = value as {
            id?: unknown; trackId?: unknown; kind?: unknown; from?: unknown; to?: unknown; at?: unknown;
        };

        const id = candidate.id;
        const trackId = candidate.trackId;
        if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
            return undefined;
        }

        if (typeof trackId !== "number" || !Number.isInteger(trackId)
            || !arrangement.tracks.some((track) => {
                return track.id === trackId;
            })) {
            return undefined;
        }

        if (candidate.kind === Kind.Forte) {
            const at = this.parseAnchor(candidate.at, barCount);
            if (at === undefined) {
                return undefined;
            }

            const mark: IForteMark = { id, trackId, kind: Kind.Forte, at };

            return this.isValidForteMark(arrangement, mark) ? mark : undefined;
        }

        if (candidate.kind !== Kind.Crescendo && candidate.kind !== Kind.Decrescendo) {
            return undefined;
        }

        const from = this.parseAnchor(candidate.from, barCount);
        const to = this.parseAnchor(candidate.to, barCount);
        if (from === undefined || to === undefined) {
            return undefined;
        }

        const hairpin: IHairpin = { id, trackId, kind: candidate.kind, from, to };

        return this.isValidHairpin(arrangement, hairpin) ? hairpin : undefined;
    }

    private static parseAnchor(value: unknown, barCount: number): IRangeArticulationAnchor | undefined {
        if (typeof value !== "object" || value === null) {
            return undefined;
        }

        const candidate = value as { bar?: unknown; start?: unknown; };
        const bar = candidate.bar;
        if (typeof bar !== "number" || !Number.isInteger(bar) || bar < 1 || bar > barCount) {
            return undefined;
        }

        const start = candidate.start;
        if (typeof start !== "object" || start === null) {
            return undefined;
        }

        const fraction = start as { numerator?: unknown; denominator?: unknown; };
        const numerator = fraction.numerator;
        const denominator = fraction.denominator;
        if (typeof numerator !== "number" || !Number.isInteger(numerator) || numerator < 0) {
            return undefined;
        }

        if (typeof denominator !== "number" || !Number.isInteger(denominator) || denominator <= 0) {
            return undefined;
        }

        const parsed: IFraction = { numerator, denominator };
        if (compareFractions(parsed, this.startOfBar) < 0 || compareFractions(parsed, this.endOfBar) >= 0) {
            return undefined;
        }

        return { bar, start: parsed };
    }
}
