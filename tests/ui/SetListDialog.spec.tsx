/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IScoreListEntry, ISetListInfo } from "../../src/core/DatabaseTypes.js";
import { ScoreLineupStatus } from "../../src/core/DatabaseTypes.js";
import type {
    IGroupRow, ISbDmPermissionInfo, ScoreBookDataModel,
} from "../../src/core/ScoreBookDataModel.js";
import type { ITagOwnerScope } from "../../src/core/types/tags.js";
import { SetListDialog } from "../../src/ui/SetListDialog.js";

const perm: ISbDmPermissionInfo = { isOwner: false, canRead: true, canWrite: false, isWorld: false, groupIds: [] };

const groups: IGroupRow[] = [
    {
        id: 1, name: "Admins", description: "", colorIndex: 0, adminId: null, hasPassword: false, lastLogin: null,
        createdAt: "",
    },
    {
        id: 2, name: "World", description: "", colorIndex: 1, adminId: null, hasPassword: false, lastLogin: null,
        createdAt: "",
    },
    {
        id: 10, name: "Bateria", description: "", colorIndex: 2, adminId: 3, hasPassword: false, lastLogin: null,
        createdAt: "",
    },
    {
        id: 20, name: "Fremd", description: "", colorIndex: 3, adminId: 4, hasPassword: false, lastLogin: null,
        createdAt: "",
    },
];

const scopes: ITagOwnerScope[] = [{ groupId: 10, name: "Bateria" }, { groupId: 20, name: "Fremd" }];

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
        meta: {},
        perm,
    };
};

interface IMockDataModel {
    listGroups: ReturnType<typeof vi.fn>;
    tagOwnerScopes: ITagOwnerScope[];
    loadSetListScores: ReturnType<typeof vi.fn>;
    listReadableScores: ReturnType<typeof vi.fn>;
    createSetList: ReturnType<typeof vi.fn>;
    renameSetList: ReturnType<typeof vi.fn>;
    deleteSetList: ReturnType<typeof vi.fn>;
    changeSetListAccess: ReturnType<typeof vi.fn>;
    reorderSetList: ReturnType<typeof vi.fn>;
    assignTag: ReturnType<typeof vi.fn>;
    unassignTag: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (): IMockDataModel => {
    return {
        listGroups: vi.fn().mockResolvedValue(groups),
        tagOwnerScopes: scopes,
        loadSetListScores: vi.fn().mockResolvedValue([entry(7, "Samba"), entry(9, "Bateria")]),
        listReadableScores: vi.fn().mockResolvedValue([entry(7, "Samba"), entry(9, "Bateria"), entry(11, "Coco")]),
        createSetList: vi.fn().mockResolvedValue({ success: true, id: 4, revision: 1 }),
        renameSetList: vi.fn().mockResolvedValue({ success: true, revision: 2 }),
        deleteSetList: vi.fn().mockResolvedValue({ success: true }),
        changeSetListAccess: vi.fn().mockResolvedValue({ success: true, revision: 2 }),
        reorderSetList: vi.fn().mockResolvedValue({ success: true, revision: 2 }),
        assignTag: vi.fn().mockResolvedValue(true),
        unassignTag: vi.fn().mockResolvedValue(true),
    };
};

const asDataModel = (model: IMockDataModel): ScoreBookDataModel => {
    return model as unknown as ScoreBookDataModel;
};

const dialogBody = (): HTMLElement => {
    const dialog = document.body.querySelector<HTMLElement>("#setListDialog");
    expect(dialog).toBeTruthy();

    return dialog!;
};

/**
 * @param title The accessible title of the button.
 * @param root The tree to search; the document body by default.
 *
 * @returns The button with that title.
 */
const buttonByTitle = (title: string, root: ParentNode = document.body): HTMLElement => {
    const button = root.querySelector<HTMLElement>(`button[title="${title}"]`);
    expect(button).toBeTruthy();

    return button!;
};

/** A handler for the callbacks the tests do not exercise. */
const noop = (): void => {
    // The dialog is only read in these cases.
};

describe("SetListDialog", { concurrent: false }, () => {
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
     * @param model The mocked model the dialog works with.
     * @param lists The set lists the caller may select.
     * @param onSelect The handler the dialog reports a new selection to.
     *
     * @returns The rendered dialog.
     */
    const renderDialog = (model: IMockDataModel, lists: ISetListInfo[] = [auftritt],
        onSelect: (id?: number) => void = noop): RenderResult => {
        renderResult = render(
            <SetListDialog dataModel={asDataModel(model)} lists={lists} activeId={lists[0]?.id} open={true}
                onClose={noop} onSelect={onSelect} />,
        );

        return renderResult;
    };

    it("creates a list in the chosen tag catalogue", async () => {
        const model = createMockDataModel();
        renderDialog(model, []);

        fireEvent.click(await screen.findByTitle("Create a set list"));
        fireEvent.input(screen.getByLabelText("Set list name"), { target: { value: "Konzert" } });
        fireEvent.change(screen.getByLabelText("Tag catalogue"), { target: { value: "20" } });
        fireEvent.click(screen.getByTitle("Create the set list"));

        await waitFor(() => {
            expect(model.createSetList).toHaveBeenCalledWith("Konzert", 20);
        });
    });

    it("renames the selected list with the revision it read", async () => {
        const model = createMockDataModel();
        renderDialog(model);

        await waitFor(() => {
            expect(buttonByTitle("Rename the set list")).toBeTruthy();
        });
        fireEvent.click(buttonByTitle("Rename the set list"));
        fireEvent.input(screen.getByLabelText("Set list name"), { target: { value: "Konzert" } });
        fireEvent.click(screen.getByTitle("Save the name"));

        await waitFor(() => {
            expect(model.renameSetList).toHaveBeenCalledWith(auftritt.id, auftritt.revision, "Konzert");
        });
    });

    it("deletes the list only after the confirmation names it", async () => {
        const model = createMockDataModel();
        renderDialog(model);

        fireEvent.click(await waitFor(() => {
            return buttonByTitle("Delete the set list");
        }));

        expect(dialogBody().textContent).toContain('Delete "Auftritt"?');
        expect(model.deleteSetList).not.toHaveBeenCalled();

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListDeleteConfirm")!);

        await waitFor(() => {
            expect(model.deleteSetList).toHaveBeenCalledWith(auftritt.id);
        });
    });

    it("saves the order the user moved a member to", async () => {
        const model = createMockDataModel();
        renderDialog(model);

        const up = await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>('button[title="Move Bateria up"]');
            expect(button).toBeTruthy();

            return button!;
        });

        fireEvent.click(up);
        fireEvent.click(screen.getByTitle("Save the order"));

        await waitFor(() => {
            expect(model.reorderSetList).toHaveBeenCalledWith(auftritt.id, auftritt.revision, [9, 7]);
        });
    });

