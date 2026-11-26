/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Container } from "../components/ui/framework/Container.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import type { IScoreMeta } from "../core/DatabaseTypes.js";

export interface IScoreMetaBadgesProperties extends ICommonUIProperties {
    /** Tempo, meter, bar count and length, as far as the score's content states them. */
    meta?: IScoreMeta;
}

/**
 * The read-only facts about a score as a row of pills. The badges show in the theme accent, so they never read as tag
 * chips the user assigned, and the row is left out entirely when the content states none of the facts.
 */
export class ScoreMetaBadges extends UIComponent<IScoreMetaBadgesProperties> {
    public render(): ComponentChild {
        const { meta } = this.props;

        if (meta === undefined) {
            return undefined;
        }

        const entries: Array<{ key: string; caption: string; }> = [];
        if (meta.bpm !== undefined) {
            entries.push({ key: "bpm", caption: `${meta.bpm} BPM` });
        }

        if (meta.timeSignature !== undefined) {
            entries.push({ key: "meter", caption: meta.timeSignature });
        }

        if (meta.barCount !== undefined) {
            entries.push({ key: "bars", caption: `${meta.barCount} bars` });
        }

        if (meta.durationSeconds !== undefined) {
            entries.push({ key: "length", caption: ScoreMetaBadges.durationCaption(meta.durationSeconds) });
        }

        if (entries.length === 0) {
            return undefined;
        }

        const badges = entries.map((entry) => {
            return <span key={entry.key} className="score-meta-tag">{entry.caption}</span>;
        });

        const className = this.generateFinalClassName(["score-meta"]);

        return (
            <Container className={className} orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                {badges}
            </Container>
        );
    }

    /**
     * @param seconds A duration in seconds.
     *
     * @returns The duration as minutes and seconds, for example `2:07`.
     */
    private static durationCaption(seconds: number): string {
        const total = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(total / 60);
        const rest = total % 60;

        return `${minutes}:${String(rest).padStart(2, "0")}`;
    }
}
