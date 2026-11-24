/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import {
    ScoreBookDataModel, ScoreQueryResult, SbDmEntityType, type ISbDmInstrument, type ISbDmScore,
    type IScoreQueryOutcome,
} from "../../src/core/ScoreBookDataModel.js";
import { ScoreListSortOrder } from "../../src/core/types/general.js";
import { SystemTagKind, type ITagCombination, type ITagInfo } from "../../src/core/types/tags.js";
import { ScoreLibrary } from "../../src/ui/ScoreLibrary.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

/** What a successful score-list query answers, so a test can override it per case. */
const appliedOutcome: IScoreQueryOutcome = { result: ScoreQueryResult.Applied, ignoredTagIds: [] };

interface IMockDataModel {
    scores: ISbDmScore[];
    tags: ITagInfo[];
    instruments: ISbDmInstrument[];
    queryScores: Mock<(combination: ITagCombination) => Promise<IScoreQueryOutcome>>;
    assignTag: ReturnType<typeof vi.fn>;
    unassignTag: ReturnType<typeof vi.fn>;
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
        queryScores: vi.fn<(combination: ITagCombination) => Promise<IScoreQueryOutcome>>()
            .mockResolvedValue(appliedOutcome),
        assignTag: vi.fn().mockResolvedValue(true),
        unassignTag: vi.fn().mockResolvedValue(true),
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

    it("adds a tag to a card through the model", async () => {
        const model = createMockDataModel([competitionTag], [createScore(1, "Surdo")]);

        renderLibrary(model);

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

        await waitFor(() => {
            expect(document.body.querySelector(".score-card-tags .tag-input-close-button")).toBeTruthy();
        });

        document.body.querySelector<HTMLButtonElement>(".score-card-tags .tag-input-close-button")!.click();

        expect(model.unassignTag).toHaveBeenCalledWith(1, competitionTag.id);
    });

    it("offers no instrument tag for assignment", async () => {
        const model = createMockDataModel([instrumentTag, competitionTag], [createScore(1, "Caixa")]);

        renderLibrary(model);

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

    it("shows that the scores are loading while the query runs", async () => {
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

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListLoading")).toBeTruthy();
        });

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
});
