/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrackPiece } from "../core/ScoreBookDataModel.js";

/**
 * Resolves which measure supplies the content another measure plays.
 *
 * A one-bar repeat (simile) holds no content of its own: it plays the nearest preceding measure that is not
 * itself a simile, however long the chain is. Every other measure plays its own content. The resolution is a
 * single forward pass, so a score may hold any number of similes without cost.
 *
 * The repeat structure a score carries (start and end repeat barlines) will resolve the order measures are
 * played in here as well.
 */
export class PlaybackOrder {
    /**
     * @param measures The measures of one track, in measure order.
     *
     * @returns For every measure the measure whose content it plays. A simile with no preceding measure has no
     *          source, which the entry reports as undefined.
     */
    public static sourcesOf(measures: readonly ISbDmTrackPiece[]): Array<ISbDmTrackPiece | undefined> {
        const sources: Array<ISbDmTrackPiece | undefined> = [];
        let lastContent: ISbDmTrackPiece | undefined;

        for (const measure of measures) {
            if (measure.simile === true) {
                sources.push(lastContent);

                continue;
            }

            sources.push(measure);
            lastContent = measure;
        }

        return sources;
    }
}
