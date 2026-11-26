/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IScoreListEntry, ISetListInfo } from "../../src/core/DatabaseTypes.js";
import { ScoreLineupStatus } from "../../src/core/DatabaseTypes.js";
import type { ISbDmPermissionInfo, ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { SetListEditor } from "../../src/ui/SetListEditor.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

const perm: ISbDmPermissionInfo = { isOwner: false, canRead: true, canWrite: false, isWorld: false, groupIds: [] };

const auftritt: ISetListInfo = {
    id: 4, name: "Auftritt", tagId: 40, revision: 1, memberCount: 2, groups: [], ownerId: 3, ownerName: "Owner",
    editable: true, managesAccess: true,
};

/**
 * @param id The score id.
 * @param name The score name.
 *
 * @returns A score entry as the membership loader returns it.
 */
const entry = (id: number, name: string): IScoreListEntry => {
    return {
        id,
        name,
        tagIds: [40],
        lineup: { status: ScoreLineupStatus.Unreadable, tracks: [] },
        meta: { bpm: 120 },
        perm,
    };
};

interface IMockDataModel {
    loadSetListScores: ReturnType<typeof vi.fn>;
    reorderSetList: ReturnType<typeof vi.fn>;
    assignTag: ReturnType<typeof vi.fn>;
    unassignTag: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (): IMockDataModel => {
    return {
        loadSetListScores: vi.fn().mockResolvedValue([entry(7, "Samba"), entry(9, "Bateria")]),
        reorderSetList: vi.fn().mockResolvedValue({ success: true, revision: 2 }),
        assignTag: vi.fn().mockResolvedValue(true),
        unassignTag: vi.fn().mockResolvedValue(true),
    };
};

const asDataModel = (model: IMockDataModel): ScoreBookDataModel => {
    return model as unknown as ScoreBookDataModel;
};

/**
 * @returns The rows of the editor in display order, with the name and the position each one shows.
 */
const rows = (): Array<{ name: string; position: string; }> => {
    return Array.from(document.body.querySelectorAll<HTMLElement>(".set-list-editor-row")).map((row) => {
        return {
            name: row.querySelector<HTMLElement>(".set-list-editor-name")?.textContent ?? "",
            position: row.querySelector<HTMLElement>(".set-list-editor-position")?.textContent ?? "",
        };
    });
};

/**
 * @param title The accessible title of the button.
 *
 * @returns That button, looked up in the document.
 */
const buttonByTitle = (title: string): HTMLElement => {
    const button = document.body.querySelector<HTMLElement>(`button[title="${title}"]`);
    expect(button).toBeTruthy();

    return button!;
};

/** A handler for the callbacks the tests do not exercise. */
const noop = (): void => {
    // The editor is only read in these cases.
};

describe("SetListEditor", { concurrent: false }, () => {
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
     * @param model The mocked model the editor works with.
     * @param onClose What the editor reports when it is done.
     *
     * @returns The rendered editor.
     */
    const renderEditor = (model: IMockDataModel, onClose: () => void = noop): RenderResult => {
        renderResult = render(
            <SetListEditor dataModel={asDataModel(model)} list={auftritt} onMembershipChanged={noop}
                onClose={onClose} />,
        );

        return renderResult;
    };

    it("shows the members of the list in its saved order", async () => {
        renderEditor(createMockDataModel());

        await waitFor(() => {
            expect(rows()).toEqual([
                { name: "Samba", position: "1" },
                { name: "Bateria", position: "2" },
            ]);
        });
    });

    it("reports the read members, which the cards' checkboxes follow", async () => {
        const model = createMockDataModel();
        const onMembershipChanged = vi.fn();

        renderResult = render(
            <SetListEditor dataModel={asDataModel(model)} list={auftritt} onMembershipChanged={onMembershipChanged}
                onClose={noop} />,
        );

        await waitFor(() => {
            expect(onMembershipChanged).toHaveBeenCalledWith(new Set([7, 9]));
        });
    });

    it("moves a row and saves the composed order, which closes the editor", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(buttonByTitle("Move Samba down"));

        await waitFor(() => {
            expect(rows()).toEqual([
                { name: "Bateria", position: "1" },
                { name: "Samba", position: "2" },
            ]);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEditorSave")!);

        await waitFor(() => {
            expect(model.reorderSetList).toHaveBeenCalledWith(4, 1, [9, 7]);
        });
        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
    });

    it("keeps the editor open and names a conflict instead of overwriting a changed list", async () => {
        const model = createMockDataModel();
        model.reorderSetList.mockResolvedValue({ success: false, conflict: true });
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEditorSave")!);

        await waitFor(() => {
            expect(document.body.querySelector(".set-list-editor-conflict")).toBeTruthy();
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("takes a score out of the list by removing its row", async () => {
        const model = createMockDataModel();

        renderEditor(model);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(buttonByTitle("Remove Samba from the list"));

        await waitFor(() => {
            expect(model.unassignTag).toHaveBeenCalledWith(7, 40);
        });
    });

    it("drops the row of a member that left the list and keeps the composed order of the rest", async () => {
        const model = createMockDataModel();

        renderEditor(model);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(buttonByTitle("Move Bateria up"));
        await waitFor(() => {
            expect(rows()[0].name).toBe("Bateria");
        });

        model.loadSetListScores.mockResolvedValue([entry(7, "Samba")]);
        await requisitions.execute("setListsChanged", undefined);

        await waitFor(() => {
            expect(rows()).toEqual([{ name: "Samba", position: "1" }]);
        });
    });
});
