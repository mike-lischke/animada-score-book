/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import type { IScoreListEntry, ISetListInfo } from "../../src/core/DatabaseTypes.js";
import { ScoreLineupStatus } from "../../src/core/DatabaseTypes.js";
import {
    ScoreBookDataModel, ScoreQueryResult, SbDmEntityType, type ISbDmInstrument, type ISbDmScore,
    type IScoreQueryOutcome,
} from "../../src/core/ScoreBookDataModel.js";
import { ScoreListSortOrder } from "../../src/core/types/general.js";
import { SystemTagKind, type ITagCombination, type ITagInfo, type ITagOwnerScope } from "../../src/core/types/tags.js";
import { ScoreLibrary } from "../../src/ui/ScoreLibrary.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

/** What a successful score-list query answers, so a test can override it per case. */
const appliedOutcome: IScoreQueryOutcome = { result: ScoreQueryResult.Applied, ignoredTagIds: [] };

interface IMockDataModel {
    scores: ISbDmScore[];
    tags: ITagInfo[];
    instruments: ISbDmInstrument[];
    setLists: ISetListInfo[];
    readableScoreCount: number;
    tagOwnerScopes: ITagOwnerScope[];
    canCreateSetLists: boolean;
    queryScores: Mock<(combination: ITagCombination, setListId?: number) => Promise<IScoreQueryOutcome>>;
    assignTag: ReturnType<typeof vi.fn>;
    unassignTag: ReturnType<typeof vi.fn>;
    loadSetListScores: ReturnType<typeof vi.fn>;
    createSetList: ReturnType<typeof vi.fn>;
    listShareGroups: ReturnType<typeof vi.fn>;
}

const caixaTag: ITagInfo = {
    id: 7, name: "Caixa", colorIndex: 2, editable: true, assignable: true, usageCount: 0,
};

const instrumentTag: ITagInfo = {
    id: 9, name: "Surdo", colorIndex: 2, systemKind: SystemTagKind.Instrument, editable: true,
    assignable: true, usageCount: 0,
};

const competitionTag: ITagInfo = {
    id: 10, name: "Wettkampf", colorIndex: 4, groupId: 10, groupName: "Bateria", editable: true,
    assignable: true, usageCount: 0,
};

const demoTag: ITagInfo = {
    id: 8, name: "Demo Score", colorIndex: 1, systemKind: SystemTagKind.Demo, editable: false,
    assignable: false, usageCount: 0,
};

const createMockDataModel = (tags: ITagInfo[] = [], scores: ISbDmScore[] = []): IMockDataModel => {
    return {
        scores,
        tags,
        instruments: [],
        setLists: [],
        readableScoreCount: scores.length,
        tagOwnerScopes: [{ name: "Bateria", groupId: 10 }],
        canCreateSetLists: true,
        queryScores: vi.fn<(combination: ITagCombination, setListId?: number) => Promise<IScoreQueryOutcome>>()
            .mockResolvedValue(appliedOutcome),
        assignTag: vi.fn().mockResolvedValue(true),
        unassignTag: vi.fn().mockResolvedValue(true),
        loadSetListScores: vi.fn().mockResolvedValue([]),
        createSetList: vi.fn().mockResolvedValue({ success: true, id: 4, revision: 1 }),
        listShareGroups: vi.fn().mockResolvedValue([{ id: 10, name: "Bateria" }]),
    };
};

/**
 * @param id The score id.
 * @param name The score name.
 * @param tagIds The tags of the score.
 *
 * @returns A score entry as the model hands it to the overview.
 */
const createScore = (id: number, name: string, tagIds: number[] = []): ISbDmScore => {
    return {
        type: SbDmEntityType.Score,
        id,
        name,
        content: "",
        tagIds,
        state: { initialized: true, expanded: true, expandedOnce: true, isLeaf: true },
    };
};

/**
 * @param id The list id.
 * @param name The list name.
 * @param memberCount How many members the caller may read.
 * @param editable Whether the caller may change the list, which also lets them manage its access.
 *
 * @returns A set list as the selector receives it.
 */
