/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import type { ScoreBookDataModel, ISbDmScore } from "../../src/core/ScoreBookDataModel.js";
import { SbDmEntityType } from "../../src/core/ScoreBookDataModel.js";
import { ScoreListSortOrder } from "../../src/core/types/general.js";
import { SystemTagKind, type ITagInfo } from "../../src/core/types/tags.js";
import { ScoreLibrary } from "../../src/ui/ScoreLibrary.js";

interface IMockDataModel {
    scores: ISbDmScore[];
    tags: ITagInfo[];
    queryScores: ReturnType<typeof vi.fn>;
}

const caixaTag: ITagInfo = {
    id: 7, name: "Caixa", colorIndex: 2, editable: false, assignable: true, usageCount: 0,
};

const demoTag: ITagInfo = {
    id: 8, name: "Demo Score", colorIndex: 1, systemKind: SystemTagKind.Demo, editable: false,
    assignable: false, usageCount: 0,
};

const createMockDataModel = (tags: ITagInfo[] = [], scores: ISbDmScore[] = []): IMockDataModel => {
    return {
        scores,
        tags,
        queryScores: vi.fn().mockResolvedValue(undefined),
    };
};

/**
 * @param id The score id.
 * @param name The score name.
 *
 * @returns A score entry as the model hands it to the overview.
 */
const createScore = (id: number, name: string): ISbDmScore => {
    return {
        type: SbDmEntityType.Score,
        id,
        name,
        content: "",
        tagIds: [],
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
 * Types a tag name into the selector and commits the completion it names.
 *
 * @param view The rendered library.
 * @param name The tag name to type.
 */
const commitTag = async (view: RenderResult, name: string): Promise<void> => {
    const input = view.container.querySelector<HTMLInputElement>(".score-library-tag-selector input");
    expect(input).toBeTruthy();

    fireEvent.input(input!, { target: { value: name } });
    fireEvent.keyDown(input!, { key: "Enter" });

    await waitFor(() => {
        expect(input!.value).toBe("");
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

    it("says the library is empty when there are no scores yet", () => {
        const model = createMockDataModel();

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} />);

        expect(renderResult.container.textContent).toContain("The library holds no scores yet.");
    });

    it("queries the model with a tag picked from the completions and names the filtered empty state", async () => {
        const model = createMockDataModel([caixaTag]);

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} />);

        await commitTag(renderResult, "Caixa");

        expect(model.queryScores).toHaveBeenCalledWith({ groups: [[7]] });
        await waitFor(() => {
            expect(renderResult!.container.textContent).toContain("No score matches the selected tags.");
        });
    });

    it("takes a tag off the filter again", async () => {
        const model = createMockDataModel([caixaTag]);

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} />);

        await commitTag(renderResult, "Caixa");

        const closeButton = renderResult.container.querySelector<HTMLButtonElement>(".tag-input-close-button");
        expect(closeButton).toBeTruthy();

        closeButton!.click();

        await waitFor(() => {
            expect(model.queryScores).toHaveBeenLastCalledWith({ groups: [] });
        });
    });

    it("starts a new score with the assignable tags of the active filter", async () => {
        const model = createMockDataModel([caixaTag, demoTag]);
        const onAction = vi.fn().mockResolvedValue(true);

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} onAction={onAction} />);

        await commitTag(renderResult, "Caixa");
        await commitTag(renderResult, "Demo Score");

        const newScoreButton = renderResult.container.querySelector<HTMLButtonElement>("#scoreListNewScore");
        expect(newScoreButton).toBeTruthy();

        newScoreButton!.click();

        await waitFor(() => {
            expect(onAction).toHaveBeenCalledWith("new", undefined, [7]);
        });
    });

    it("offers no new tag creation in the filter", () => {
        const model = createMockDataModel([caixaTag]);

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} />);

        const input = renderResult.container.querySelector<HTMLInputElement>(".score-library-tag-selector input");
        fireEvent.input(input!, { target: { value: "Tamborim" } });
        fireEvent.keyDown(input!, { key: "Enter" });

        expect(model.queryScores).not.toHaveBeenCalled();
    });

    it("keeps the sort choice and shows it in the selector", async () => {
        const model = createMockDataModel([], [createScore(1, "Surdo"), createScore(2, "Caixa")]);

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} />);

        const selector = renderResult.container.querySelector<HTMLButtonElement>("#scoreListSortOrder button")!;
        expect(selector.textContent).toContain("A–Z");

        fireEvent.click(selector);
        fireEvent.click(renderResult.getByText("Name Z–A"));

        await waitFor(() => {
            expect(AppStorage.loadUISettings()?.scoreListSortOrder).toBe(ScoreListSortOrder.NameDescending);
        });
        expect(selector.textContent).toContain("Z–A");
    });
});
