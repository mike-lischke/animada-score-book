/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ISbDmTrackPiece } from "../core/ScoreBookDataModel.js";
import type { IRepeatBar } from "../core/types/general.js";

/** How often a section a repeat barline marks is played, its first pass included. */
const repeatPasses = 2;

/**
 * The most bars a performance may hold, as a multiple of the bars written. Sane repeat marks stay far below it;
 * the limit keeps a pathological nesting from growing the order without bound.
 */
const orderLimitFactor = 16;

/**
 * Resolves which measure supplies the content another measure plays.
 *
 * A one-bar repeat (simile) holds no content of its own: it plays the nearest preceding measure that is not
 * itself a simile, however long the chain is. Every other measure plays its own content. The resolution is a
 * single forward pass, so a score may hold any number of similes without cost.
 *
 * The repeat bar lines a score carries resolve the order its bars are played in (see {@link performedBars}), which
 * is a walk of its own: what a bar sounds is settled by the marks alone, how often and when by the bar lines.
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

    /**
     * Resolves the order the bars of an arrangement are played in.
     *
     * A repeat that only opens begins the section its bar stands at, a repeat that only closes ends it there; both
     * marks on one bar repeat that bar. A repeat that closes without one that opened repeats from the first bar.
     * Sections nest: an inner one is played through however often it is marked before the outer one goes on.
     *
     * @param repeatBars The repeat marks of the arrangement, keyed by 1-based bar number.
     * @param barCount The number of bars the arrangement has.
     * @param playCount How often a marked section is played, its first pass included.
     *
     * @returns The bars in the order they are played, as 1-based bar numbers.
     */
    public static performedBars(repeatBars: ReadonlyMap<number, IRepeatBar>, barCount: number,
        playCount = repeatPasses): number[] {
        const order: number[] = [];
        if (barCount < 1) {
            return order;
        }

        const limit = barCount * orderLimitFactor;
        const sections: Array<{ start: number; remaining: number; }> = [];
        let bar = 1;

        // A bar the walk returns to for another pass keeps the section it already opened: pushing it again would
        // nest the section into itself.
        let resuming = false;

        while (bar <= barCount) {
            if (order.length >= limit) {
                console.warn(`PlaybackOrder: the repeat marks of ${barCount} bars resolve to more than ${limit} bars`);

                break;
            }

            order.push(bar);

            const marks = repeatBars.get(bar);
            if (marks?.start === true && !resuming) {
                sections.push({ start: bar, remaining: playCount });
            }

            resuming = false;

            if (marks?.end === true) {
                if (sections.length === 0) {
                    // A repeat that closes without one that opened repeats from the first bar.
                    sections.push({ start: 1, remaining: playCount });
                }

                const section = sections[sections.length - 1];
                section.remaining--;
                if (section.remaining > 0) {
                    bar = section.start;
                    resuming = true;

                    continue;
                }

                sections.pop();
            }

            bar++;
        }

        return order;
    }
}