const createSetList = (id: number, name: string, memberCount: number, editable = true): ISetListInfo => {
    return {
        id, name, tagId: 40 + id, revision: 1, memberCount, groups: [], editable, managesAccess: editable,
    };
};

/**
 * @param id The score id.
 * @param name The score name.
 *
 * @returns A score entry as the set-list membership loader returns it.
 */
const createMember = (id: number, name: string): IScoreListEntry => {
    return {
        id,
        name,
        tagIds: [44],
        lineup: { status: ScoreLineupStatus.Unreadable, tracks: [] },
        meta: {},
        perm: { isOwner: false, canRead: true, canWrite: false, isWorld: false, groupIds: [] },
    };
};

/**
 * @param model The mocked model the library works with.
 *
 * @returns The model as the property type the library expects.
 */
const asDataModel = (model: IMockDataModel): ScoreBookDataModel => {
    return model as unknown as ScoreBookDataModel;
};

/**
 * @returns The dialog the library renders into, which the portal keeps beside the app content.
 */
const libraryDialog = (): HTMLElement => {
    const dialog = document.body.querySelector<HTMLElement>("#scoreLibraryDialog");
    expect(dialog).toBeTruthy();

    return dialog!;
};

/**
 * @param index The AND group of the filter to look at; 0 is the first row.
 *
 * @returns The tag input of that group.
 */
const filterGroup = (index = 0): HTMLElement => {
    const id = index === 0 ? "#scoreFilterGroup" : `#scoreFilterGroup-${index}`;
    const group = document.body.querySelector<HTMLElement>(id);
    expect(group).toBeTruthy();

    return group!;
};

/**
 * @param index The AND group of the filter to look at.
 *
 * @returns The text field of that group, looked up afresh: adding a chip re-creates the field.
 */
const filterField = (index = 0): HTMLInputElement => {
    const field = filterGroup(index).querySelector<HTMLInputElement>("input");
    expect(field).toBeTruthy();

    return field!;
};

/**
 * Types a tag name into the first group of the filter and commits the completion it names.
 *
 * @param name The tag name to type.
 */
const commitTag = async (name: string): Promise<void> => {
    fireEvent.input(filterField(), { target: { value: name } });
    fireEvent.keyDown(filterField(), { key: "Enter" });

    await waitFor(() => {
        expect(filterField().value).toBe("");
    });
};

/**
 * Switches a card's tag editing on, which is what makes its tag chips editable.
 *
 * @param index The position of the card in the list; the first card by default.
 */
const enterCardEdit = async (index = 0): Promise<void> => {
    const edit = await waitFor(() => {
        const button = document.body.querySelectorAll<HTMLElement>(".edit-switch")[index];
        expect(button).toBeTruthy();

        return button;
    });

    fireEvent.click(edit);

    await waitFor(() => {
        expect(edit.classList.contains("is-active")).toBe(true);
    });
};

