/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrack, ISbDmTrackMeasure } from "../core/ScoreBookDataModel.js";
import { formatFraction } from "../core/serialisation/numeric-functions.js";
import type { IMeasureEvent, IFraction, ISubdivision } from "../core/types/general.js";
import { SelectionGranularity, type ISelectionTarget } from "./SelectionSerializer.js";

/** Rendered score element kinds that have a corresponding selection target. */
export enum ScoreElementKind {
    GridCell,
    StaffRun,
    BarContainer,
    TrackRow,
}

/** Domain identity and rendered kind of a score element. */
export interface IScoreElementLocation {
    kind: ScoreElementKind;
    bar: number;
    trackId: number;
    step?: number;
    noteId?: number;
    start?: IFraction;

    /** The measure the element renders, so a consumer can resolve the model object behind it. */
    measure?: ISbDmTrackMeasure;
}

/**
 * The model objects a rendered element can stand for. These are the objects a renderer supplies for
 * the element it draws and the objects a selection addresses.
 */
export type IScoreElementTarget = IMeasureEvent | ISbDmTrack | ISbDmTrackMeasure | ISubdivision;

interface IScoreElementRecord {
    element: HTMLElement;
    location: IScoreElementLocation;

    /** The model object the element renders, when the renderer supplies one. */
    target?: IScoreElementTarget;
}

/**
 * Owns the live DOM representation of one arrangement viewer.
 *
 * Renderers update this registry through callback refs. Consumers therefore resolve score elements
 * through domain identities instead of serializing those identities into DOM attributes.
 */
export class ScoreElementRegistry {
    private readonly records = new Set<IScoreElementRecord>();
    private readonly recordsByElement = new Map<HTMLElement, IScoreElementRecord>();
    private readonly recordsByTarget = new Map<IScoreElementTarget, Set<IScoreElementRecord>>();
    private readonly recordsByTrackPiece = new Map<string, Set<IScoreElementRecord>>();
    private readonly recordsByNoteId = new Map<number, IScoreElementRecord>();
    private readonly recordsByStart = new Map<string, IScoreElementRecord>();
    private readonly recordsByStep = new Map<string, Set<IScoreElementRecord>>();

    /**
     * Creates a callback ref that keeps the supplied location's registration current.
     *
     * @param location The domain identity to associate with the rendered element.
     * @param target The model object the element renders. Renderers that supply it make the element
     *               findable by object identity, which is what a selection holds.
     *
     * @returns A Preact callback ref for the score element.
     */
    public createRef(location: IScoreElementLocation,
        target?: IScoreElementTarget): (element: HTMLElement | null) => void {
        let record: IScoreElementRecord | undefined;

        return (element) => {
            if (record) {
                this.unregister(record);
                record = undefined;
            }

            if (element) {
                record = { element, location, target };
                this.register(record);
            }
        };
    }

    /**
     * Returns the element that was registered for a model object.
     *
     * @param target The model object the renderer supplied.
     * @param kind Optional rendered kind to restrict the result to.
     *
     * @returns The live element, or undefined when the object is not rendered.
     */
    public findTargetElement(target: IScoreElementTarget, kind?: ScoreElementKind): HTMLElement | undefined {
        return this.collectTarget(target, kind).at(0);
    }

    /**
     * Returns the model object a rendered element stands for. Hit tests use it to put the object
     * they matched into a selection instead of a position that would have to be translated back.
     *
     * @param element The live DOM element to inspect.
     *
     * @returns The model object, or undefined when the renderer supplied none.
     */
    public getTarget(element: HTMLElement): IScoreElementTarget | undefined {
        return this.recordsByElement.get(element)?.target;
    }

    /**
     * Finds the rendered elements a selection target refers to.
     *
     * @param target The model objects the selection addresses.
     * @param kind Optional rendered kind to restrict the result to.
     *
     * @returns The currently registered matching elements.
     */
    public findTargetElements(target: ISelectionTarget, kind?: ScoreElementKind): HTMLElement[] {
        switch (target.granularity) {
            case SelectionGranularity.Note: {
                const { start } = target;
                if (start !== undefined) {
                    const record = this.recordsByStart.get(
                        this.createStartKey(target.measure.number, target.measure.track.id, start),
                    );
                    if (record !== undefined && this.matchesKind(record, kind)) {
                        return [record.element];
                    }
                }

                return this.collectTarget(target.event, kind);
            }

            case SelectionGranularity.NoteGroup: {
                const elements: HTMLElement[] = [];
                for (const event of target.events) {
                    for (const element of this.collectTarget(event, kind)) {
                        if (!elements.includes(element)) {
                            elements.push(element);
                        }
                    }
                }

                return elements;
            }

            case SelectionGranularity.Track: {
                return this.collectTrackPieces(target.track.measures.map((measure) => {
                    return { bar: measure.number, trackId: target.track.id };
                }), kind);
            }

            case SelectionGranularity.Measure: {
                return this.collectTrackPieces(target.measure.track.arrangement.tracks.map((track) => {
                    return { bar: target.measure.number, trackId: track.id };
                }), kind);
            }

            case SelectionGranularity.TrackPiece: {
                return this.collectTrackPieces([{ bar: target.measure.number, trackId: target.track.id }], kind);
            }
        }
    }

