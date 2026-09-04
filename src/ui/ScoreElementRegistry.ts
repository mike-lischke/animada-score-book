/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { formatFraction } from "../core/serialisation/numeric-functions.js";
import type { IFraction } from "../core/types/general.js";
import type { ISelectionEntry } from "./selection-types.js";

/** Rendered score element kinds that have a corresponding selection target. */
export enum ScoreElementKind {
    GridCell,
    StaffRun,
}

/** Domain identity and rendered kind of a score element. */
export interface IScoreElementLocation {
    kind: ScoreElementKind;
    bar: number;
    trackId: number;
    step?: number;
    noteId?: number;
    start?: IFraction;
}

interface IScoreElementRecord {
    element: HTMLElement;
    location: IScoreElementLocation;
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
    private readonly recordsByNoteId = new Map<number, IScoreElementRecord>();
    private readonly recordsByStart = new Map<string, IScoreElementRecord>();
    private readonly recordsByStep = new Map<string, Set<IScoreElementRecord>>();

    /**
     * Creates a callback ref that keeps the supplied location's registration current.
     *
     * @param location The domain identity to associate with the rendered element.
     *
     * @returns A Preact callback ref for the score element.
     */
    public createRef(location: IScoreElementLocation): (element: HTMLElement | null) => void {
        let record: IScoreElementRecord | undefined;

        return (element) => {
            if (record) {
                this.unregister(record);
                record = undefined;
            }

            if (element) {
                record = { element, location };
                this.register(record);
            }
        };
    }

    /**
     * Finds the rendered elements represented by a selection entry.
     *
     * @param entry The selection identity to resolve.
     * @param kind Optional rendered kind to restrict the result to.
     *
     * @returns The currently registered matching elements.
     */
    public findSelectionElements(entry: ISelectionEntry, kind?: ScoreElementKind): HTMLElement[] {
        if (entry.noteId !== undefined) {
            const record = this.recordsByNoteId.get(entry.noteId);

            return record && this.matchesKind(record, kind) ? [record.element] : [];
        }

        if (entry.start !== undefined) {
            const record = this.recordsByStart.get(this.createStartKey(entry.bar, entry.trackId, entry.start));

            return record && this.matchesKind(record, kind) ? [record.element] : [];
        }

        if (entry.startStep === undefined) {
            return [];
        }

        const endStep = entry.endStep ?? entry.startStep;
        const elements: HTMLElement[] = [];
        for (let step = entry.startStep; step <= endStep; step++) {
            const records = this.recordsByStep.get(this.createStepKey(entry.bar, entry.trackId, step));
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
        this.recordsByNoteId.clear();
        this.recordsByStart.clear();
        this.recordsByStep.clear();
    }

    private register(record: IScoreElementRecord): void {
        const { element, location } = record;
        this.records.add(record);
        this.recordsByElement.set(element, record);

        if (location.noteId !== undefined) {
            this.recordsByNoteId.set(location.noteId, record);
        }

        if (location.start !== undefined) {
            this.recordsByStart.set(this.createStartKey(location.bar, location.trackId, location.start), record);
        }

        if (location.step !== undefined) {
            const key = this.createStepKey(location.bar, location.trackId, location.step);
            let records = this.recordsByStep.get(key);
            if (!records) {
                records = new Set<IScoreElementRecord>();
                this.recordsByStep.set(key, records);
            }

            records.add(record);
        }
    }

    private unregister(record: IScoreElementRecord): void {
        const { element, location } = record;
        this.records.delete(record);
        this.recordsByElement.delete(element);

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
            const key = this.createStepKey(location.bar, location.trackId, location.step);
            const records = this.recordsByStep.get(key);
            records?.delete(record);
            if (records?.size === 0) {
                this.recordsByStep.delete(key);
            }
        }
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
}
