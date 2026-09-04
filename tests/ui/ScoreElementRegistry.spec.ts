/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { expect, it } from "vitest";

import { ScoreElementKind, ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";
import { SelectionGranularity } from "../../src/ui/selection-types.js";

it("replaces and clears callback-ref registrations", () => {
    const registry = new ScoreElementRegistry();
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const ref = registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 2,
        trackId: 7,
        step: 4,
        start: { numerator: 1, denominator: 2 },
    });
    const entry = {
        granularity: SelectionGranularity.Note,
        bar: 2,
        trackId: 7,
        startStep: 4,
        endStep: 4,
        start: { numerator: 1, denominator: 2 },
    };

    ref(firstElement);
    expect(registry.findSelectionElements(entry, ScoreElementKind.GridCell)).toEqual([firstElement]);

    ref(secondElement);
    expect(registry.findSelectionElements(entry, ScoreElementKind.GridCell)).toEqual([secondElement]);
    expect(registry.getLocation(firstElement)).toBeUndefined();

    ref(null);
    expect(registry.findSelectionElements(entry, ScoreElementKind.GridCell)).toEqual([]);
});

it("distinguishes tuplet slots that share a step", () => {
    const registry = new ScoreElementRegistry();
    const firstSlot = document.createElement("div");
    const secondSlot = document.createElement("div");

    registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
        start: { numerator: 3, denominator: 8 },
    })(firstSlot);
    registry.createRef({
        kind: ScoreElementKind.GridCell,
        bar: 1,
        trackId: 2,
        step: 3,
        start: { numerator: 5, denominator: 12 },
    })(secondSlot);

    expect(registry.findSelectionElements({
        granularity: SelectionGranularity.Note,
        bar: 1,
        trackId: 2,
        start: { numerator: 5, denominator: 12 },
    })).toEqual([secondSlot]);
});
