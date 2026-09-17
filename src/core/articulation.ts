/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Damping } from "./ScoreBookDataModel.js";
import type { INoteArticulation, ISampleProfile } from "./ScoreBookDataModel.js";
import type { IAudioData } from "./types/general.js";

/** The articulation dimensions offered by the articulation toolbar. */
export enum Articulation {
    Accent,
    Muted,
    Ghost,
}

/**
 * Derives the full per-note articulation from a sample profile. The sample profile is descriptive
 * — it tells which articulation the recorded sample carries — so this is the fallback articulation
 * shown for a note whenever the note event itself has no explicit articulation set.
 *
 * @param sampleProfile The sample profile to convert.
 *
 * @returns The articulation equivalent of the sample profile.
 */
export const articulationFromSampleProfile = (sampleProfile: ISampleProfile): INoteArticulation => {
    return {
        damping: sampleProfile.builtInDamping,
        accent: sampleProfile.builtInAccent,
        ghost: sampleProfile.ghost,
    };
};

/**
 * Resolves the single articulation a note style's sample profile corresponds to.
 *
 * @param noteStyle The note style to inspect.
 *
 * @returns The articulation, or undefined when the style is a plain (open, unaccented, non-ghost) variant.
 */
export const articulationOf = (noteStyle: IAudioData): Articulation | undefined => {
    const { sampleProfile } = noteStyle;

    if (sampleProfile.ghost) {
        return Articulation.Ghost;
    }

    if (sampleProfile.builtInAccent) {
        return Articulation.Accent;
    }

    if (sampleProfile.builtInDamping === Damping.Muted) {
        return Articulation.Muted;
    }

    return undefined;
};

/**
 * Builds a stable key identifying the "voice" of a note style — the sound variant independent of
 * articulation. Variants that differ only in their sample profile (accent, damping, ghost) share
 * the same voice.
 *
 * @param noteStyle The note style to derive the voice from.
 *
 * @returns A string key unique to the style's voice.
 */
export const voiceKey = (noteStyle: IAudioData): string => {
    const { characteristics } = noteStyle;
    const technique = "handTechnique" in characteristics && characteristics.handTechnique !== undefined
        ? `hand:${characteristics.handTechnique}`
        : "stickTechnique" in characteristics && characteristics.stickTechnique !== undefined
            ? `stick:${characteristics.stickTechnique}`
            : "none";
    const displayType = "mainDisplayType" in characteristics ? characteristics.mainDisplayType : "";

    return `${characteristics.excitationMode}|${technique}|${displayType}|${noteStyle.noteLine ?? 0}`;
};

/**
 * Finds the note style of the same voice that matches the requested articulation.
 *
 * @param noteStyles All note styles of an instrument.
 * @param currentStyleId The id of the note style whose voice provides the candidates.
 * @param articulation The requested articulation.
 *
 * @returns The id of the matching note style, or undefined when no variant carries that articulation.
 */
export const resolveNoteStyleForArticulation = (
    noteStyles: Record<string, IAudioData>,
    currentStyleId: string,
    articulation: Articulation,
): string | undefined => {
    const current = Object.values(noteStyles).find((style) => {
        return style.id === currentStyleId;
    });
    if (!current) {
        return undefined;
    }

    const key = voiceKey(current);
    const match = Object.values(noteStyles).find((candidate) => {
        return voiceKey(candidate) === key && articulationOf(candidate) === articulation;
    });

    return match?.id;
};

/**
 * Collects the articulations that are available for the given note style's voice.
 *
 * @param noteStyles All note styles of an instrument.
 * @param currentStyleId The id of the note style whose voice provides the candidates.
 *
 * @returns The set of articulations that have a matching variant, possibly empty.
 */
export const availableArticulations = (
    noteStyles: Record<string, IAudioData>,
    currentStyleId: string,
): Set<Articulation> => {
    const result = new Set<Articulation>();
    const current = Object.values(noteStyles).find((style) => {
        return style.id === currentStyleId;
    });
    if (!current) {
        return result;
    }

    const key = voiceKey(current);
    for (const candidate of Object.values(noteStyles)) {
        if (voiceKey(candidate) !== key) {
            continue;
        }

        const articulation = articulationOf(candidate);
        if (articulation !== undefined) {
            result.add(articulation);
        }
    }

    return result;
};