    /**
     * Returns the element rendered at a score position. Positions inside a subdivision slot do not
     * align to a grid step, so they are addressed by their exact start.
     *
     * @param bar The one-based measure number.
     * @param trackId The track identity.
     * @param kind The rendered element kind to retrieve.
     * @param step The zero-based step index the position falls on.
     * @param start The exact start within the measure; takes precedence over the step.
     *
     * @returns The live element, or undefined when nothing is rendered at the position.
     */
    public findPositionElement(bar: number, trackId: number, kind: ScoreElementKind,
        step?: number, start?: IFraction): HTMLElement | undefined {
        if (start !== undefined) {
            const record = this.recordsByStart.get(this.createStartKey(bar, trackId, start));

            return record && this.matchesKind(record, kind) ? record.element : undefined;
        }

        if (step === undefined) {
            return undefined;
        }

        const records = this.recordsByStep.get(this.createStepKey(bar, trackId, step));
        if (!records) {
            return undefined;
        }

        for (const record of records) {
            if (this.matchesKind(record, kind)) {
                return record.element;
            }
        }

        return undefined;
    }

    /**
     * Returns the registration metadata for a currently registered element.
     *
     * @param element The live DOM element to inspect.
     *
     * @returns The domain location, or undefined when the element is not registered.
     */
    public getLocation(element: HTMLElement): IScoreElementLocation | undefined {
        return this.recordsByElement.get(element)?.location;
    }

    /**
     * Returns all live elements of a kind, optionally restricted to one bar or track.
     *
     * @param kind The rendered element kind to retrieve.
     * @param bar Optional one-based measure number.
     * @param trackId Optional track identity.
     *
     * @returns Matching live DOM elements in registration order.
     */
    public findElements(kind: ScoreElementKind, bar?: number, trackId?: number): HTMLElement[] {
        const elements: HTMLElement[] = [];
        for (const record of this.records) {
            const location = record.location;
            if (location.kind === kind
                && (bar === undefined || location.bar === bar)
                && (trackId === undefined || location.trackId === trackId)) {
                elements.push(record.element);
            }
        }

        return elements;
    }

    /** Removes every live element registration. */
    public clear(): void {
        this.records.clear();
        this.recordsByElement.clear();
        this.recordsByTarget.clear();
        this.recordsByTrackPiece.clear();
        this.recordsByNoteId.clear();
        this.recordsByStart.clear();
        this.recordsByStep.clear();
    }

    private register(record: IScoreElementRecord): void {
        const { element, location, target } = record;
        this.records.add(record);
        this.recordsByElement.set(element, record);

        if (target !== undefined) {
            this.addToIndex(this.recordsByTarget, target, record);
        }

        if (location.noteId !== undefined) {
            this.recordsByNoteId.set(location.noteId, record);
        }

        if (location.start !== undefined) {
            this.recordsByStart.set(this.createStartKey(location.bar, location.trackId, location.start), record);
        }

        if (location.step !== undefined) {
            this.addToIndex(this.recordsByStep,
                this.createStepKey(location.bar, location.trackId, location.step), record);
        }

        this.addToIndex(this.recordsByTrackPiece, this.createPieceKey(location.bar, location.trackId), record);
    }

    private unregister(record: IScoreElementRecord): void {
        const { element, location, target } = record;
        this.records.delete(record);
        this.recordsByElement.delete(element);

        if (target !== undefined) {
            this.removeFromIndex(this.recordsByTarget, target, record);
        }

        if (location.noteId !== undefined && this.recordsByNoteId.get(location.noteId) === record) {
            this.recordsByNoteId.delete(location.noteId);
        }

        if (location.start !== undefined) {
            const key = this.createStartKey(location.bar, location.trackId, location.start);
            if (this.recordsByStart.get(key) === record) {
                this.recordsByStart.delete(key);
            }
        }

        if (location.step !== undefined) {
            this.removeFromIndex(this.recordsByStep,
                this.createStepKey(location.bar, location.trackId, location.step), record);
        }

        this.removeFromIndex(this.recordsByTrackPiece, this.createPieceKey(location.bar, location.trackId), record);
    }

    private addToIndex<TKey>(index: Map<TKey, Set<IScoreElementRecord>>, key: TKey,
        record: IScoreElementRecord): void {
        const records = index.get(key);
        if (records) {
            records.add(record);
        } else {
            index.set(key, new Set([record]));
        }
    }

    private removeFromIndex<TKey>(index: Map<TKey, Set<IScoreElementRecord>>, key: TKey,
        record: IScoreElementRecord): void {
        const records = index.get(key);
        records?.delete(record);
        if (records?.size === 0) {
            index.delete(key);
        }
    }

    private collectTarget(target: IScoreElementTarget, kind?: ScoreElementKind): HTMLElement[] {
        const records = this.recordsByTarget.get(target);
        if (!records) {
            return [];
        }

        const elements: HTMLElement[] = [];
        for (const record of records) {
            if (this.matchesKind(record, kind)) {
                elements.push(record.element);
            }
        }

        return elements;
    }

    private collectTrackPieces(pieces: Array<{ bar: number; trackId: number; }>,
        kind?: ScoreElementKind): HTMLElement[] {
        const elements: HTMLElement[] = [];
        for (const { bar, trackId } of pieces) {
            const records = this.recordsByTrackPiece.get(this.createPieceKey(bar, trackId));
            if (!records) {
                continue;
            }

            for (const record of records) {
                if (this.matchesKind(record, kind)) {
                    elements.push(record.element);
                }
            }
        }

        return elements;
    }

    private matchesKind(record: IScoreElementRecord, kind: ScoreElementKind | undefined): boolean {
        return kind === undefined || record.location.kind === kind;
    }

    private createStartKey(bar: number, trackId: number, start: IFraction): string {
        return `${bar}:${trackId}:${formatFraction(start)}`;
    }

    private createStepKey(bar: number, trackId: number, step: number): string {
        return `${bar}:${trackId}:${step}`;
    }

    private createPieceKey(bar: number, trackId: number): string {
        return `${bar}:${trackId}`;
    }
}