    it("reports a concurrent edit explicitly and reads the list again", async () => {
        const model = createMockDataModel();
        model.reorderSetList.mockResolvedValue({ success: false, conflict: true, error: "conflict" });
        renderDialog(model);

        const up = await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>('button[title="Move Bateria up"]');
            expect(button).toBeTruthy();

            return button!;
        });
        const loadsBefore = model.loadSetListScores.mock.calls.length;

        fireEvent.click(up);
        fireEvent.click(screen.getByTitle("Save the order"));

        await waitFor(() => {
            expect(dialogBody().textContent).toContain("changed in the meantime");
        });
        expect(model.loadSetListScores.mock.calls.length).toBeGreaterThan(loadsBefore);
    });

    it("shows a list the caller may only select as read-only", async () => {
        const model = createMockDataModel();
        const shared = { ...auftritt, editable: false, managesAccess: false };

        renderDialog(model, [shared]);

        await waitFor(() => {
            expect(dialogBody().textContent).toContain("You can select this list but not change it.");
        });
        expect(document.body.querySelector('button[title="Rename the set list"]')).toBeNull();
        expect(document.body.querySelector("button[title='Save the order']")).toBeNull();
    });

    it("names a list that disappears while the dialog is open", async () => {
        const model = createMockDataModel();
        const second: ISetListInfo = { ...auftritt, id: 5, name: "Probe" };
        const result = renderDialog(model, [auftritt, second]);

        fireEvent.click(await waitFor(() => {
            const entry = document.body.querySelector<HTMLElement>("#setListEntry-5");
            expect(entry).toBeTruthy();

            return entry!;
        }));

        result.rerender(
            <SetListDialog dataModel={asDataModel(model)} lists={[auftritt]} activeId={auftritt.id} open={true}
                onClose={noop} onSelect={noop} />,
        );

        await waitFor(() => {
            expect(dialogBody().textContent).toContain("This set list is no longer available.");
        });
    });

    it("grants a group write access, so its members may change the list", async () => {
        const model = createMockDataModel();
        renderDialog(model);

        const select = await screen.findByLabelText("Access for Fremd");
        fireEvent.change(select, { target: { value: "write" } });
        fireEvent.click(screen.getByTitle("Save the group access"));

        await waitFor(() => {
            expect(model.changeSetListAccess)
                .toHaveBeenCalledWith(auftritt.id, auftritt.revision, [{ groupId: 20, writable: true }], []);
        });
        expect(screen.queryByLabelText("Access for World")).toBeNull();
        expect(screen.queryByLabelText("Access for Admins")).toBeNull();
    });
});
