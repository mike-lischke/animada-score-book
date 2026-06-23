/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog, DialogResponseClosure } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { TagInput } from "../components/ui/framework/TagInput.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ConfirmDialog } from "../components/ui/composites/ConfirmDialog.js";
import type { IGroupRow, IUserRow, ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

enum EditorMode {
    None,
    Create,
    Edit,
    ResetPassword,
}

interface IUserGroupEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
}

interface IUserGroupEditorState {
    users: IUserRow[];
    groups: IGroupRow[];

    /** Groups created locally (not yet in the backend). Persisted on Save. */
    pendingGroups: IGroupRow[];

    /** Which editor mode is active. */
    editorMode: EditorMode;

    /** The user being edited / reset, if any. */
    editingUserId: number;

    errorMessage: string;
    loading: boolean;

    /** Form fields. */
    formUsername: string;
    formDisplayName: string;
    formPassword: string;
    formIsAdmin: boolean;

    /** Group IDs the edited/created user should belong to (real + pending). */
    formGroupIds: Set<number>;
}

export class UserGroupEditor extends UIComponent<IUserGroupEditorProperties, IUserGroupEditorState> {
    private dialogRef = createRef<Dialog>();
    private confirmDialogRef = createRef<ConfirmDialog>();

    /** Counter for generating temporary negative IDs for pending groups. */
    private pendingIdCounter = -1;

    public constructor(props: IUserGroupEditorProperties) {
        super(props);

        this.state = {
            users: [],
            groups: [],
            pendingGroups: [],
            editorMode: EditorMode.None,
            editingUserId: 0,
            errorMessage: "",
            loading: false,
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formIsAdmin: false,
            formGroupIds: new Set(),
        };
    }

