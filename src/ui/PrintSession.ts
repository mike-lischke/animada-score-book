/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { MeasureLayout } from "../core/MeasureLayout.js";
import {
    PageOrientation, type IPageMargins, type IPrintPageSetup,
} from "../core/PrintLayout.js";
import type { ISbDmArrangement } from "../core/ScoreBookDataModel.js";
import { clampValue } from "../core/utils.js";

/** Least factor the print scale may take. */
export const minPrintScale = 0.1;

/** Greatest factor the print scale may take. */
export const maxPrintScale = 2;

/** Narrowest page margin a session accepts, in millimeters. */
export const minPrintMargin = -5;

/** Widest page margin a session accepts, in millimeters. */
export const maxPrintMargin = 50;

/** Least magnification the preview may take. */
export const minPreviewZoom = 0.1;

/** Greatest magnification the preview may take. */
export const maxPreviewZoom = 4;

/** Page margins a session starts with, in millimeters. */
export const defaultPrintMargins: IPageMargins = { top: 15, right: 15, bottom: 15, left: 15 };

/**
 * Print scale a session starts with. The unscaled measure widths of the track viewer are wider than a page, so a
 * session without one would only ever report oversized systems.
 */
export const defaultPrintScale = 0.45;

/** What a session keeps for one arrangement. */
interface IPrintArrangementState {
    /** Selected track ids, or undefined while every track of the arrangement is selected. */
    selectedTrackIds?: Set<number>;

    /** Print-only measure widths, keyed by 1-based measure number, in layout px at 100% zoom. */
    readonly widthOverrides: Map<number, number>;
}

/**
 * The print preview's session state.
 *
 * It splits into settings that hold for every printed score of the application session (paper, margins, print
 * scale, preview zoom) and state that belongs to one arrangement (the track selection and the temporary measure
 * widths). Arrangement state is keyed by the arrangement's runtime id, so reopening a score inside the session
 * brings its own state back and a different score never inherits it. Nothing here writes to the arrangement: the
 * print widths are not saved, do not mark the score dirty and never enter the undo history.
 */
export class PrintSession {
    private readonly arrangementStates = new Map<number, IPrintArrangementState>();
    private setup: IPrintPageSetup = {
        orientation: PageOrientation.Portrait,
        margins: { ...defaultPrintMargins },
        printScale: defaultPrintScale,
    };

    private zoom = 1;

    /** @returns The page settings every printed score of this session shares. */
    public get pageSetup(): IPrintPageSetup {
        return { ...this.setup, margins: { ...this.setup.margins } };
    }

    /** @returns The magnification of the preview on screen, which never changes the printed layout. */
    public get previewZoom(): number {
        return this.zoom;
    }

    /**
     * @param orientation The orientation the printed paper takes.
     */
    public setOrientation(orientation: PageOrientation): void {
        this.setup = { ...this.setup, orientation };
    }

    /**
     * @param margins The margins of the printed paper, in millimeters, clamped to the supported range.
     */
    public setMargins(margins: IPageMargins): void {
        this.setup = {
            ...this.setup,
            margins: {
                top: clampValue(margins.top, minPrintMargin, maxPrintMargin),
                right: clampValue(margins.right, minPrintMargin, maxPrintMargin),
                bottom: clampValue(margins.bottom, minPrintMargin, maxPrintMargin),
                left: clampValue(margins.left, minPrintMargin, maxPrintMargin),
            },
        };
    }

    /**
     * @param printScale The factor the score is drawn at on paper, clamped to the supported range.
     */
    public setPrintScale(printScale: number): void {
        this.setup = { ...this.setup, printScale: clampValue(printScale, minPrintScale, maxPrintScale) };
    }

    /**
     * @param zoom The magnification of the preview on screen, clamped to the supported range.
     */
    public setPreviewZoom(zoom: number): void {
        this.zoom = clampValue(zoom, minPreviewZoom, maxPreviewZoom);
    }

    /**
     * @param arrangement The arrangement to inspect.
     *
     * @returns The selected track ids, or undefined while every track of the arrangement is selected.
     */
    public selectedTrackIds(arrangement: ISbDmArrangement): ReadonlySet<number> | undefined {
        return this.stateOf(arrangement).selectedTrackIds;
    }

