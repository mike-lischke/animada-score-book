/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import { Track } from "./Track.js";
import type { IArrangement, IInstrument, ITimeParams, ITrack } from "./types/general.js";

export class Arrangement extends Publisher implements IArrangement {

    public readonly tracks: ITrack[] = [];

    private titleString: string | undefined;

    public constructor(public timeParams: ITimeParams, title?: string) {
        super();
        this.titleString = title;
    }

    // We keep tracks in order right here, so the rest of the app doesn't have to fiddle around figuring this out
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

    public get title() {
        return this.titleString ?? "Untitled Arrangement";
    }

    public set title(newTitle: string) {
        this.titleString = newTitle;
        this.publish();
    }

};