    public open(): void {
        this.pendingIdCounter = -1;
        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.None,
            editingUserId: 0,
            errorMessage: "",
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formIsAdmin: false,
            formGroupIds: new Set(),
        }, () => {
            this.dialogRef.current?.open();
            void this.loadData();
        });
    }

    public render(): ComponentChild {
        const { users, editorMode, errorMessage, loading } = this.state;

        const actions: ComponentChild[] = [];
        if (loading) {
            actions.push(<Label key="loading" caption="Loading…" />);
        }
        actions.push(<Button key="close" id="ug-close" value="close" caption="Close" />);

        return (
            <>
                <ConfirmDialog ref={this.confirmDialogRef} />
                <Dialog
                    ref={this.dialogRef}
                    id="userGroupEditorDialog"
                    caption={
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Icon src={Codicon.Organization} style={{ fontSize: "20px", marginRight: "6px" }} />
                            Users &amp; Groups
                        </Container>
                    }
                    onClose={this.handleClose}
                    actions={actions}
                >
                    {errorMessage && (
                        <Label className="text-error text-sm" caption={errorMessage} />
                    )}

                    <Container
                        orientation={Orientation.TopDown}
                        style={{ marginTop: "8px" }}
                    >
                        <Container
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                            style={{ marginBottom: "8px" }}
                        >
                            <Button
                                id="ug-add-user"
                                caption="+"
                                onClick={this.handleAddClick}
                            />
                        </Container>

                        {editorMode !== EditorMode.None && this.renderEditorForm()}

                        <Container
                            orientation={Orientation.TopDown}
                            className="ug-list"
                            style={{ maxHeight: "400px", overflowY: "auto" }}
                        >
                            {users.length === 0 && !loading && (
                                <Label className="text-base-content/50" caption="No users found." />
                            )}
                            {users.map((u) => {
                                return (
                                    <Container
                                        key={u.id}
                                        orientation={Orientation.LeftToRight}
                                        crossAlignment={ChildAlignment.Center}
                                        className="ug-list-item"
                                        style={{
                                            padding: "6px 8px",
                                            borderBottom: "1px solid var(--color-base-300)",
                                        }}
                                    >
                                        <Container
                                            orientation={Orientation.TopDown}
                                            style={{ flex: 1, minWidth: 0 }}
                                        >
                                            <Label caption={u.displayName || u.username} />
                                            <Label
                                                className="text-xs text-base-content/50"
                                                caption={`@${u.username}`}
                                            />
                                        </Container>
                                        {u.isAdmin && (
                                            <Label
                                                className="text-xs text-accent"
                                                caption="admin"
                                                style={{ marginRight: "8px" }}
                                            />
                                        )}
                                        <Button
                                            imageOnly
                                            className="du-btn-xs"
                                            data-tooltip="Edit"
                                            onClick={() => {
                                                void this.handleEditClick(u);
                                            }}
                                        >
                                            <Icon src={Codicon.Edit} />
                                        </Button>
                                        <Button
                                            imageOnly
                                            className="du-btn-xs"
                                            data-tooltip="Reset Password"
                                            onClick={() => {
                                                this.handleResetPasswordClick(u);
                                            }}
                                        >
                                            <Icon src={Codicon.Key} />
                                        </Button>
                                        <Button
                                            imageOnly
                                            className="du-btn-xs"
                                            data-tooltip="Delete"
                                            disabled={u.username === "anonymous"}
                                            onClick={() => {
                                                void this.handleDeleteUser(u);
                                            }}
                                        >
                                            <Icon src={Codicon.Trash} />
                                        </Button>
                                    </Container>
                                );
                            })}
                        </Container>
                    </Container>
                </Dialog>
            </>
        );
    }

    private renderEditorForm(): ComponentChild {
        const { editorMode, formUsername, formDisplayName, formPassword, formIsAdmin, formGroupIds } = this.state;

        const isCreate = editorMode === EditorMode.Create;
        const isReset = editorMode === EditorMode.ResetPassword;

        return (
            <Container
                orientation={Orientation.TopDown}
                className="ug-form"
                style={{
                    padding: "8px 12px",
                    marginBottom: "8px",
                    border: "1px solid var(--color-base-300)",
                    borderRadius: "4px",
                    gap: "6px",
                }}
            >
                {isReset ? (
                    <>
                        <Label caption="Reset Password" />
                        <Input
                            placeholder="New password (min 6 chars)"
                            password
                            value={formPassword}
                            onChange={this.handleFormPasswordChange}
                        />
                    </>
                ) : (
                    <>
                        <Label caption={isCreate ? "New User" : "Edit User"} />
                        <Input
                            placeholder="Username"
                            value={formUsername}
                            onChange={this.handleFormUsernameChange}
                        />
                        <Input
                            placeholder="Display Name"
                            value={formDisplayName}
                            onChange={this.handleFormDisplayNameChange}
                        />
                        {isCreate && (
                            <Input
                                placeholder="Password (min 6 chars)"
                                password
                                value={formPassword}
                                onChange={this.handleFormPasswordChange}
                            />
                        )}
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Checkbox
                                id="ug-form-is-admin"
                                checked={formIsAdmin}
                                onChange={this.handleFormIsAdminChange}
                            />
                            <Label caption="Admin" style={{ marginLeft: "4px" }} />
                        </Container>
                        <Label caption="Group Membership" style={{ marginTop: "2px" }} />
                        <TagInput
                            tags={this.getAllGroups()
                                .filter((g) => {
                                    return formGroupIds.has(g.id);
                                })
                                .map((g) => {
                                    return { id: g.id, caption: g.name, color: g.color };
                                })}
                            completions={this.getAllGroups()
                                .filter((g) => {
                                    return !formGroupIds.has(g.id);
                                })
                                .map((g) => {
                                    return g.name;
                                })}
                            removable
                            onAdd={(caption) => {
                                this.handleTagAdd(caption);
                            }}
                            onRemove={(id) => {
                                const next = new Set(formGroupIds);
                                next.delete(id);

                                // Also remove from pending if it was a pending group.
                                const { pendingGroups } = this.state;
                                const filtered = pendingGroups.filter((g) => {
                                    return g.id !== id;
                                });

                                this.setState({ formGroupIds: next, pendingGroups: filtered });
                            }}
                            onBadgeColorChange={(id, color) => {
                                void this.handleGroupColorChange(id, color);
                            }}
                        />
                    </>
                )}

                <Container
                    orientation={Orientation.LeftToRight}
                    style={{ gap: "8px", marginTop: "4px" }}
                >
                    <Button
                        caption={isCreate ? "Create" : (isReset ? "Set Password" : "Save")}
                        onClick={() => {
                            void this.handleSave();
                        }}
                    />
                    <Button
                        caption="Cancel"
                        onClick={this.handleCancelEdit}
                    />
                </Container>
            </Container>
        );
    }

    private async loadData(): Promise<void> {
        this.setState({ loading: true, errorMessage: "" });
        await Promise.all([this.loadUsers(), this.loadGroups()]);
        this.setState({ loading: false });
    }

    private async loadUsers(): Promise<void> {
        const { dataModel } = this.props;

        try {
            this.setState({ users: await dataModel.listUsers() });
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    private async loadGroups(): Promise<void> {
        const { dataModel } = this.props;

        try {
            this.setState({ groups: await dataModel.listGroups() });
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    private async loadUserGroupIds(userId: number): Promise<Set<number>> {
        const { dataModel } = this.props;
        const groupIds = new Set<number>();

        for (const g of this.state.groups) {
            try {
                const members = await dataModel.listGroupMembers(g.id);

                if (members.some((m) => {
                    return m.id === userId;
                })) {
                    groupIds.add(g.id);
                }
            } catch {
                // Skip groups whose members cannot be loaded.
            }
        }

        return groupIds;
    }

    private handleAddClick = (): void => {
        this.pendingIdCounter = -1;
        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.Create,
            editingUserId: 0,
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formIsAdmin: false,
            formGroupIds: new Set(),
            errorMessage: "",
        });
    };

    private handleEditClick = async (user: IUserRow): Promise<void> => {
        const groupIds = await this.loadUserGroupIds(user.id);

        this.setState({
            editorMode: EditorMode.Edit,
            editingUserId: user.id,
            formUsername: user.username,
            formDisplayName: user.displayName,
            formPassword: "",
            formIsAdmin: user.isAdmin,
            formGroupIds: groupIds,
            errorMessage: "",
        });
    };

    private handleResetPasswordClick = (user: IUserRow): void => {
        this.setState({
            editorMode: EditorMode.ResetPassword,
            editingUserId: user.id,
            formPassword: "",
            errorMessage: "",
        });
    };

    private handleCancelEdit = (): void => {
        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.None,
            editingUserId: 0,
            errorMessage: "",
        });
    };

    /**
     * Returns all groups — both persisted and pending.
     *
     * @returns The merged group list.
     */
    private getAllGroups(): IGroupRow[] {
        return [...this.state.groups, ...this.state.pendingGroups];
    }

    /**
     * Handles adding a tag (existing group or new pending group).
     *
     * @param caption The group name typed by the user.
     */
    private handleTagAdd(caption: string): void {
        const { groups, pendingGroups, formGroupIds } = this.state;

        // Check if it matches an existing group.
        const existing = groups.find((g) => {
            return g.name === caption;
        });

        if (existing) {
            const next = new Set(formGroupIds);
            next.add(existing.id);
            this.setState({ formGroupIds: next });

            return;
        }

        // Check if it already exists as a pending group.
        const pending = pendingGroups.find((g) => {
            return g.name === caption;
        });

        if (pending) {
            const next = new Set(formGroupIds);
            next.add(pending.id);
            this.setState({ formGroupIds: next });

            return;
        }

        // Create a new pending group with a random color.
        const id = this.pendingIdCounter;
        this.pendingIdCounter = this.pendingIdCounter - 1;

        const newGroup: IGroupRow = {
            id,
            name: caption,
            description: "",
            color: randomColor(),
            createdAt: "",
        };

        const next = new Set(formGroupIds);
        next.add(id);
        this.setState({
            pendingGroups: [...pendingGroups, newGroup],
            formGroupIds: next,
        });
    }

    private async handleGroupColorChange(groupId: number, color: string): Promise<void> {
        const { pendingGroups } = this.state;

        // For pending groups, update the color locally.
        const pendingIndex = pendingGroups.findIndex((g) => {
            return g.id === groupId;
        });

        if (pendingIndex >= 0) {
            const updated = [...pendingGroups];
            updated[pendingIndex] = { ...updated[pendingIndex], color };
            this.setState({ pendingGroups: updated });

            return;
        }

        // For real groups, persist via the backend.
        const { dataModel } = this.props;

        try {
            await dataModel.updateGroup(groupId, { color });
            await this.loadGroups();
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    private async handleSave(): Promise<void> {
        const {
            editorMode, editingUserId, formUsername, formDisplayName,
            formPassword, formIsAdmin, formGroupIds,
        } = this.state;

        const username = formUsername.trim();
        const displayName = formDisplayName.trim();

        const { dataModel } = this.props;

        if (editorMode === EditorMode.ResetPassword) {
            if (!formPassword || formPassword.length < 6) {
                this.setState({ errorMessage: "Password must be at least 6 characters." });

                return;
            }

            try {
                await dataModel.updateUser(editingUserId, { password: formPassword });
                this.setState({ editorMode: EditorMode.None, editingUserId: 0, errorMessage: "" });
            } catch (e) {
                this.setState({ errorMessage: (e as Error).message });
            }

            return;
        }

        if (!username) {
            this.setState({ errorMessage: "Username is required." });

            return;
        }

        if (username.length < 3) {
            this.setState({ errorMessage: "Username must be at least 3 characters." });

            return;
        }

        if (editorMode === EditorMode.Create) {
            if (!formPassword || formPassword.length < 6) {
                this.setState({ errorMessage: "Password must be at least 6 characters." });

                return;
            }

            try {
                // Persist pending groups first, resolve temporary IDs → real IDs.
                const idMap = await this.persistPendingGroups();

                const newId = await dataModel.createUser(
                    username, formPassword, displayName || username, formIsAdmin,
                );

                for (const groupId of formGroupIds) {
                    const realId = idMap.get(groupId) ?? groupId;

                    await dataModel.addUserToGroup(newId, realId);
                }
            } catch (e) {
                this.setState({ errorMessage: (e as Error).message });

                return;
            }
        } else {
            try {
                // Persist pending groups first, resolve temporary IDs → real IDs.
                const idMap = await this.persistPendingGroups();

                await dataModel.updateUser(editingUserId, {
                    displayName: displayName || username,
                    isAdmin: formIsAdmin,
                });

                const currentIds = await this.loadUserGroupIds(editingUserId);

                for (const gid of currentIds) {
                    if (!formGroupIds.has(gid)) {
                        await dataModel.removeUserFromGroup(editingUserId, gid);
                    }
                }

                for (const gid of formGroupIds) {
                    const realId = idMap.get(gid) ?? gid;

                    if (!currentIds.has(realId)) {
                        await dataModel.addUserToGroup(editingUserId, realId);
                    }
                }
            } catch (e) {
                this.setState({ errorMessage: (e as Error).message });

                return;
            }
        }

        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.None,
            editingUserId: 0,
            errorMessage: "",
        });
        await this.loadUsers();
        await this.loadGroups();
    }

    /**
     * Creates all pending groups in the backend and returns a map from
     * temporary IDs to the real IDs assigned by the database.
     *
     * @returns A map of temporary ID → real ID.
     */
    private async persistPendingGroups(): Promise<Map<number, number>> {
        const { pendingGroups } = this.state;
        const { dataModel } = this.props;
        const idMap = new Map<number, number>();

        for (const pg of pendingGroups) {
            const result = await dataModel.createGroup(pg.name, pg.description, pg.color);

            idMap.set(pg.id, result.id);
        }

        return idMap;
    }

    private async handleDeleteUser(user: IUserRow): Promise<void> {
        if (user.username === "anonymous") {
            this.setState({ errorMessage: "The anonymous system user cannot be deleted." });

            return;
        }

        const closure = await this.confirmDialogRef.current?.show(
            `Delete user "${user.displayName || user.username}"? This cannot be undone.`,
            { accept: "Delete", refuse: "Cancel" },
            "Delete User",
        );

        if (closure !== DialogResponseClosure.Accept) {
            return;
        }

        const { dataModel } = this.props;

        try {
            await dataModel.deleteUser(user.id);
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });

            return;
        }

        await this.loadUsers();
    }

    private handleFormUsernameChange = (e: InputEvent): void => {
        const target = e.target as HTMLInputElement;
        this.setState({ formUsername: target.value });
    };

    private handleFormDisplayNameChange = (e: InputEvent): void => {
        const target = e.target as HTMLInputElement;
        this.setState({ formDisplayName: target.value });
    };

    private handleFormPasswordChange = (e: InputEvent): void => {
        const target = e.target as HTMLInputElement;
        this.setState({ formPassword: target.value });
    };

    private handleFormIsAdminChange = (checked: boolean): void => {
        this.setState({ formIsAdmin: checked });
    };

    private handleClose = (_returnValue: string): void => {
        // Nothing special on close.
    };
}

/**
 * Generates a random hex color string using HSL for visually distinct colors.
 *
 * @returns A hex color string like "#a1b2c3".
 */
const randomColor = (): string => {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 20);
    const light = 40 + Math.floor(Math.random() * 15);

    const h = hue / 60;
    const c = ((1 - Math.abs((2 * light / 100) - 1)) * sat) / 100;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = (light / 100) - (c / 2);

    let r: number;
    let g: number;
    let b: number;

    if (h < 1) {
        r = c; g = x; b = 0;
    } else if (h < 2) {
        r = x; g = c; b = 0;
    } else if (h < 3) {
        r = 0; g = c; b = x;
    } else if (h < 4) {
        r = 0; g = x; b = c;
    } else if (h < 5) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    const toHex = (v: number): string => {
        const hex = Math.round((v + m) * 255).toString(16);

        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