    /**
     * @param arrangement The arrangement to inspect.
     * @param trackId The id of the track to test.
     *
     * @returns Whether the track is printed.
     */
    public isTrackSelected(arrangement: ISbDmArrangement, trackId: number): boolean {
        const selectedTrackIds = this.stateOf(arrangement).selectedTrackIds;

        return selectedTrackIds === undefined || selectedTrackIds.has(trackId);
    }

    /**
     * Selects or deselects a track. The last selected track cannot be deselected, so a print always shows notation.
     *
     * @param arrangement The arrangement the track belongs to.
     * @param trackId The id of the track to change.
     * @param selected Whether the track is printed.
     *
     * @returns Whether the selection changed. A refused deselection reports false.
     */
    public setTrackSelected(arrangement: ISbDmArrangement, trackId: number, selected: boolean): boolean {
        const state = this.stateOf(arrangement);

        if (selected) {
            const current = state.selectedTrackIds;
            if (current !== undefined) {
                current.add(trackId);
                if (arrangement.tracks.every((track) => {
                    return current.has(track.id);
                })) {
                    // Every track is selected again, which is what the initial state states.
                    state.selectedTrackIds = undefined;
                }
            }

            return true;
        }

        const selectedTrackIds = state.selectedTrackIds ?? new Set(arrangement.tracks.map((track) => {
            return track.id;
        }));
        if (selectedTrackIds.size <= 1 && selectedTrackIds.has(trackId)) {
            return false;
        }

        selectedTrackIds.delete(trackId);
        state.selectedTrackIds = selectedTrackIds;

        return true;
    }

    /**
     * @param arrangement The arrangement whose tracks are all printed again.
     */
    public selectAllTracks(arrangement: ISbDmArrangement): void {
        this.stateOf(arrangement).selectedTrackIds = undefined;
    }

    /**
     * @param arrangement The arrangement to inspect.
     *
     * @returns The temporary print widths of the arrangement, in layout px at 100% zoom.
     */
    public widthOverrides(arrangement: ISbDmArrangement): ReadonlyMap<number, number> {
        return this.stateOf(arrangement).widthOverrides;
    }

    /**
     * Sets a temporary print width for one measure of the arrangement. The width is raised to what the measure's
     * notation needs, and applies to that measure in every selected track.
     *
     * @param arrangement The arrangement the measure belongs to.
     * @param bar The 1-based measure number.
     * @param width The width to print the measure at, in layout px at 100% zoom.
     */
    public setWidthOverride(arrangement: ISbDmArrangement, bar: number, width: number): void {
        const minimumPx = MeasureLayout.contentMinimumWidthOfMeasure(arrangement, bar);
        this.stateOf(arrangement).widthOverrides.set(bar, Math.max(width, minimumPx));
    }

    /**
     * @param arrangement The arrangement the measure belongs to.
     * @param bar The 1-based measure number whose print width returns to the score width.
     */
    public resetWidthOverride(arrangement: ISbDmArrangement, bar: number): void {
        this.stateOf(arrangement).widthOverrides.delete(bar);
    }

    /**
     * @param arrangement The arrangement whose measures all return to their score widths.
     */
    public resetWidthOverrides(arrangement: ISbDmArrangement): void {
        this.stateOf(arrangement).widthOverrides.clear();
    }

    /**
     * Drops everything the session keeps for an arrangement: its track selection and its print widths.
     *
     * @param arrangement The arrangement to reset.
     */
    public resetArrangement(arrangement: ISbDmArrangement): void {
        this.arrangementStates.delete(arrangement.id);
    }

    /**
     * Drops the state of an arrangement the session no longer shows.
     *
     * @param arrangementId The runtime id of the arrangement to forget.
     */
    public forgetArrangement(arrangementId: number): void {
        this.arrangementStates.delete(arrangementId);
    }

    /**
     * @param arrangement The arrangement whose state is requested.
     *
     * @returns The state of the arrangement, created on first use.
     */
    private stateOf(arrangement: ISbDmArrangement): IPrintArrangementState {
        let state = this.arrangementStates.get(arrangement.id);
        if (state === undefined) {
            state = { widthOverrides: new Map() };
            this.arrangementStates.set(arrangement.id, state);
        }

        return state;
    }
}
