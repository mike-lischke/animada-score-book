/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ITimeParams, IArrangement, ITrack, IInstrument } from "./types/general.js";
import { createTrack } from "./Track.js";
import { createPublisher } from "./Publisher.js";

export const createArrangement = (timeParams: ITimeParams, title?: string): IArrangement => {
    // We keep tracks in order right here, so the rest of the app doesn't have to fiddle around figuring this out
    const addTrack = (instrument: IInstrument, id?: number): ITrack => {
        const index = tracks.findIndex((track) => {
            return track.instrument.displayOrder > instrument.displayOrder;
        });
        const track = createTrack(arrangement, instrument, id);
        if (index === -1) {
            tracks.push(track);
        } else {
            tracks.splice(index, 0, track);
        }
        publisher.publish();

        return track;
    };

    const removeTrack = (trackToRemove: ITrack) => {
        const index = tracks.indexOf(trackToRemove);
        if (index !== -1) {
            tracks.splice(index, 1);
            publisher.publish();

            return true;
        } else {
            console.warn(`Tried to remove a track but no reference to it. id: ${trackToRemove.id}`);
            throw new Error();
        }
    };

    const publisher = createPublisher();
    const tracks: ITrack[] = [];
    const arrangement: IArrangement = {
        timeParams, tracks, addTrack, removeTrack,
        get title() {
            return title ?? "Untitled Arrangement";
        },
        set title(newTitle: string) {
            title = newTitle; publisher.publish();
        },
        subscribe: publisher.subscribe,
        unsubscribe: publisher.unsubscribe
    };

    return arrangement;

};
