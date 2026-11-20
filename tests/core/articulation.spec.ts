/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    Articulation, articulationOf, availableArticulations, resolveNoteStyleForArticulation,
    resolveRequestedNoteStyle,
} from "../../src/core/articulation.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type NoteCharacteristics,
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData } from "../../src/core/types/general.js";

const makeStyle = (
    id: string,
    builtInAccent: boolean,
    builtInDamping: Damping,
    ghost: boolean,
    characteristics: NoteCharacteristics,
    noteLine?: number,
): IAudioData => {
    return {
        id,
        characteristics,
        noteLine,
        sampleProfile: { builtInDamping, builtInAccent, ghost },
        audioBuffer: null,
    } as unknown as IAudioData;
};

const normalStick = (): NoteCharacteristics => {
    return {
        excitationMode: ExcitationMode.Struck,
        stickTechnique: StickTechnique.Normal,
        mainDisplayType: NoteDisplayType.Oval,
    };
};

const normalStickCross = (): NoteCharacteristics => {
    return {
        excitationMode: ExcitationMode.Struck,
        stickTechnique: StickTechnique.Normal,
        mainDisplayType: NoteDisplayType.Cross,
    };
};

const slapHand = (): NoteCharacteristics => {
    return {
        excitationMode: ExcitationMode.Struck,
        handTechnique: HandTechnique.Slap,
        mainDisplayType: NoteDisplayType.Square,
    };
};

const rimStick = (): NoteCharacteristics => {
    return {
        excitationMode: ExcitationMode.Struck,
        stickTechnique: StickTechnique.Rim,
        mainDisplayType: NoteDisplayType.Cross,
    };
};

describe("articulationOf", () => {
    it("returns undefined for a plain style", () => {
        const style = makeStyle("1", false, Damping.Open, false, normalStick());

        expect(articulationOf(style)).toBeUndefined();
    });

    it("detects accent, muted and ghost variants", () => {
        expect(articulationOf(makeStyle("1", true, Damping.Open, false, normalStick()))).toBe(Articulation.Accent);
        expect(articulationOf(makeStyle("2", false, Damping.Muted, false, normalStick()))).toBe(Articulation.Muted);
        expect(articulationOf(makeStyle("3", false, Damping.Open, true, normalStick()))).toBe(Articulation.Ghost);
    });

    it("prefers ghost over the other dimensions", () => {
        const style = makeStyle("1", true, Damping.Muted, true, normalStick());

        expect(articulationOf(style)).toBe(Articulation.Ghost);
    });
});

describe("resolveNoteStyleForArticulation", () => {
    it("keeps an exact style when the requested style carries no matching variant", () => {
        const accentedCenter = makeStyle("1", true, Damping.Open, false, normalStick());
        const plainEdge = makeStyle("2", false, Damping.Open, false, rimStick());
        const noteStyles: Record<string, IAudioData> = {
            "1": accentedCenter,
            "2": plainEdge,
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "2", Articulation.Accent)).toBeUndefined();
    });

    it("resolves the accented and muted variant of the same voice", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
            "2": makeStyle("2", false, Damping.Muted, false, normalStick()),
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "1", Articulation.Accent)).toBe("1");
        expect(resolveNoteStyleForArticulation(noteStyles, "1", Articulation.Muted)).toBe("2");
        expect(resolveNoteStyleForArticulation(noteStyles, "2", Articulation.Accent)).toBe("1");
    });

    it("returns undefined when the voice has no variant for the requested articulation", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "1", Articulation.Muted)).toBeUndefined();
        expect(resolveNoteStyleForArticulation(noteStyles, "1", Articulation.Ghost)).toBeUndefined();
    });

    it("keeps built-in ghost and muted styles exact", () => {
        const ghostStyle = makeStyle("2", false, Damping.Open, true, normalStick());
        const mutedStyle = makeStyle("3", false, Damping.Muted, false, normalStick());
        const noteStyles: Record<string, IAudioData> = {
            "2": ghostStyle,
            "3": mutedStyle,
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "2", Articulation.Ghost)).toBe("2");
        expect(resolveNoteStyleForArticulation(noteStyles, "3", Articulation.Muted)).toBe("3");
        expect(resolveNoteStyleForArticulation(noteStyles, "2", Articulation.Muted)).toBe("3");
        expect(resolveNoteStyleForArticulation(noteStyles, "3", Articulation.Ghost)).toBe("2");
    });

    it("keeps an always-accented voice (e.g. Repinique Slap) as its own style", () => {
        const noteStyles: Record<string, IAudioData> = {
            "7": makeStyle("7", true, Damping.Open, false, slapHand()),
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "7", Articulation.Accent)).toBe("7");
        expect(resolveNoteStyleForArticulation(noteStyles, "7", Articulation.Muted)).toBeUndefined();
    });

    it("does not cross into a different technique (voice)", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
            "4": makeStyle("4", false, Damping.Open, false, rimStick()),
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "4", Articulation.Accent)).toBeUndefined();
    });

    it("returns undefined for an unknown style id", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
        };

        expect(resolveNoteStyleForArticulation(noteStyles, "nope", Articulation.Accent)).toBeUndefined();
    });
});

describe("resolveRequestedNoteStyle", () => {
    it("preserves an accented style when the requested voice is accented", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
            "2": makeStyle("2", false, Damping.Muted, false, normalStick()),
        };

        expect(resolveRequestedNoteStyle(noteStyles, "1", Articulation.Accent)).toBe("1");
        expect(resolveRequestedNoteStyle(noteStyles, "1", Articulation.Muted)).toBe("2");
    });

    it("keeps always-accented and ghost-only voices exact", () => {
        const noteStyles: Record<string, IAudioData> = {
            "7": makeStyle("7", true, Damping.Open, false, slapHand()),
            "2": makeStyle("2", false, Damping.Open, true, normalStick()),
        };

        expect(resolveRequestedNoteStyle(noteStyles, "7", Articulation.Muted)).toBe("7");
        expect(resolveRequestedNoteStyle(noteStyles, "2", Articulation.Accent)).toBe("2");
    });
});

describe("availableArticulations", () => {
    it("collects accent and muted for a surdo-like voice", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
            "2": makeStyle("2", false, Damping.Muted, false, normalStick()),
        };

        expect(availableArticulations(noteStyles, "1")).toEqual(new Set([Articulation.Accent, Articulation.Muted]));
    });

    it("collects accent and ghost for a tamborim-like voice", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStickCross()),
            "2": makeStyle("2", false, Damping.Open, true, normalStickCross()),
        };

        expect(availableArticulations(noteStyles, "1")).toEqual(new Set([Articulation.Accent, Articulation.Ghost]));
    });

    it("returns only accent for an always-accented voice", () => {
        const noteStyles: Record<string, IAudioData> = {
            "7": makeStyle("7", true, Damping.Open, false, slapHand()),
        };

        expect(availableArticulations(noteStyles, "7")).toEqual(new Set([Articulation.Accent]));
    });

    it("returns an empty set for an unknown style id", () => {
        const noteStyles: Record<string, IAudioData> = {
            "1": makeStyle("1", true, Damping.Open, false, normalStick()),
        };

        expect(availableArticulations(noteStyles, "nope")).toEqual(new Set());
    });
});
