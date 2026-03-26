/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useEffect } from "preact/hooks";

import type { ISbDmArrangement, ISbDmTrack } from "../../core/ScoreBookDataModel.js";
import type { Subscription } from "../../core/types/general.js";
import { useSubscription } from "./useSubscription.js";

export function useArrangementAndTracksSubscription(arrangementView: Readonly<ISbDmArrangement>,
    callback: Subscription): void {
    useSubscription(arrangementView, callback);

    useEffect(() => {
        const subscribedTracks = new Set<ISbDmTrack>();

        arrangementView.tracks.forEach((track) => {
            track.subscribe(callback);
            subscribedTracks.add(track);
        });

        const arrangementSubscription = () => {
            subscribedTracks.forEach((track) => {
                if (!arrangementView.tracks.includes(track)) {
                    track.unsubscribe(callback);
                    subscribedTracks.delete(track);
                }
            });

            arrangementView.tracks.forEach((track) => {
                if (!subscribedTracks.has(track)) {
                    track.subscribe(callback);
                    subscribedTracks.add(track);
                }
            });
        };
        arrangementView.subscribe(arrangementSubscription);

        return () => {
            arrangementView.unsubscribe(arrangementSubscription);
            subscribedTracks.forEach((track) => {
                track.unsubscribe(callback);
            });
        };
    });
}
