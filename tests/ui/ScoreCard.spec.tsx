/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ITag } from "../../src/components/ui/framework/TagInput.js";
import { ScoreLineupStatus, type IScoreLineup } from "../../src/core/DatabaseTypes.js";
import {
    InstrumentRole, SbDmEntityType, type ISbDmInstrument, type ISbDmScore,
} from "../../src/core/ScoreBookDataModel.js";
import { ScoreCard } from "../../src/ui/ScoreCard.js";
import { createInstrument } from "../unit-test-helpers.js";

const caixa: ISbDmInstrument = {
    ...createInstrument("5", 5),
    displayName: "Caixa",
    color: "hsl(0, 100%, 50%)",
    role: InstrumentRole.Carpet,
    image: { type: SbDmEntityType.InstrumentImage, id: 105, filePath: "caixa.svg" },
};

const surdo: ISbDmInstrument = {
    ...createInstrument("7", 7),
    displayName: "Surdo Terceira",
    color: "hsl(120, 100%, 50%)",
    role: InstrumentRole.GroundRhythm,
};

const instruments: ISbDmInstrument[] = [caixa, surdo];

/**
 * @param lineup The lineup the score carries.
 * @param tagIds The tags of the score.
 *
 * @returns A score entry as the collection hands it to a card.
 */
const createScore = (lineup?: IScoreLineup, tagIds: number[] = []): ISbDmScore => {
    return {
        type: SbDmEntityType.Score,
        id: 42,
        name: "Samba Enredo",
        content: "",
        tagIds,
        lineup,
        perm: { isOwner: true, canRead: true, canWrite: true, isWorld: false, groupIds: [] },
        state: { initialized: true, isLeaf: true, expanded: true, expandedOnce: true },
    };
};

const twoTracks: IScoreLineup = {
    status: ScoreLineupStatus.Ok,
    tracks: [
        { trackId: 1, instrumentTypeId: "5" },
        { trackId: 2, instrumentTypeId: "5" },
        { trackId: 3, instrumentTypeId: "7" },
    ],
};

const userTags: ITag[] = [{ id: 11, caption: "Wettkampf", colorIndex: 1 }];

describe("ScoreCard", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    /**
     * @param score The score the card shows.
     * @param expanded Whether the lineup starts open.
     * @param tagChips The chips the card shows.
     *
     * @returns The card and the handlers it reports to.
     */
    const renderCard = (score: ISbDmScore, expanded = false, tagChips = userTags): {
        onOpen: ReturnType<typeof vi.fn>;
        onToggleLineup: ReturnType<typeof vi.fn>;
        onAction: ReturnType<typeof vi.fn>;
    } => {
        const onOpen = vi.fn();
        const onToggleLineup = vi.fn();
        const onAction = vi.fn();

        renderResult = render(
            <ScoreCard
                score={score}
                position={1}
                instruments={instruments}
                tagChips={tagChips}
                expanded={expanded}
                isAdmin={false}
                showPermission={true}
                onOpen={onOpen}
                onToggleLineup={onToggleLineup}
                onAction={onAction}
            />,
        );

        return { onOpen, onToggleLineup, onAction };
    };

    it("keeps the lineup closed until it is opened", () => {
        const score = createScore(twoTracks);

        renderCard(score);

        const toggle = renderResult!.container.querySelector<HTMLButtonElement>(".score-card-lineup-toggle");

        expect(toggle).toBeTruthy();
        expect(toggle!.getAttribute("aria-expanded")).toBe("false");
        expect(renderResult!.container.querySelector("#score-card-lineup-42")).toBeNull();
        expect(renderResult!.container.textContent).toContain("Lineup (3 voices)");
    });

    it("shows every track of the lineup, including two of one instrument", () => {
        const score = createScore(twoTracks);

        renderCard(score, true);

        const rows = renderResult!.container.querySelectorAll(".score-card-track");
        const names = Array.from(rows, (row) => {
            return row.textContent;
        });

        expect(names.filter((name) => {
            return name === "Caixa";
        })).toHaveLength(2);
        expect(names).toContain("Surdo Terceira");
    });

    it("groups the lineup by the role of its instruments", () => {
        const score = createScore(twoTracks);

        renderCard(score, true);

        const captions = Array.from(
            renderResult!.container.querySelectorAll(".score-card-role-caption"),
            (caption) => {
                return caption.textContent;
            },
        );

        expect(captions).toEqual(["Surdos & Bass", "Rhythm & Snare"]);
    });

    it("says the lineup is unavailable instead of showing an empty one", () => {
        const score = createScore({ status: ScoreLineupStatus.Unreadable, tracks: [] });

        renderCard(score, true);

        expect(renderResult!.container.querySelectorAll(".score-card-track")).toHaveLength(0);
        expect(renderResult!.container.textContent).toContain("cannot be read");
    });

    it("names a lineup it does not know yet", () => {
        const score = createScore(undefined);

        renderCard(score, true);

        expect(renderResult!.container.textContent).toContain("not known yet");
    });

    it("shows the tags the card was given as chips", () => {
        const score = createScore(twoTracks);

        renderCard(score);

        expect(renderResult!.container.querySelectorAll(".score-card-tags .tag-input-tag")).toHaveLength(1);
        expect(renderResult!.container.textContent).toContain("Wettkampf");
    });

    it("opens the score from its title but not from the lineup toggle", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score);

        renderResult!.container.querySelector<HTMLButtonElement>(".score-card-open")!.click();
        expect(handlers.onOpen).toHaveBeenCalledWith(score);

        renderResult!.container.querySelector<HTMLButtonElement>(".score-card-lineup-toggle")!.click();
        expect(handlers.onToggleLineup).toHaveBeenCalledWith(score);
        expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    });

    it("reports the menu action of the card", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score);

        const item = Array.from(renderResult!.container.querySelectorAll<HTMLElement>(".menu-item")).find((entry) => {
            return entry.textContent === "Load Score";
        });
        expect(item).toBeTruthy();

        item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(handlers.onAction).toHaveBeenCalledWith("load", score);
    });

    it("offers group access only to a score the caller may manage", () => {
        const score = createScore(twoTracks);

        renderCard({ ...score, perm: { ...score.perm!, isOwner: false } });

        const labels = Array.from(renderResult!.container.querySelectorAll<HTMLElement>(".menu-item"), (entry) => {
            return entry.textContent;
        });

        expect(labels).not.toContain("Group Access");
    });

    it("keeps the ordinal of the card in the list", () => {
        renderCard(createScore(twoTracks));

        expect(renderResult!.container.textContent).toContain("#1");
    });

    it("does not open the score when the accordion is clicked through the keyboard", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score);

        const toggle = renderResult!.container.querySelector<HTMLButtonElement>(".score-card-lineup-toggle")!;
        fireEvent.keyDown(toggle, { key: "Enter" });
        fireEvent.click(toggle);

        expect(handlers.onToggleLineup).toHaveBeenCalledTimes(1);
        expect(handlers.onOpen).not.toHaveBeenCalled();
    });
});
