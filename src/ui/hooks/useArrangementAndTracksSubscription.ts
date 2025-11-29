/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useEffect } from "preact/hooks";

import type { IArrangementView, Subscription, ITrackView } from "../../core/index.js";
import { useSubscription } from "./useSubscription.js";

export function useArrangementAndTracksSubscription(arrangement: IArrangementView, callback: Subscription): void {
    useSubscription(arrangement, callback);

    useEffect(() => {
        const subscribedTracks = new Set<ITrackView>();

        arrangement.tracks.forEach((track) => {
            track.subscribe(callback);
            subscribedTracks.add(track);
        });

        const arrangementSubscription = () => {
            subscribedTracks.forEach((track) => {
                if (!arrangement.tracks.includes(track)) {
                    track.unsubscribe(callback);
                    subscribedTracks.delete(track);
                }
            });

            arrangement.tracks.forEach((track) => {
                if (!subscribedTracks.has(track)) {
                    track.subscribe(callback);
                    subscribedTracks.add(track);
                }
            });
        };
        arrangement.subscribe(arrangementSubscription);

        return () => {
            arrangement.unsubscribe(arrangementSubscription);
            subscribedTracks.forEach((track) => {
                track.unsubscribe(callback);
            });
        };
    });
}
