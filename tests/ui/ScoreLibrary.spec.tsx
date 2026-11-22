/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStorage } from "../../src/core/AppStorage.js";
import type { ScoreBookDataModel, ISbDmInstrument, ISbDmScore } from "../../src/core/ScoreBookDataModel.js";
import { SbDmEntityType } from "../../src/core/ScoreBookDataModel.js";
import { ScoreListSortOrder } from "../../src/core/types/general.js";
import { SystemTagKind, type ITagInfo } from "../../src/core/types/tags.js";
import { ScoreLibrary } from "../../src/ui/ScoreLibrary.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

interface IMockDataModel {
    scores: ISbDmScore[];
    tags: ITagInfo[];
    instruments: ISbDmInstrument[];
    queryScores: ReturnType<typeof vi.fn>;
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
        queryScores: vi.fn().mockResolvedValue(undefined),
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
 * Types a tag name into the selector and commits the completion it names.
 *
 * @param name The tag name to type.
 */
const commitTag = async (name: string): Promise<void> => {
    const input = document.body.querySelector<HTMLInputElement>(".score-library-tag-selector input");
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
        });

        const input = document.body.querySelector<HTMLInputElement>(".score-library-tag-selector input");
        fireEvent.input(input!, { target: { value: "Tamborim" } });
        fireEvent.keyDown(input!, { key: "Enter" });

        expect(model.queryScores).not.toHaveBeenCalled();
    });

    it("keeps the sort choice and shows it in the selector", async () => {
        const model = createMockDataModel([], [createScore(1, "Surdo"), createScore(2, "Caixa")]);

        renderLibrary(model);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListSortOrder button")).toBeTruthy();
        });

        const selector = document.body.querySelector<HTMLButtonElement>("#scoreListSortOrder button")!;
        expect(selector.textContent).toContain("A–Z");

        fireEvent.click(selector);
        fireEvent.click(screen.getByText("Name Z–A"));

        await waitFor(() => {
            expect(AppStorage.loadUISettings()?.scoreListSortOrder).toBe(ScoreListSortOrder.NameDescending);
        });
        expect(selector.textContent).toContain("Z–A");
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
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
            expect(document.body.querySelector(".score-library-tag-selector")).toBeTruthy();
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

    it("closes from its close button", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderResult = render(<ScoreLibrary dataModel={asDataModel(model)} open={true} onClose={onClose} />);

        await waitFor(() => {
            expect(document.body.querySelector("#scoreListClose")).toBeTruthy();
        });

        document.body.querySelector<HTMLButtonElement>("#scoreListClose")!.click();

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
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
});
