/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, waitFor, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IGroupRow, ISbDmScore, ScoreBookDataModel, } from "../../src/core/ScoreBookDataModel.js";
import { SbDmEntityType } from "../../src/core/ScoreBookDataModel.js";
import { PermissionEditor } from "../../src/ui/PermissionEditor.js";

interface IMockDataModel {
    getPermissions: ReturnType<typeof vi.fn>;
    listUsers: ReturnType<typeof vi.fn>;
    listGroups: ReturnType<typeof vi.fn>;
    setPermissions: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (overrides?: Partial<IMockDataModel>): ScoreBookDataModel => {
    return {
        getPermissions: vi.fn().mockResolvedValue(null),
        listUsers: vi.fn().mockResolvedValue([]),
        listGroups: vi.fn().mockResolvedValue([]),
        setPermissions: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as ScoreBookDataModel;
};

const sampleGroups: IGroupRow[] = [
    {
        id: 1, name: "World", description: "Public access", color: "#808080",
        adminId: null, hasPassword: false, lastLogin: null, createdAt: "2024-01-01"
    },
    {
        id: 2, name: "Admins", description: "System administrators", color: "#ff0000",
        adminId: 1, hasPassword: true, lastLogin: null, createdAt: "2024-01-01"
    },
    {
        id: 3, name: "Percussion", description: "", color: "#00ff00",
        adminId: 1, hasPassword: false, lastLogin: null, createdAt: "2024-02-01"
    },
    {
        id: 4, name: "Vocals", description: "", color: "#0000ff",
        adminId: null, hasPassword: false, lastLogin: null, createdAt: "2024-03-01"
    },
];

const sampleUsers = [
    {
        id: 1, username: "admin", displayName: "Administrator", isAdmin: true,
        lastLogin: null, createdAt: "", updatedAt: ""
    },
];

const createScoreEntry = (overrides?: Partial<ISbDmScore>): ISbDmScore => {
    return {
        type: SbDmEntityType.Score, id: 100, name: "Test Score", content: "{}",
        state: { initialized: true, isLeaf: true, expanded: true, expandedOnce: true },
        perm: { isOwner: true, canRead: true, canWrite: true, isWorld: true, groupIds: [1, 3] },
        ...overrides,
    } as ISbDmScore;
};

/**
 * Opens the editor with a score entry and common mock data.
 *
 * @param overrides Optional mock overrides.
 * @param overrides.getPermissions Mock for getPermissions.
 * @param overrides.setPermissions Mock for setPermissions.
 * @param overrides.entryOverrides Fields to override on the score entry.
 *
 * @returns The component ref, render result, and onSaved mock.
 */
const openWithScore = async (overrides?: {
    getPermissions?: ReturnType<typeof vi.fn>;
    setPermissions?: ReturnType<typeof vi.fn>;
    entryOverrides?: Partial<ISbDmScore>;
}): Promise<{
    ref: { current: PermissionEditor | null; };
    renderResult: RenderResult;
    onSaved: ReturnType<typeof vi.fn>;
}> => {
    const onSaved = vi.fn();
    const dataModel = createMockDataModel({
        getPermissions: overrides?.getPermissions ?? vi.fn().mockResolvedValue({
            entityType: "score", entityId: 100, ownerId: 1, groups: [],
        }),
        listUsers: vi.fn().mockResolvedValue(sampleUsers),
        listGroups: vi.fn().mockResolvedValue(sampleGroups),
        setPermissions: overrides?.setPermissions ?? vi.fn().mockResolvedValue(undefined),
    });

    const ref = { current: null as PermissionEditor | null };
    const renderResult = render(
        <PermissionEditor
            ref={(instance) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                ref.current = instance;
            }}
            dataModel={dataModel}
            onSaved={onSaved}
        />,
    );

    const entry = createScoreEntry(overrides?.entryOverrides);
    const target = document.createElement("div");

    document.body.appendChild(target);

    await ref.current!.open(target, entry);
    document.body.removeChild(target);

    return { ref, renderResult, onSaved };
};

describe("PermissionEditor", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        vi.restoreAllMocks();
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("opens with a score entry and shows group chips", async () => {
        const { renderResult: rr } = await openWithScore({
            getPermissions: vi.fn().mockResolvedValue({
                entityType: "score", entityId: 100, ownerId: 1,
                groups: [{ groupId: 1, writable: false }, { groupId: 3, writable: true }],
            }),
        });

        renderResult = rr;

        await waitFor(() => {
            expect(document.querySelectorAll(".perm-chip").length).toBeGreaterThan(0);
        });

        const adminChip = Array.from(document.querySelectorAll(".perm-chip")).find((c) => {
            return c.textContent.includes("Admins");
        });

        expect(adminChip).toBeUndefined();
    });

    it("shows owner name in the header", async () => {
        const { renderResult: rr } = await openWithScore();

        renderResult = rr;

        await waitFor(() => {
            const header = document.querySelector("#permissionEditorHeader");

            expect(header).not.toBeNull();
            expect(header!.textContent).toContain("Administrator");
        });
    });

    it("excludes World group from write group IDs on open", async () => {
        const { renderResult: rr } = await openWithScore({
            getPermissions: vi.fn().mockResolvedValue({
                entityType: "score", entityId: 100, ownerId: 1,
                groups: [{ groupId: 1, writable: true }, { groupId: 3, writable: true }],
            }),
        });

        renderResult = rr;

        await waitFor(() => {
            const writeZone = document.querySelectorAll(".perm-drop-zone")[1];
            const chips = writeZone.querySelectorAll(".perm-chip");
            const worldInWrite = Array.from(chips).find((c) => {
                return c.textContent.includes("World");
            });

            expect(worldInWrite).toBeUndefined();
        });
    });

    it("excludes Admins group from all groups", async () => {
        const { renderResult: rr } = await openWithScore();

        renderResult = rr;

        await waitFor(() => {
            const chips = document.querySelectorAll(".perm-chip");
            const adminChip = Array.from(chips).find((c) => {
                return c.textContent.includes("Admins");
            });

            expect(adminChip).toBeUndefined();
        });
    });

    it("calls setPermissions and onSaved when adding a group", async () => {
        const setPermissions = vi.fn().mockResolvedValue(undefined);
        const { renderResult: rr, ref, onSaved } = await openWithScore({
            setPermissions,
            getPermissions: vi.fn().mockResolvedValue({
                entityType: "score", entityId: 100, ownerId: 1, groups: [],
            }),
        });

        renderResult = rr;

        await waitFor(() => {
            expect(document.querySelector("#permissionEditor")).not.toBeNull();
        });

        // Access private addGroup for testing.
        const editor = ref.current as unknown as {
            addGroup: (groupId: number, writable: boolean) => void;
        };

        editor.addGroup(4, false);

        await waitFor(() => {
            expect(setPermissions).toHaveBeenCalled();
            expect(onSaved).toHaveBeenCalled();
        });
    });
});
