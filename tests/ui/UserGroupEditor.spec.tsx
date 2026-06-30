/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderNotificationCenter } from "../../src/components/ui/NotificationCenter/NotificationCenter.js";
import type { IGroupRow, IUserRow, ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import * as utils from "../../src/core/utils.js";
import { UserGroupEditor } from "../../src/ui/UserGroupEditor.js";

// ---------------------------------------------------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------------------------------------------------

interface IMockDataModel {
    listUsers: ReturnType<typeof vi.fn>;
    listGroups: ReturnType<typeof vi.fn>;
    listGroupMembers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
    createGroup: ReturnType<typeof vi.fn>;
    updateGroup: ReturnType<typeof vi.fn>;
    deleteGroup: ReturnType<typeof vi.fn>;
    addUserToGroup: ReturnType<typeof vi.fn>;
    removeUserFromGroup: ReturnType<typeof vi.fn>;
    user: IUserRow | undefined;
    reset: ReturnType<typeof vi.fn>;
}

const createMockDataModel = (overrides?: Partial<IMockDataModel>): ScoreBookDataModel => {
    return {
        listUsers: vi.fn().mockResolvedValue([]),
        listGroups: vi.fn().mockResolvedValue([]),
        listGroupMembers: vi.fn().mockResolvedValue([]),
        createUser: vi.fn().mockResolvedValue(1),
        updateUser: vi.fn().mockResolvedValue(undefined),
        deleteUser: vi.fn().mockResolvedValue(undefined),
        createGroup: vi.fn().mockResolvedValue({ id: 1, color: "#aabbcc" }),
        updateGroup: vi.fn().mockResolvedValue(undefined),
        deleteGroup: vi.fn().mockResolvedValue(undefined),
        addUserToGroup: vi.fn().mockResolvedValue(undefined),
        removeUserFromGroup: vi.fn().mockResolvedValue(undefined),
        get user() {
            return undefined;
        },
        reset: vi.fn(),
        ...overrides,
    } as unknown as ScoreBookDataModel;
};

const sampleUsers: IUserRow[] = [
    {
        id: 1, username: "admin", displayName: "Administrator", isAdmin: true,
        lastLogin: "2025-01-01", createdAt: "2024-01-01", updatedAt: "2024-06-01"
    },
    {
        id: 2, username: "editor", displayName: "Editor", isAdmin: false,
        lastLogin: "2025-01-02", createdAt: "2024-02-01", updatedAt: "2024-07-01"
    },
];

const sampleGroups: IGroupRow[] = [
    {
        id: 1, name: "Percussion", description: "", color: "#ff0000", adminId: 1,
        hasPassword: true, lastLogin: null, createdAt: "2024-01-01"
    },
    {
        id: 2, name: "Vocals", description: "", color: "#00ff00", adminId: null,
        hasPassword: false, lastLogin: null, createdAt: "2024-02-01"
    },
];

// ---------------------------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------------------------

describe.sequential("UserGroupEditor", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        vi.restoreAllMocks();
        let nextId = 100;
        vi.spyOn(utils, "getNewId").mockImplementation(() => {
            return nextId++;
        });
        renderResult = null;
        render(renderNotificationCenter());
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    // ---- Snapshot & static structure ----

    it("matches snapshot for default rendering", () => {
        const dataModel = createMockDataModel();
        renderResult = render(<UserGroupEditor dataModel={dataModel} />);

        // Dialog renders via Portal into document.body.
        expect(document.body.firstElementChild).toMatchSnapshot();
    });

    it("renders the dialog with correct id and heading", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#userGroupEditorDialog")).toBeTruthy();
        });

        const dialog = document.body.querySelector("#userGroupEditorDialog")!;

        expect(dialog.textContent).toContain("Users & Groups");
    });

    // ---- Loading state ----

    it("shows loading indicator while data is loading", async () => {
        // Never-resolving promise keeps the component in loading state.
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
            listGroups: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#userGroupEditorDialog")).toBeTruthy();
        });

        const dialog = document.body.querySelector("#userGroupEditorDialog")!;

        expect(dialog.textContent).toContain("Loading");
    });

    // ---- Users section ----

    it("renders the Users heading and Add User button", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog");

            expect(dialog).toBeTruthy();
            expect(dialog!.textContent).toContain("Users");
        });

        // Data loads asynchronously; wait for the button to appear after loading finishes.
        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-user")).toBeTruthy();
        });
    });

    it("renders user rows with display name, username and action buttons", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("Administrator");
            expect(dialog.textContent).toContain("@admin");
            expect(dialog.textContent).toContain("Editor");
            expect(dialog.textContent).toContain("@editor");
        });
    });

    it("shows admin badge for admin users", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("admin");
        });
    });

    it("shows empty state when no users exist", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue([]),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("No users found.");
        });
    });

    // ---- Groups section ----

    it("renders the Groups heading and Add Group button", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue([]),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("Groups");
        });

        // Data loads asynchronously; wait for the button to appear after loading finishes.
        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });
    });

    it("renders group rows with name and lock icon for password-protected groups", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("Percussion");
            expect(dialog.textContent).toContain("Vocals");
            // Password-protected group "Percussion" has adminId=1 (Administrator).
            expect(dialog.textContent).toContain("Administrator");
            // "Vocals" has no admin — should show "No admin".
            expect(dialog.textContent).toContain("No admin");
        });
    });

    it("shows empty state when no groups exist", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue([]),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("No groups found.");
        });
    });

    // ---- Error display ----

    it("renders error message when data loading fails", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockRejectedValue(new Error("Network error")),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            const dialog = document.body.querySelector("#userGroupEditorDialog")!;

            expect(dialog.textContent).toContain("Network error");
        });
    });

    // ---- Editor form rendering ----

    it("opens the editor popup in Create mode when Add User is clicked", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-user")).toBeTruthy();
        });

        const addButton = document.body.querySelector("#ug-add-user")!;
        (addButton as HTMLElement).click();

        await waitFor(() => {
            const popupContent = document.body.querySelector(".popup");

            expect(popupContent).toBeTruthy();
            expect(popupContent!.textContent).toContain("Username");
            expect(popupContent!.textContent).toContain("Display Name");
            expect(popupContent!.textContent).toContain("Password");
            expect(popupContent!.textContent).toContain("Group Membership");
            expect(popupContent!.textContent).toContain("Create");
        });
    });

    it("opens the editor popup in CreateGroup mode when Add Group is clicked", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue([]),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });

        const addButton = document.body.querySelector("#ug-add-group")!;
        (addButton as HTMLElement).click();

        await waitFor(() => {
            const popupContent = document.body.querySelector(".popup");

            expect(popupContent).toBeTruthy();
            expect(popupContent!.textContent).toContain("Name");
            expect(popupContent!.textContent).toContain("Admin");
            expect(popupContent!.textContent).toContain("Password");
            expect(popupContent!.textContent).toContain("Create");
        });
    });

    it("passes adminId to createGroup when creating a group", async () => {
        const createGroupMock = vi.fn().mockResolvedValue({ id: 10, color: "#aabbcc" });
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
            createGroup: createGroupMock,
            user: sampleUsers[0],
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });

        const addButton = document.body.querySelector<HTMLElement>("#ug-add-group")!;
        addButton.click();

        await waitFor(() => {
            expect(document.body.querySelector(".popup")).toBeTruthy();
        });

        const nameInput = document.body.querySelector<HTMLInputElement>(".popup input")!;
        nameInput.value = "TestGroup";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));

        await waitFor(() => {
            expect(nameInput.value).toBe("TestGroup");
        });

        const createButton = Array.from(
            document.body.querySelectorAll<HTMLElement>(".popup button"),
        ).find((b) => {
            return b.textContent === "Create";
        })!;
        createButton.click();

        await waitFor(() => {
            expect(createGroupMock).toHaveBeenCalledWith(
                "TestGroup", "", undefined, undefined, sampleUsers[0].id,
            );
        });
    });

    it("shows error when creating group with empty name", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
            user: sampleUsers[0],
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });

        const addButton = document.body.querySelector<HTMLElement>("#ug-add-group")!;
        addButton.click();

        await waitFor(() => {
            expect(document.body.querySelector(".popup")).toBeTruthy();
        });

        const createButton = Array.from(
            document.body.querySelectorAll<HTMLElement>(".popup button"),
        ).find((b) => {
            return b.textContent === "Create";
        })!;
        createButton.click();

        await waitFor(() => {
            const popupContent = document.body.querySelector(".popup")!;

            expect(popupContent.textContent).toContain("Group name is required.");
        });
    });

    it("passes password to createGroup when provided", async () => {
        const createGroupMock = vi.fn().mockResolvedValue({ id: 10, color: "#aabbcc" });
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
            createGroup: createGroupMock,
            user: sampleUsers[0],
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });

        const addButton = document.body.querySelector<HTMLElement>("#ug-add-group")!;
        addButton.click();

        await waitFor(() => {
            expect(document.body.querySelector(".popup")).toBeTruthy();
        });

        const nameInput = document.body.querySelector<HTMLInputElement>(".popup input")!;
        nameInput.value = "LockedGroup";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));

        await waitFor(() => {
            expect(nameInput.value).toBe("LockedGroup");
        });

        const passwordInput = document.body.querySelectorAll<HTMLInputElement>(".popup input")[1];
        fireEvent.input(passwordInput, { target: { value: "secret123" } });

        const createButton = Array.from(
            document.body.querySelectorAll<HTMLElement>(".popup button"),
        ).find((b) => {
            return b.textContent === "Create";
        })!;
        createButton.click();

        await waitFor(() => {
            expect(createGroupMock).toHaveBeenCalledWith(
                "LockedGroup", "", undefined, "secret123", sampleUsers[0].id,
            );
        });
    });

    it("defaults admin to current user when no user is logged in", async () => {
        const createGroupMock = vi.fn().mockResolvedValue({ id: 10, color: "#aabbcc" });
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue([]),
            createGroup: createGroupMock,
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#ug-add-group")).toBeTruthy();
        });

        const addButton = document.body.querySelector<HTMLElement>("#ug-add-group")!;
        addButton.click();

        await waitFor(() => {
            expect(document.body.querySelector(".popup")).toBeTruthy();
        });

        const nameInput = document.body.querySelector<HTMLInputElement>(".popup input")!;
        nameInput.value = "NoAdminGroup";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));

        await waitFor(() => {
            expect(nameInput.value).toBe("NoAdminGroup");
        });

        const createButton = Array.from(
            document.body.querySelectorAll<HTMLElement>(".popup button"),
        ).find((b) => {
            return b.textContent === "Create";
        })!;
        createButton.click();

        await waitFor(() => {
            expect(createGroupMock).toHaveBeenCalledWith(
                "NoAdminGroup", "", undefined, undefined, undefined,
            );
        });
    });

    it("matches snapshot when dialog is open with populated data", async () => {
        const dataModel = createMockDataModel({
            listUsers: vi.fn().mockResolvedValue(sampleUsers),
            listGroups: vi.fn().mockResolvedValue(sampleGroups),
        });
        const ref = createRef<UserGroupEditor>();
        const Wrapper: FunctionComponent = () => {
            return <UserGroupEditor ref={ref} dataModel={dataModel} />;
        };

        renderResult = render(<Wrapper />);
        ref.current!.open();

        await waitFor(() => {
            expect(document.body.querySelector("#userGroupEditorDialog")).toBeTruthy();
        });

        // Snapshot of the full dialog portal content.
        expect(document.body.innerHTML).toMatchSnapshot();
    });
});
