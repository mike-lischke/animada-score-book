/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import { Track } from "./Track.js";
import type { IArrangement, IInstrument, ITimeParams, ITrack } from "./types/general.js";

export class Arrangement extends Publisher implements IArrangement {
    /** All tracks in display order for the arrangement. */
    public readonly tracks: ITrack[] = [];

    private titleString: string | undefined;

    /**
     * Creates a new arrangement with the given time parameters and optional title.
     *
     * @param timeParams The timing configuration used by this arrangement.
     * @param title Optional initial title for the arrangement.
     */
    public constructor(public timeParams: ITimeParams, title?: string) {
        super();
        this.titleString = title;
    }

    /**
     * Adds a track for the given instrument, maintaining display-order sorting.
     *
     * @param instrument The instrument to create a track for.
     * @param id Optional explicit track id; if omitted a new id is generated.
     * @returns The newly created track.
     */
    public addTrack(instrument: IInstrument, id?: number): ITrack {
        const index = this.tracks.findIndex((track) => {
            return track.instrument.displayOrder > instrument.displayOrder;
        });
        const track = new Track(this, instrument, id);
        if (index === -1) {
            this.tracks.push(track);
        } else {
            this.tracks.splice(index, 0, track);
        }
        this.publish();

        return track;
    };

    /**
     * Removes the specified track.
     *
     * @param trackToRemove The track to remove.
     * @returns True if the track was found and removed; throws otherwise.
     */
    public removeTrack(trackToRemove: ITrack): boolean {
        const index = this.tracks.indexOf(trackToRemove);
        if (index !== -1) {
            this.tracks.splice(index, 1);
            this.publish();

            return true;
        } else {
            console.warn(`Tried to remove a track but no reference to it. id: ${trackToRemove.id}`);
            throw new Error();
        }
    };

    /**
     * Current arrangement title.
     *
     * @returns The title string, defaulting to "Untitled Arrangement" if not set.
     */
    public get title() {
        return this.titleString ?? "Untitled Arrangement";
    }

    /**
     * Updates the arrangement title and publishes the change.
     *
     * @param newTitle The new title string.
     */
    public set title(newTitle: string) {
        this.titleString = newTitle;
        this.publish();
    }

};
