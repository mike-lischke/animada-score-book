/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { compareFractions, subtractFractions } from "./serialisation/numeric-functions.js";
import type { ISbDmArrangement } from "./ScoreBookDataModel.js";
import type {
    IArticulationPortion, IFraction, IForteMark, IHairpin, IMeasureEvent, IRangeArticulation,
    IRangeArticulationAnchor, IRangeArticulationPlacement,
} from "./types/general.js";
import { RangeArticulationKind as Kind } from "./types/general.js";
import { getNewId, reserveId } from "./utils.js";

/** The end of a hairpin a handle drag moves. */
export enum HairpinEnd {
    From,
    To,
}

/**
 * The hairpins and `f` markings of an arrangement, together with the rules and transformations that govern them.
 * Every anchor is addressed by its measure and exact event onset, so no rule depends on rendered note elements.
 */
export class RangeArticulations implements Iterable<IRangeArticulation> {
    /** Smallest span a hairpin keeps, as a bar fraction, so a degenerate or reversed hairpin cannot be created. */
    public static readonly minimumHairpinSpan: IFraction = { numerator: 1, denominator: 32 };

    /** The softest level a hairpin opens to or closes at, as a factor of the track volume. */
    private static readonly softDynamics = 0.2;

    /** The normal level an `f` restores and an unmarked passage plays at. */
    private static readonly normalDynamics = 1;

    private static readonly startOfBar: IFraction = { numerator: 0, denominator: 1 };
    private static readonly endOfBar: IFraction = { numerator: 1, denominator: 1 };

