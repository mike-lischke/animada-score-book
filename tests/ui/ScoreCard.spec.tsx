/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ITag, ITagCompletion } from "../../src/components/ui/framework/TagInput.js";
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
     * @param completions The tags the card offers for assignment.
     * @param canEditTags Whether the caller manages tags at all.
     * @param editing Whether the card's tag editing is switched on.
     *
     * @returns The card and the handlers it reports to.
     */
    const renderCard = (score: ISbDmScore, expanded = false, tagChips = userTags,
        completions: ITagCompletion[] = [], canEditTags = true, editing = false): {
        onOpen: ReturnType<typeof vi.fn>;
        onToggleLineup: ReturnType<typeof vi.fn>;
        onAction: ReturnType<typeof vi.fn>;
        onToggleEdit: ReturnType<typeof vi.fn>;
        onTagAdd: ReturnType<typeof vi.fn>;
        onTagRemove: ReturnType<typeof vi.fn>;
        onToggleMembership: ReturnType<typeof vi.fn>;
    } => {
        const onOpen = vi.fn();
        const onToggleLineup = vi.fn();
        const onAction = vi.fn();
        const onToggleEdit = vi.fn();
        const onTagAdd = vi.fn();
        const onTagRemove = vi.fn();
        const onToggleMembership = vi.fn();

        renderResult = render(
            <ScoreCard
                score={score}
                position={1}
                instruments={instruments}
                tagChips={tagChips}
                tagCompletions={completions}
                canEditTags={canEditTags}
                editing={editing}
                expanded={expanded}
                isAdmin={false}
                showPermission={true}
                showMembership={false}
                member={false}
                onOpen={onOpen}
                onToggleLineup={onToggleLineup}
                onAction={onAction}
                onToggleEdit={onToggleEdit}
                onTagAdd={onTagAdd}
                onTagRemove={onTagRemove}
                onToggleMembership={onToggleMembership}
            />,
        );

        return { onOpen, onToggleLineup, onAction, onToggleEdit, onTagAdd, onTagRemove, onToggleMembership };
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

    it("groups its actions without a separate load button", () => {
        renderCard(createScore(twoTracks));

        const buttons = Array.from(renderResult!.container.querySelectorAll<HTMLButtonElement>(".score-card-action"));

        expect(buttons.map((button) => {
            return button.title;
        })).toEqual(["Edit tags", "Copy Score URL", "Group Access", "Remove Score"]);
        expect(buttons[0].textContent).toBe("Edit Tags");
    });

    it("reports the copy, permission and remove actions of the join group", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score);

        const button = (title: string): HTMLButtonElement => {
            return renderResult!.container.querySelector<HTMLButtonElement>(`.score-card-action[title="${title}"]`)!;
        };

        button("Copy Score URL").click();
        button("Group Access").click();
        button("Remove Score").click();

        expect(handlers.onAction.mock.calls).toEqual([
            ["copyUrl", score],
            ["managePerm", score],
            ["remove", score],
        ]);
    });

    it("offers group access only to a score the caller may manage", () => {
        const score = createScore(twoTracks);

        renderCard({ ...score, perm: { ...score.perm!, isOwner: false } });

        const titles = Array.from(renderResult!.container.querySelectorAll<HTMLElement>(".score-card-action"),
            (entry) => {
                return entry.title;
            });

        expect(titles).not.toContain("Group Access");
    });

    it("keeps the ordinal of the card in the list", () => {
        renderCard(createScore(twoTracks));

        expect(renderResult!.container.textContent).toContain("#1");
    });

    it("shows the score metadata as read-only badges above the tags", () => {
        const score = {
            ...createScore(twoTracks),
            meta: { bpm: 110, timeSignature: "4/4", barCount: 24, durationSeconds: 127 },
        };

        renderCard(score);

        const badges = Array.from(renderResult!.container.querySelectorAll(".score-meta-tag"), (entry) => {
            return entry.textContent;
        });

        expect(badges).toEqual(["110 BPM", "4/4", "24 bars", "2:07"]);
        expect(renderResult!.container.querySelector(".score-meta input")).toBeNull();
    });

    it("leaves the metadata row out when the content states no metadata", () => {
        renderCard({ ...createScore(twoTracks), meta: {} });

        expect(renderResult!.container.querySelector(".score-meta")).toBeNull();
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

    it("keeps its tags read-only until the card's edit mode is switched on", () => {
        const score = createScore(twoTracks);

        renderCard(score, false, userTags, [], true, false);

        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-field")).toBeNull();
        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
        expect(renderResult!.container.querySelector(".edit-switch")?.classList.contains("is-active")).toBe(false);
    });

    it("shows the status dot while the card's edit mode is on", () => {
        renderCard(createScore(twoTracks), false, userTags, [], true, true);

        const edit = renderResult!.container.querySelector<HTMLElement>(".edit-switch");

        expect(edit?.classList.contains("is-active")).toBe(true);
        expect(edit?.getAttribute("aria-pressed")).toBe("true");
        expect(edit?.textContent).toBe("Editing");
        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-field")).toBeTruthy();
    });

    it("reports the edit toggle of the card", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score);

        renderResult!.container.querySelector<HTMLButtonElement>(".edit-switch")!.click();

        expect(handlers.onToggleEdit).toHaveBeenCalledWith(score);
    });

    it("offers tag editing only to a caller who manages tags", () => {
        const score = createScore(twoTracks);

        renderCard(score, false, userTags, [], false, true);

        expect(renderResult!.container.querySelector(".edit-switch")).toBeNull();
        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-field")).toBeNull();
        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
    });

    it("reports a tag the caller picks from the completions", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score, false, userTags, [{ caption: "Coco", tagId: 12 }], true, true);

        const input = renderResult!.container.querySelector<HTMLInputElement>(".score-card-tags .tag-input-field");
        expect(input).toBeTruthy();

        fireEvent.input(input!, { target: { value: "Coco" } });
        fireEvent.keyDown(input!, { key: "Enter" });

        expect(handlers.onTagAdd).toHaveBeenCalledWith(score, 12);
    });

    it("reports a tag that is taken off through its close button", () => {
        const score = createScore(twoTracks);
        const handlers = renderCard(score, false, userTags, [], true, true);

        const closeButton = renderResult!.container.querySelector<HTMLButtonElement>(
            ".score-card-tags .tag-input-close-button");
        expect(closeButton).toBeTruthy();

        closeButton!.click();

        expect(handlers.onTagRemove).toHaveBeenCalledWith(score, 11);
    });

    it("keeps a locked tag without a close button", () => {
        renderCard(createScore(twoTracks), false, [{ id: 8, caption: "Demo Score", colorIndex: 1, locked: true }], [],
            true, true);

        expect(renderResult!.container.textContent).toContain("Demo Score");
        expect(renderResult!.container.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
    });

    it("clears its tag entry on Escape instead of letting the key reach the window", () => {
        const score = createScore(twoTracks);
        renderCard(score, false, userTags, [{ caption: "Coco", tagId: 12 }], true, true);

        const input = renderResult!.container.querySelector<HTMLInputElement>(".score-card-tags .tag-input-field");
        expect(input).toBeTruthy();

        fireEvent.input(input!, { target: { value: "Coco" } });

        const windowKeyDown = vi.fn();
        window.addEventListener("keydown", windowKeyDown);
        fireEvent.keyDown(input!, { key: "Escape" });
        window.removeEventListener("keydown", windowKeyDown);

        expect(input!.value).toBe("");
        expect(windowKeyDown).not.toHaveBeenCalled();
    });
});
