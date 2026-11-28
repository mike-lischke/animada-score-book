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
    saveSetListEntry: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (): IMockDataModel => {
    return {
        loadSetListScores: vi.fn().mockResolvedValue([entry(7, "Samba"), entry(9, "Bateria")]),
        reorderSetList: vi.fn().mockResolvedValue({ success: true, revision: 2 }),
        assignTag: vi.fn().mockResolvedValue(true),
        unassignTag: vi.fn().mockResolvedValue(true),
        saveSetListEntry: vi.fn().mockResolvedValue(true),
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
     * @param closeRequest How many times the collection asked to leave the edit mode.
     *
     * @returns The rendered editor.
     */
    const renderEditor = (model: IMockDataModel, onClose: () => void = noop, closeRequest = 0): RenderResult => {
        renderResult = render(
            <SetListEditor dataModel={asDataModel(model)} list={auftritt} closeRequest={closeRequest}
                onMembershipChanged={noop} onClose={onClose} />,
        );

        return renderResult;
    };

    /**
     * Asks the editor to leave the edit mode, the way the edit switch of the toolbar does.
     *
     * @param model The mocked model the editor works with.
     * @param onClose What the editor reports when it is done.
     */
    const requestClose = (model: IMockDataModel, onClose: () => void): void => {
        renderResult!.rerender(
            <SetListEditor dataModel={asDataModel(model)} list={auftritt} closeRequest={1}
                onMembershipChanged={noop} onClose={onClose} />,
        );
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
            <SetListEditor dataModel={asDataModel(model)} list={auftritt} closeRequest={0}
                onMembershipChanged={onMembershipChanged} onClose={noop} />,
        );

        await waitFor(() => {
            expect(onMembershipChanged).toHaveBeenCalledWith(new Set([7, 9]));
        });
    });

    it("leaves the edit mode straight away when the order was not touched", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        requestClose(model, onClose);

        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
        expect(model.reorderSetList).not.toHaveBeenCalled();
        expect(document.body.querySelector(".set-list-editor-question")).toBeNull();
    });

    it("asks about a composed order and saves it when the edit mode is left", async () => {
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

        requestClose(model, onClose);

        const save = await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>("#setListEditorSave");
            expect(button).toBeTruthy();

            return button!;
        });
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(save);

        await waitFor(() => {
            expect(model.reorderSetList).toHaveBeenCalledWith(4, 1, [9, 7]);
        });
        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
    });

    it("leaves the edit mode without the composed order when the question is answered that way", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(buttonByTitle("Move Samba down"));
        await waitFor(() => {
            expect(rows()[0].name).toBe("Bateria");
        });

        requestClose(model, onClose);
        fireEvent.click(await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>("#setListEditorDiscard");
            expect(button).toBeTruthy();

            return button!;
        }));

        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
        expect(model.reorderSetList).not.toHaveBeenCalled();
    });

    it("saves what the mini editor holds when its button is pressed again", async () => {
        const model = createMockDataModel();

        renderEditor(model);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);
        const note = await waitFor(() => {
            const field = document.body.querySelector<HTMLTextAreaElement>("#setListEntryNote");
            expect(field).toBeTruthy();

            return field!;
        });

        fireEvent.input(note, { target: { value: "Auftritt beginnt" } });
        fireEvent.click(buttonByTitle("Metronome"));
        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);

        await waitFor(() => {
            expect(model.saveSetListEntry).toHaveBeenCalledWith(4, 7, "Auftritt beginnt", "Metronome");
        });
    });

    it("drops the open description when Escape closes the mini editor", async () => {
        const model = createMockDataModel();

        renderEditor(model);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);
        const note = await waitFor(() => {
            const field = document.body.querySelector<HTMLTextAreaElement>("#setListEntryNote");
            expect(field).toBeTruthy();

            return field!;
        });

        fireEvent.input(note, { target: { value: "Verworfen" } });
        fireEvent.keyDown(document.body, { key: "Escape" });

        await waitFor(() => {
            expect(document.body.querySelector("#setListEntryNote")).toBeNull();
        });
        expect(model.saveSetListEntry).not.toHaveBeenCalled();

        // Reopening shows the stored description, which is empty, not the dropped text.
        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);
        const reopened = await waitFor(() => {
            const field = document.body.querySelector<HTMLTextAreaElement>("#setListEntryNote");
            expect(field).toBeTruthy();

            return field!;
        });
        expect(reopened.value).toBe("");
    });

    it("asks about the open description when the edit mode is left", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);
        const note = await waitFor(() => {
            const field = document.body.querySelector<HTMLTextAreaElement>("#setListEntryNote");
            expect(field).toBeTruthy();

            return field!;
        });
        fireEvent.input(note, { target: { value: "Zugabe" } });

        requestClose(model, onClose);

        fireEvent.click(await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>("#setListEditorSave");
            expect(button).toBeTruthy();

            return button!;
        }));

        await waitFor(() => {
            expect(model.saveSetListEntry).toHaveBeenCalledWith(4, 7, "Zugabe", undefined);
        });
        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
    });

    it("leaves without the open description when the question is answered that way", async () => {
        const model = createMockDataModel();
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(document.body.querySelector<HTMLElement>("#setListEntryEdit-7")!);
        const note = await waitFor(() => {
            const field = document.body.querySelector<HTMLTextAreaElement>("#setListEntryNote");
            expect(field).toBeTruthy();

            return field!;
        });
        fireEvent.input(note, { target: { value: "Zugabe" } });

        requestClose(model, onClose);
        fireEvent.click(await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>("#setListEditorDiscard");
            expect(button).toBeTruthy();

            return button!;
        }));

        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });
        expect(model.saveSetListEntry).not.toHaveBeenCalled();
    });

    it("keeps the editor open and names a conflict instead of overwriting a changed list", async () => {
        const model = createMockDataModel();
        model.reorderSetList.mockResolvedValue({ success: false, conflict: true });
        const onClose = vi.fn();

        renderEditor(model, onClose);

        await waitFor(() => {
            expect(rows()).toHaveLength(2);
        });

        fireEvent.click(buttonByTitle("Move Samba down"));
        requestClose(model, onClose);

        fireEvent.click(await waitFor(() => {
            const button = document.body.querySelector<HTMLElement>("#setListEditorSave");
            expect(button).toBeTruthy();

            return button!;
        }));

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