    /** The markings of the arrangement, in insertion order. */
    private readonly items: IRangeArticulation[] = [];

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
     * Builds a stored marking from a placement a paste supplies, minting the id the placement leaves out.
     *
     * @param trackId The track the marking belongs to.
     * @param placement The marking's kind and anchors.
     *
     * @returns A new marking that can be stored.
     */
    public static materialise(trackId: number, placement: IRangeArticulationPlacement): IRangeArticulation {
        if (placement.kind === Kind.Forte) {
            return { id: getNewId(), trackId, kind: placement.kind, at: this.cloneAnchor(placement.at) };
        }

        return {
            id: getNewId(),
            trackId,
            kind: placement.kind,
            from: this.cloneAnchor(placement.from),
            to: this.cloneAnchor(placement.to),
        };
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
     * The part of a marking that lies in one bar, for a view that draws every bar on its own.
     *
     * @param articulation The marking to clip.
     * @param bar The 1-based bar to clip to.
     *
     * @returns The start and end of the marking's part in that bar, or undefined when it does not reach into it.
     */
    public static portionInBar(articulation: IRangeArticulation, bar: number): IArticulationPortion | undefined {
        if (!this.isHairpin(articulation)) {
            return articulation.at.bar === bar
                ? { start: articulation.at.start, end: articulation.at.start }
                : undefined;
        }

        if (bar < articulation.from.bar || bar > articulation.to.bar) {
            return undefined;
        }

        const start = bar > articulation.from.bar ? this.startOfBar : articulation.from.start;
        const end = bar < articulation.to.bar ? this.endOfBar : articulation.to.start;

        return { start, end };
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
     * The dynamic level a track plays at a written position, as a factor on top of the track volume. A hairpin
     * ramps linearly between its anchors, an `f` restores the normal level, and the level an instruction ends at
     * is kept until the next instruction starts. A position before every instruction plays at the normal level.
     *
     * @param markings The markings of one track, in any order.
     * @param anchor The written position: the measure and the event onset inside it.
     *
     * @returns The dynamic factor: 1 for the normal level, 0.2 for the softest a hairpin opens to.
     */
    public static dynamicsFactor(markings: readonly IRangeArticulation[],
        anchor: IRangeArticulationAnchor): number {
        let active: IRangeArticulation | undefined;
        let activeStart: IRangeArticulationAnchor | undefined;

        for (const marking of markings) {
            const start = this.isHairpin(marking) ? marking.from : marking.at;
            if (this.compareAnchors(start, anchor) > 0) {
                continue;
            }

            if (activeStart === undefined || this.compareAnchors(start, activeStart) > 0) {
                active = marking;
                activeStart = start;
            }
        }

        if (active === undefined || !this.isHairpin(active)) {
            return this.normalDynamics;
        }

        const to = this.absolutePosition(active.to);
        const at = this.absolutePosition(anchor);
        if (at >= to) {
            return active.kind === Kind.Crescendo ? this.normalDynamics : this.softDynamics;
        }

        const from = this.absolutePosition(active.from);
        const opening = active.kind === Kind.Crescendo ? this.softDynamics : this.normalDynamics;
        const closing = active.kind === Kind.Crescendo ? this.normalDynamics : this.softDynamics;
        const ratio = (at - from) / (to - from);

        return opening + (ratio * (closing - opening));
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
     * @returns The markings, in insertion order. Read-only: every write goes through the methods of this class.
     */
    public get all(): readonly IRangeArticulation[] {
        return this.items;
    }

    /**
     * @returns How many markings the arrangement holds.
     */
    public get size(): number {
        return this.items.length;
    }

    /**
     * @returns An iterator over the markings, in insertion order.
     */
    public [Symbol.iterator](): IterableIterator<IRangeArticulation> {
        return this.items[Symbol.iterator]();
    }

    /**
     * @param id The id to look for.
     *
     * @returns The stored marking with that id, or undefined. The marking is the stored one, so a caller that moves
     * it writes the change back into the arrangement.
     */
    public find(id: number): IRangeArticulation | undefined {
        return this.items.find((articulation) => {
            return articulation.id === id;
        });
    }

    /**
     * @param trackId The track to read.
     *
     * @returns The markings of that track, in insertion order.
     */
    public forTrack(trackId: number): IRangeArticulation[] {
        return this.items.filter((articulation) => {
            return articulation.trackId === trackId;
        });
    }

    /**
     * @param articulation The marking to store.
     */
    public add(articulation: IRangeArticulation): void {
        this.items.push(articulation);
    }

    /**
     * @param id The id of the marking to remove.
     *
     * @returns The removed marking, or undefined when no marking has that id.
     */
    public remove(id: number): IRangeArticulation | undefined {
        const index = this.items.findIndex((articulation) => {
            return articulation.id === id;
        });

        return index < 0 ? undefined : this.items.splice(index, 1)[0];
    }

    /** Removes every marking. */
    public clear(): void {
        this.items.splice(0, this.items.length);
    }

    /**
     * Moves every anchor that lies at or behind a bar by a delta, so a marking stays with the measure it belongs
     * to when bars are inserted or removed.
     *
     * @param fromBar The first 1-based bar whose anchors move.
     * @param delta The number of bars they move by.
     */
    public shiftAnchors(fromBar: number, delta: number): void {
        if (delta === 0) {
            return;
        }

        for (const articulation of this.items) {
            if (RangeArticulations.isHairpin(articulation)) {
                if (articulation.from.bar >= fromBar) {
                    articulation.from.bar += delta;
                }

                if (articulation.to.bar >= fromBar) {
                    articulation.to.bar += delta;
                }
            } else if (articulation.at.bar >= fromBar) {
                articulation.at.bar += delta;
            }
        }
    }

    /**
     * Copies every marking that lies fully inside one bar into another bar, with fresh ids, which is what a
     * duplicated bar carries over. A hairpin that reaches over the barline is not contained and stays behind.
     *
     * @param sourceBar The 1-based bar the markings lie in.
     * @param targetBar The 1-based bar they are copied to.
     */
    public copyContained(sourceBar: number, targetBar: number): void {
        if (sourceBar === targetBar) {
            return;
        }

        const clones: IRangeArticulation[] = [];

        for (const articulation of this.items) {
            if (RangeArticulations.isFullyContained(articulation, sourceBar)) {
                clones.push(RangeArticulations.cloneIntoBar(articulation, targetBar));
            }
        }

        this.items.push(...clones);
    }

    /**
     * Drops every marking that has an anchor inside the given bar, which is what a removed or cleared bar
     * leaves behind.
     *
     * @param bar The 1-based bar to drop from.
     *
     * @returns True when at least one marking was dropped.
     */
    public dropInBar(bar: number): boolean {
        return this.retain(this.items.filter((articulation) => {
            return !RangeArticulations.anchorInBar(articulation, bar);
        }));
    }

    /**
     * Drops every marking of a removed track.
     *
     * @param trackId The id of the removed track.
     *
     * @returns True when at least one marking was dropped.
     */
    public removeTrack(trackId: number): boolean {
        return this.retain(this.items.filter((articulation) => {
            return articulation.trackId !== trackId;
        }));
    }

    /**
     * Copies every marking of a track onto a duplicate of that track, with fresh ids.
     *
     * @param sourceTrackId The id of the track the markings belong to.
     * @param targetTrackId The id of the duplicate.
     */
    public duplicateTrack(sourceTrackId: number, targetTrackId: number): void {
        const clones: IRangeArticulation[] = [];

        for (const articulation of this.items) {
            if (articulation.trackId === sourceTrackId) {
                clones.push(RangeArticulations.cloneOntoTrack(articulation, targetTrackId));
            }
        }

        this.items.push(...clones);
    }

    /**
     * Drops the markings of the given tracks whose anchors no longer name an event, so a content edit that moved
     * or removed an anchor note does not leave a stale marking behind.
     *
     * @param arrangement The arrangement to reconcile. Its tracks must hold the edited content already.
     * @param trackIds The ids of the tracks whose content changed.
     *
     * @returns True when at least one marking was dropped.
     */
    public removeInvalid(arrangement: ISbDmArrangement, trackIds: ReadonlySet<number>): boolean {
        return this.retain(this.items.filter((articulation) => {
            if (!trackIds.has(articulation.trackId)) {
                return true;
            }

            return RangeArticulations.isHairpin(articulation)
                ? RangeArticulations.isValidHairpin(arrangement, articulation)
                : RangeArticulations.isValidForteMark(arrangement, articulation);
        }));
    }

    /**
     * Validates a stored chunk of markings and keeps every marking that survives it, replacing the markings held
     * now. Markings are dropped when their ids, track, kind, anchors or ordering are invalid, or when a hairpin
     * overlaps one that was already kept.
     *
     * @param chunk The stored chunk, as it was written.
     * @param arrangement The arrangement the anchors are resolved against. Its tracks must be restored already.
     */
    public load(chunk: unknown, arrangement: ISbDmArrangement): void {
        this.items.splice(0, this.items.length);

        if (!Array.isArray(chunk)) {
            return;
        }

        const barCount = arrangement.timeParams.length;
        const usedIds = new Set<number>();

        for (const entry of chunk) {
            const articulation = RangeArticulations.parseArticulation(entry, arrangement, barCount);
            if (articulation === undefined || usedIds.has(articulation.id)) {
                continue;
            }

            if (RangeArticulations.isHairpin(articulation)
                && RangeArticulations.conflicts(articulation, this.items)) {
                continue;
            }

            usedIds.add(articulation.id);
            reserveId(articulation.id);
            this.items.push(articulation);
        }
    }

    /**
     * @param anchor The anchor to place.
     *
     * @returns The anchor as a number of performed bars, so two anchors can be interpolated between.
     */
    private static absolutePosition(anchor: IRangeArticulationAnchor): number {
        return (anchor.bar - 1) + (anchor.start.numerator / anchor.start.denominator);
    }

    private static isFullyContained(articulation: IRangeArticulation, bar: number): boolean {
        return this.isHairpin(articulation)
            ? articulation.from.bar === bar && articulation.to.bar === bar
            : articulation.at.bar === bar;
    }

    private static anchorInBar(articulation: IRangeArticulation, bar: number): boolean {
        return this.isHairpin(articulation)
            ? articulation.from.bar === bar || articulation.to.bar === bar
            : articulation.at.bar === bar;
    }

    private static cloneIntoBar(articulation: IRangeArticulation, bar: number): IRangeArticulation {
        if (this.isHairpin(articulation)) {
            return {
                id: getNewId(),
                trackId: articulation.trackId,
                kind: articulation.kind,
                from: { bar, start: { ...articulation.from.start } },
                to: { bar, start: { ...articulation.to.start } },
            };
        }

        return {
            id: getNewId(),
            trackId: articulation.trackId,
            kind: articulation.kind,
            at: { bar, start: { ...articulation.at.start } },
        };
    }

    private static cloneOntoTrack(articulation: IRangeArticulation, trackId: number): IRangeArticulation {
        if (this.isHairpin(articulation)) {
            return {
                id: getNewId(),
                trackId,
                kind: articulation.kind,
                from: this.cloneAnchor(articulation.from),
                to: this.cloneAnchor(articulation.to),
            };
        }

        return { id: getNewId(), trackId, kind: articulation.kind, at: this.cloneAnchor(articulation.at) };
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

    /**
     * @param kept The markings to keep.
     *
     * @returns True when something was dropped.
     */
    private retain(kept: IRangeArticulation[]): boolean {
        if (kept.length === this.items.length) {
            return false;
        }

        this.items.splice(0, this.items.length, ...kept);

        return true;
    }
}