describe("ScoreLibrary", { concurrent: false }, () => {
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
     * @param model The mocked model the library works with.
     * @param open Whether the library shows as an open dialog.
     * @param onAction The action handler the library reports its score actions to.
     *
     * @returns The rendered library, whose dialog is open by default.
     */
    const renderLibrary = (model: IMockDataModel, open = true,
        onAction?: (action: string, score?: ISbDmScore, tagIds?: number[]) => Promise<boolean>,
    ): RenderResult => {
        renderResult = render(
            <ScoreLibrary dataModel={asDataModel(model)} open={open} onAction={onAction} />,
        );

        return renderResult;
    };

    it("says the library is empty when there are no scores yet", async () => {
        const model = createMockDataModel();

        renderLibrary(model);

        await waitFor(() => {
            expect(libraryDialog().textContent).toContain("The library holds no scores yet.");
        });
    });

    it("queries the model with a tag picked from the completions and names the filtered empty state", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        expect(model.queryScores).toHaveBeenCalledWith({ groups: [[7]] });
        await waitFor(() => {
            expect(libraryDialog().textContent).toContain("No score matches the selected tags.");
        });
    });

    it("takes a tag off the filter again", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        const closeButton = document.body.querySelector<HTMLButtonElement>(".tag-input-close-button");
        expect(closeButton).toBeTruthy();

        closeButton!.click();

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] });
        });
    });

    it("starts a new score with the assignable tags of the active filter", async () => {
        const model = createMockDataModel([caixaTag, instrumentTag, demoTag]);
        const onAction = vi.fn().mockResolvedValue(true);

        renderLibrary(model, true, onAction);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        await commitTag("Surdo");
        await commitTag("Demo Score");

        const newScoreButton = document.body.querySelector<HTMLButtonElement>("#scoreListNewScore");
        expect(newScoreButton).toBeTruthy();

        newScoreButton!.click();

        await waitFor(() => {
            // The instrument tag follows the tracks the new score starts with, so it is never passed by hand.
            expect(onAction).toHaveBeenCalledWith("new", undefined, [7]);
        });
    });

    it("offers no new tag creation in the filter", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });

        const input = filterField();
        fireEvent.input(input, { target: { value: "Tamborim" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(model.queryScores).not.toHaveBeenCalled();
    });

    it("keeps the sort choice and shows it in the selector", async () => {
        const model = createMockDataModel([], [createScore(1, "Surdo"), createScore(2, "Caixa")]);

        renderLibrary(model);

        const ascending = await screen.findByRole("button", { name: "Name A–Z" });
        const descending = screen.getByRole("button", { name: "Name Z–A" });
        expect(ascending.getAttribute("aria-pressed")).toBe("true");
        expect(descending.getAttribute("aria-pressed")).toBe("false");

        fireEvent.click(descending);

        await waitFor(() => {
            expect(AppStorage.loadUISettings()?.scoreListSortOrder).toBe(ScoreListSortOrder.NameDescending);
            expect(ascending.getAttribute("aria-pressed")).toBe("false");
            expect(descending.getAttribute("aria-pressed")).toBe("true");
        });
    });

    it("shows the library only while it is open", async () => {
        const model = createMockDataModel();

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreLibraryDialog")).toBeTruthy();
        });

        renderResult!.rerender(
            <ScoreLibrary dataModel={asDataModel(model)} open={false} />,
        );

        await waitFor(() => {
            expect(document.body.querySelector("#scoreLibraryDialog")).toBeNull();
        });
    });

    it("keeps the tag filter while the library is closed", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        expect(model.queryScores).toHaveBeenCalledTimes(1);

        renderResult!.rerender(
            <ScoreLibrary dataModel={asDataModel(model)} open={false} />,
        );
        await waitFor(() => {
            expect(document.body.querySelector("#scoreLibraryDialog")).toBeNull();
        });

        renderResult!.rerender(
            <ScoreLibrary dataModel={asDataModel(model)} open={true} />,
        );

        await waitFor(() => {
            expect(libraryDialog().textContent).toContain("Caixa");
        });
        expect(model.queryScores).toHaveBeenCalledTimes(1);
    });

    it("keeps an open lineup open when the list changes", async () => {
        const surdo = createScore(1, "Surdo");
        const model = createMockDataModel([], [surdo, createScore(2, "Caixa")]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(2);
        });

        document.body.querySelector<HTMLButtonElement>(".score-card .score-card-lineup-toggle")!.click();
        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card-lineup")).toHaveLength(1);
        });

        await requisitions.execute("scoreEntryUpdated", surdo);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card-lineup")).toHaveLength(1);
        });
    });

    it("keeps instrument tags out of the card chips", async () => {
        const model = createMockDataModel([instrumentTag, competitionTag],
            [createScore(1, "Surdo", [instrumentTag.id, competitionTag.id])]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);
        });

        const chips = document.body.querySelector(".score-card-tags");
        expect(chips?.textContent).toContain("Wettkampf");
        expect(chips?.textContent).not.toContain("Surdo");
    });

    it("keeps the card tags read-only until the card's edit mode is switched on", async () => {
        const model = createMockDataModel([competitionTag], [createScore(1, "Samba", [competitionTag.id])]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);
        });

        expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeNull();
        expect(document.body.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
        expect(document.body.querySelector(".edit-switch")?.classList.contains("is-active")).toBe(false);

        await enterCardEdit();

        expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeTruthy();
    });

    it("moves the edit mode to another card", async () => {
        const model = createMockDataModel([competitionTag],
            [createScore(1, "Samba"), createScore(2, "Bateria")]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".edit-switch")).toHaveLength(2);
        });

        await enterCardEdit(0);
        await enterCardEdit(1);

        const buttons = Array.from(document.body.querySelectorAll<HTMLElement>(".edit-switch"));

        expect(buttons[0].classList.contains("is-active")).toBe(false);
        expect(buttons[1].classList.contains("is-active")).toBe(true);
    });

    it("adds a tag to a card through the model", async () => {
        const model = createMockDataModel([competitionTag], [createScore(1, "Surdo")]);

        renderLibrary(model);

        await enterCardEdit();

        await waitFor(() => {
            expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeTruthy();
        });

        const input = document.body.querySelector<HTMLInputElement>(".score-card-tags .tag-input-field")!;
        fireEvent.input(input, { target: { value: "Wett" } });
        expect(document.body.querySelectorAll(".score-card-tags .tag-input-completion")).toHaveLength(1);

        fireEvent.input(input, { target: { value: "Wettkampf" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(model.assignTag).toHaveBeenCalledWith(1, competitionTag.id);
    });

    it("takes a tag off a card through the model", async () => {
        const model = createMockDataModel([competitionTag], [createScore(1, "Surdo", [competitionTag.id])]);

        renderLibrary(model);

        await enterCardEdit();

        await waitFor(() => {
            expect(document.body.querySelector(".score-card-tags .tag-input-close-button")).toBeTruthy();
        });

        document.body.querySelector<HTMLButtonElement>(".score-card-tags .tag-input-close-button")!.click();

        expect(model.unassignTag).toHaveBeenCalledWith(1, competitionTag.id);
    });

    it("offers no instrument tag for assignment", async () => {
        const model = createMockDataModel([instrumentTag, competitionTag], [createScore(1, "Caixa")]);

        renderLibrary(model);

        await enterCardEdit();

        await waitFor(() => {
            expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeTruthy();
        });

        const input = document.body.querySelector<HTMLInputElement>(".score-card-tags .tag-input-field")!;
        fireEvent.input(input, { target: { value: "Surdo" } });

        expect(document.body.querySelectorAll(".score-card-tags .tag-input-completion")).toHaveLength(0);
    });

    it("keeps a tag of a scope the account does not manage locked", async () => {
        const model = createMockDataModel([demoTag, competitionTag], [createScore(1, "Samba", [demoTag.id])]);

        renderLibrary(model);

        await enterCardEdit();

        await waitFor(() => {
            expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeTruthy();
        });

        expect(document.body.querySelector(".score-card-tags")?.textContent).toContain("Demo Score");
        expect(document.body.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
    });

    it("keeps the card read-only when the account manages no tag", async () => {
        const model = createMockDataModel([demoTag], [createScore(1, "Samba", [demoTag.id])]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);
        });

        expect(document.body.querySelector(".score-card-tags .tag-input-field")).toBeNull();
        expect(document.body.querySelector(".score-card-tags .tag-input-close-button")).toBeNull();
    });

    it("queries the current filter again after a tag change", async () => {
        const model = createMockDataModel([caixaTag], [createScore(1, "Surdo")]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        expect(model.queryScores).toHaveBeenCalledTimes(1);

        await requisitions.execute("scoreTagsChanged", 1);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenCalledTimes(2);
        });
        expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [[caixaTag.id]] });
    });

    it("queries the list again when another account takes over", async () => {
        const model = createMockDataModel([caixaTag], [createScore(1, "Surdo")]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);
        });

        await requisitions.execute("authChanged", undefined);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenCalledTimes(1);
        });
        expect(model.queryScores).toHaveBeenCalledWith({ groups: [] });
    });

    it("closes on Escape and reports the close", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} open={true} onClose={onClose} />);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreLibraryDialog")).toBeTruthy();
        });

        fireEvent.keyDown(window, { key: "Escape" });

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
        expect(document.body.querySelector("#scoreLibraryDialog")).toBeNull();
    });

    it("moves the focus into the dialog and gives it back to the trigger", async () => {
        const model = createMockDataModel();
        const trigger = document.createElement("button");
        document.body.appendChild(trigger);
        trigger.focus();

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} open={true} />);

        await waitFor(() => {
            expect(libraryDialog().contains(document.activeElement)).toBe(true);
        });

        renderResult.rerender(<ScoreLibrary dataModel={asDataModel(model)} open={false} />);

        await waitFor(() => {
            expect(document.activeElement).toBe(trigger);
        });

        trigger.remove();
    });

    it("keeps a second AND group as an alternative instead of merging the conditions", async () => {
        const model = createMockDataModel([caixaTag, competitionTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        // Every row offers the button that appends a row below it.
        document.body.querySelector<HTMLButtonElement>(".score-filter-group-add")!.click();

        await waitFor(() => {
            filterGroup(1);
        });

        fireEvent.input(filterField(1), { target: { value: "Wettkampf" } });
        fireEvent.keyDown(filterField(1), { key: "Enter" });

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({
                groups: [[caixaTag.id], [competitionTag.id]],
            });
        });
    });

    it("drops a condition together with its group", async () => {
        const model = createMockDataModel([caixaTag, competitionTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        document.body.querySelector<HTMLButtonElement>(".score-filter-group-add")!.click();
        await waitFor(() => {
            filterGroup(1);
        });
        fireEvent.input(filterField(1), { target: { value: "Wettkampf" } });
        fireEvent.keyDown(filterField(1), { key: "Enter" });
        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-filter-group-remove")).toHaveLength(2);
        });

        // The second row is the alternative that was just added, so it is the one to take away.
        document.body.querySelectorAll<HTMLButtonElement>(".score-filter-group-remove")[1].click();

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [[caixaTag.id]] });
        });
        expect(document.body.querySelector("#scoreFilterGroup-1")).toBeNull();
    });

    it("keeps the last row instead of removing it", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        const remove = document.body.querySelector<HTMLButtonElement>(".score-filter-group-remove");
        expect(remove?.hasAttribute("disabled")).toBe(true);
    });

    it("resets the whole filter", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        const reset = document.body.querySelector<HTMLButtonElement>("#scoreFilterReset");
        expect(reset).toBeTruthy();
        reset!.click();

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] });
        });
        expect(document.body.querySelector(".score-filter-tags .tag-input-tag")).toBeNull();
        expect(document.body.querySelector("#scoreFilterReset")).toBeNull();
    });

    it("counts the scores the caller can see and shows the active filter as a chip", async () => {
        const model = createMockDataModel([caixaTag], [createScore(1, "Surdo"), createScore(2, "Caixa")]);

        // The backend narrows the list, which the mock shows by leaving only one score behind.
        model.queryScores.mockImplementation(() => {
            model.scores = [createScore(1, "Surdo")];

            return Promise.resolve(appliedOutcome);
        });

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("2 scores");
        });

        await commitTag("Caixa");

        await waitFor(() => {
            expect(document.body.querySelector("#scoreFilterGroup .tag-input-tag")?.textContent).toContain("Caixa");
        });
        await waitFor(() => {
            expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("1 score");
        });
    });

    it("names a single score in the singular", async () => {
        const model = createMockDataModel([], [createScore(1, "Surdo")]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("1 score");
        });
    });

    it("shows that the scores are loading only while the query takes noticeably long", async () => {
        const model = createMockDataModel([caixaTag], [createScore(1, "Surdo")]);
        const pending: Array<(outcome: IScoreQueryOutcome) => void> = [];
        model.queryScores.mockImplementation(() => {
            return new Promise((resolve) => {
                pending.push(resolve);
            });
        });

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);
        });
        await commitTag("Caixa");

        // A quick answer must not flash the spinner, so the list keeps what it has and its count.
        expect(document.body.querySelector("#scoreListLoading")).toBeNull();
        expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("1 score");
        expect(document.body.querySelectorAll(".score-card")).toHaveLength(1);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListLoading")).toBeTruthy();
        });
        expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("Loading…");

        pending[0](appliedOutcome);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListLoading")).toBeNull();
        });
    });

    it("reports a failed request and offers to try again", async () => {
        const model = createMockDataModel();
        model.queryScores.mockResolvedValue({ result: ScoreQueryResult.Failed, ignoredTagIds: [] });

        renderLibrary(model);

        // The library follows the session, which is when it asks the backend for the list.
        await requisitions.execute("authChanged", undefined);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListFailed")).toBeTruthy();
        });
        // A failed request has no count to name, and the list explains what happened instead.
        expect(document.body.querySelector(".score-filter-count")).toBeNull();

        model.queryScores.mockResolvedValue(appliedOutcome);
        document.body.querySelector<HTMLButtonElement>("#scoreListRetry")!.click();

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListFailed")).toBeNull();
        });
    });

    it("reports a tag the catalogue no longer holds instead of querying a wider list", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        expect(model.queryScores).toHaveBeenCalledTimes(1);

        // The tag is deleted: it leaves the catalogue while the filter still names it.
        model.tags = [];
        await requisitions.execute("tagsChanged", undefined);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListInvalidFilter")).toBeTruthy();
        });
        expect(document.body.querySelector("#scoreListInvalidFilter")?.textContent).toContain("#7");
        expect(model.queryScores).toHaveBeenCalledTimes(1);
        expect(document.body.querySelectorAll(".score-card")).toHaveLength(0);
    });

    it("clears an unavailable-tag report while the corrected filter is queried", async () => {
        const model = createMockDataModel([caixaTag]);

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        // The tag disappears and comes back: the filter is reported, then queried again.
        model.tags = [];
        await requisitions.execute("tagsChanged", undefined);
        await waitFor(() => {
            expect(document.body.querySelector("#scoreListInvalidFilter")).toBeTruthy();
        });

        const pending: Array<(outcome: IScoreQueryOutcome) => void> = [];
        model.queryScores.mockImplementation(() => {
            return new Promise((resolve) => {
                pending.push(resolve);
            });
        });
        model.tags = [caixaTag];
        model.scores = [createScore(1, "Surdo")];
        await requisitions.execute("tagsChanged", undefined);

        // The stale report is gone right away; the list keeps what it had while the answer is on its way.
        expect(document.body.querySelector("#scoreListInvalidFilter")).toBeNull();
        expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("0 scores");

        pending[0](appliedOutcome);
        await waitFor(() => {
            expect(document.body.querySelector(".score-filter-count")?.textContent).toBe("1 score");
        });
        expect(document.body.querySelector("#scoreListInvalidFilter")).toBeNull();
    });

    it("reports the tags the backend refuses instead of showing its wider answer", async () => {
        const model = createMockDataModel([caixaTag]);
        model.queryScores.mockResolvedValue({
            result: ScoreQueryResult.InvalidFilter,
            ignoredTagIds: [caixaTag.id],
        });

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListInvalidFilter")).toBeTruthy();
        });
        expect(document.body.querySelector("#scoreListInvalidFilter")?.textContent).toContain("Caixa");
    });

    it("keeps the result of the newer filter when an older answer arrives after it", async () => {
        const model = createMockDataModel([caixaTag, competitionTag]);
        const pending: Array<(outcome: IScoreQueryOutcome) => void> = [];
        model.queryScores.mockImplementation(() => {
            return new Promise((resolve) => {
                pending.push(resolve);
            });
        });

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");
        await commitTag("Wettkampf");
        expect(pending).toHaveLength(2);

        // The newer filter fails, and the older answer that arrives afterwards must not hide that.
        pending[1]({ result: ScoreQueryResult.Failed, ignoredTagIds: [] });
        await waitFor(() => {
            expect(document.body.querySelector("#scoreListFailed")).toBeTruthy();
        });

        pending[0](appliedOutcome);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(document.body.querySelector("#scoreListFailed")).toBeTruthy();
    });

    it("keeps a filter that names an unavailable tag when an older answer arrives", async () => {
        const model = createMockDataModel([caixaTag]);
        const pending: Array<(outcome: IScoreQueryOutcome) => void> = [];
        model.queryScores.mockImplementation(() => {
            return new Promise((resolve) => {
                pending.push(resolve);
            });
        });

        renderLibrary(model);

        await waitFor(() => {
            filterGroup();
        });
        await commitTag("Caixa");

        // The tag is deleted while the answer to the filter that names it is still on its way.
        model.tags = [];
        await requisitions.execute("tagsChanged", undefined);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListInvalidFilter")).toBeTruthy();
        });

        pending[0](appliedOutcome);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(document.body.querySelector("#scoreListInvalidFilter")).toBeTruthy();
        expect(document.body.querySelectorAll(".score-card")).toHaveLength(0);
    });

    it("shows All Scores first and one pill per set list with its readable count", async () => {
        const model = createMockDataModel([], [createScore(1, "Samba")]);
        model.readableScoreCount = 12;
        model.setLists = [
            createSetList(4, "Auftritt", 3),
            createSetList(5, "Probe", 1, false),
        ];

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelectorAll(".set-list-pill")).toHaveLength(3);
        });

        const pills = Array.from(document.body.querySelectorAll<HTMLElement>(".set-list-pill"));
        expect(pills.map((pill) => {
            return pill.textContent;
        })).toEqual(["All Scores12", "Auftritt3", "Probe1"]);
        expect(pills[0].getAttribute("aria-selected")).toBe("true");
        expect(pills[1].getAttribute("aria-selected")).toBe("false");
    });

    it("queries the selected set list together with the manual filter", async () => {
        const model = createMockDataModel([caixaTag], [createScore(1, "Samba", [caixaTag.id])]);
        model.setLists = [
            createSetList(4, "Auftritt", 1),
        ];

        renderLibrary(model);
        await commitTag("Caixa");
        await waitFor(() => {
            expect(model.queryScores).toHaveBeenCalledTimes(1);
        });

        const pill = document.body.querySelector<HTMLElement>("#set-list-tab-4");
        expect(pill).toBeTruthy();
        fireEvent.click(pill!);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [[caixaTag.id]] }, 4);
        });

        // The sort selector stays in the toolbar, so the row never changes shape.
        expect(document.body.querySelector("#scoreListSortOrder")).toBeTruthy();
        expect(document.body.textContent).not.toContain("saved order of the set list");

        fireEvent.click(document.body.querySelector<HTMLElement>("#set-list-tab-all")!);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [[caixaTag.id]] });
        });
    });

    it("switches pills with the arrow keys like a tab view", async () => {
        const model = createMockDataModel();
        model.setLists = [
            createSetList(4, "Auftritt", 0),
            createSetList(5, "Probe", 0),
        ];

        renderLibrary(model);
        const row = await waitFor(() => {
            const tabs = document.body.querySelector<HTMLElement>(".set-list-tabs");
            expect(tabs).toBeTruthy();

            return tabs!;
        });

        fireEvent.keyDown(row, { key: "End" });

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] }, 5);
        });
        expect(document.body.querySelector("#set-list-tab-5")?.getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(row, { key: "ArrowLeft" });

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] }, 4);
        });
    });

    it("falls back to All Scores and says so when the selected list disappears", async () => {
        const model = createMockDataModel();
        model.setLists = [
            createSetList(4, "Auftritt", 0),
        ];
        model.queryScores.mockImplementation((combination, setListId) => {
            return Promise.resolve(setListId === undefined
                ? appliedOutcome
                : { result: ScoreQueryResult.SetListUnavailable, ignoredTagIds: [] });
        });

        renderLibrary(model);
        fireEvent.click(await waitFor(() => {
            const pill = document.body.querySelector<HTMLElement>("#set-list-tab-4");
            expect(pill).toBeTruthy();

            return pill!;
        }));

        await waitFor(() => {
            expect(document.body.querySelector("#setListNotice")?.textContent)
                .toContain("no longer available");
        });
        expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] });
        expect(document.body.querySelector("#set-list-tab-all")?.getAttribute("aria-selected")).toBe("true");
    });

    it("offers the running-order editor only for a set list the caller may change", async () => {
        const model = createMockDataModel();
        model.setLists = [
            createSetList(4, "Auftritt", 0),
            createSetList(5, "Probe", 0, false),
        ];

        renderLibrary(model);

        fireEvent.click(await waitFor(() => {
            const pill = document.body.querySelector<HTMLElement>("#set-list-tab-4");
            expect(pill).toBeTruthy();

            return pill!;
        }));

        await waitFor(() => {
            expect(document.body.querySelector("#setListsEdit")).toBeTruthy();
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#set-list-tab-5")!);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] }, 5);
        });
        expect(document.body.querySelector("#setListsEdit")).toBeNull();
    });

    it("shows every readable score while the editor is open, with a tick for each member", async () => {
        const model = createMockDataModel([], [createScore(1, "Samba"), createScore(2, "Bateria")]);
        model.setLists = [
            createSetList(4, "Auftritt", 1),
        ];
        model.loadSetListScores.mockResolvedValue([createMember(1, "Samba")]);

        renderLibrary(model);

        fireEvent.click(await waitFor(() => {
            const pill = document.body.querySelector<HTMLElement>("#set-list-tab-4");
            expect(pill).toBeTruthy();

            return pill!;
        }));
        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] }, 4);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListsEdit")!);

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] });
        });
        await waitFor(() => {
            expect(document.body.querySelector<HTMLInputElement>("#score-card-member-1")?.checked).toBe(true);
        });
        expect(document.body.querySelector<HTMLInputElement>("#score-card-member-2")?.checked).toBe(false);
    });

    it("puts a ticked score into the edited set list and takes it out again", async () => {
        const model = createMockDataModel([], [createScore(1, "Samba"), createScore(2, "Bateria")]);
        model.setLists = [
            createSetList(4, "Auftritt", 1),
        ];
        model.loadSetListScores.mockResolvedValue([createMember(1, "Samba")]);

        renderLibrary(model);

        fireEvent.click(await waitFor(() => {
            const pill = document.body.querySelector<HTMLElement>("#set-list-tab-4");
            expect(pill).toBeTruthy();

            return pill!;
        }));
        fireEvent.click(await waitFor(() => {
            const edit = document.body.querySelector<HTMLElement>("#setListsEdit");
            expect(edit).toBeTruthy();

            return edit!;
        }));

        fireEvent.click(await waitFor(() => {
            const box = document.body.querySelector<HTMLInputElement>("#score-card-member-2");
            expect(box).toBeTruthy();

            return box!;
        }));

        await waitFor(() => {
            expect(model.assignTag).toHaveBeenCalledWith(2, 44);
        });

        fireEvent.click(document.body.querySelector<HTMLInputElement>("#score-card-member-1")!);

        await waitFor(() => {
            expect(model.unassignTag).toHaveBeenCalledWith(1, 44);
        });
    });
});
