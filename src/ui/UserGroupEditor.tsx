/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog, DialogResponseClosure } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import { TagInput } from "../components/ui/framework/TagInput.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, ComponentPlacement, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ConfirmDialog } from "../components/ui/composites/ConfirmDialog.js";
import { Popup } from "../components/ui/framework/Popup.js";
import { NotificationCenter } from "../components/ui/NotificationCenter/NotificationCenter.js";
import type { IGroupMember, IGroupRow, IUserRow, ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

enum EditorMode {
    None,
    Create,
    Edit,
    ResetPassword,
    ManageGroup,
    CreateGroup,
}

interface IUserGroupEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** When false, only shows groups the current user admins. Hides the Users section. Default true. */
    showUsers?: boolean;
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

    /** The group being edited, if any. */
    editingGroupId: number;

    /** Form fields for group management. */
    formGroupName: string;
    formGroupPassword: string;
    formGroupAdminId: number;
    formAddMemberId: number;
    formMemberFilter: string;

    /** Members of the group currently being edited. */
    editingGroupMembers: IGroupMember[];

    /** Error message shown inside the editor popup. */
    formErrorMessage: string;

    errorMessage: string;
    loading: boolean;

    /** Form fields. */
    formUsername: string;
    formDisplayName: string;
    formPassword: string;

    /** Group IDs the edited/created user should belong to (real + pending). */
    formGroupIds: Set<number>;
}

export class UserGroupEditor extends UIComponent<IUserGroupEditorProperties, IUserGroupEditorState> {
    private dialogRef = createRef<Dialog>();
    private confirmDialogRef = createRef<ConfirmDialog>();
    private popupRef = createRef<Popup>();

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
            editingGroupId: 0,
            formGroupName: "",
            formGroupPassword: "",
            formGroupAdminId: 0,
            formAddMemberId: 0,
            formMemberFilter: "",
            editingGroupMembers: [],
            formErrorMessage: "",
            errorMessage: "",
            loading: false,
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formGroupIds: new Set(),
        };
    }

    public open(): void {
        this.pendingIdCounter = -1;
        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.None,
            editingUserId: 0,
            editingGroupId: 0,
            formGroupName: "",
            formGroupPassword: "",
            formGroupAdminId: 0,
            formAddMemberId: 0,
            formMemberFilter: "",
            editingGroupMembers: [],
            errorMessage: "",
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formGroupIds: new Set(),
        }, () => {
            this.dialogRef.current?.open();
            void this.loadData();
        });
    }

    public render(): ComponentChild {
        const { users, groups, editorMode, errorMessage, loading } = this.state;
        const { showUsers } = this.props;
        const isFullAdmin = showUsers !== false;

        const actions: ComponentChild[] = [];
        if (loading) {
            actions.push(<Label key="loading" caption="Loading…" />);
        }

        let userRows: ComponentChild;
        if (isFullAdmin) {
            if (users.length === 0) {
                userRows = (
                    <Container className="form-row">
                        <Label className="text-base-content/50" caption="No users found." />
                    </Container>
                );
            } else {
                userRows = users.map((u) => {
                    return (
                        <Container
                            key={u.id}
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Container
                                orientation={Orientation.TopDown}
                                className="user-group-item-content"
                            >
                                <Label caption={u.displayName || u.username} />
                                <Label
                                    className="text-xs text-base-content/50"
                                    caption={`@${u.username}`}
                                />
                            </Container>
                            {u.isAdmin && (
                                <Label
                                    className="text-xs text-accent user-group-admin-label"
                                    caption="admin"
                                />
                            )}
                            <Button
                                imageOnly
                                className="du-btn-xs"
                                data-tooltip="Edit"
                                onClick={(e) => {

                                    const trigger = e.currentTarget as HTMLElement;

                                    void this.handleEditClick(u, trigger);
                                }}
                            >
                                <Icon src={Codicon.Edit} />
                            </Button>
                            <Button
                                imageOnly
                                className="du-btn-xs"
                                data-tooltip="Reset Password"
                                onClick={(e) => {

                                    const trigger = e.currentTarget as HTMLElement;

                                    this.handleResetPasswordClick(u, trigger);
                                }}
                            >
                                <Icon src={Codicon.Key} />
                            </Button>
                            <Button
                                imageOnly
                                className="du-btn-xs"
                                data-tooltip="Delete"
                                onClick={() => {
                                    void this.handleDeleteUser(u);
                                }}
                            >
                                <Icon src={Codicon.Trash} />
                            </Button>
                        </Container>
                    );
                });
            }
        }

        let groupRows: ComponentChild;
        if (groups.length === 0) {
            groupRows = (
                <Container className="form-row">
                    <Label className="text-base-content/50" caption="No groups found." />
                </Container>
            );
        } else {
            groupRows = groups.map((group) => {
                const admin = group.adminId
                    ? users.find((u) => {
                        return u.id === group.adminId;
                    })
                    : undefined;
                const isSet = admin !== undefined;
                const badgeColor = isSet ? userBadgeColor(admin.id) : "#6b7280";
                const background = isSet ? badgeColor + "80" : "transparent";
                const label = isSet ? (admin.displayName || admin.username) : "No admin";

                const adminBadge = (
                    <span
                        className="user-group-admin-badge"
                        style={{
                            "--badge-bg": background,
                            "--badge-color": badgeColor,
                            "--badge-text": isSet
                                ? (isLightHex(badgeColor) ? "#1a1a2e" : "#ffffff")
                                : "var(--color-base-content-300)",
                            "--badge-opacity": isSet ? "1" : "0.6",
                        }}
                    >
                        <Icon
                            src={Codicon.Account}
                        />
                        {label}
                    </span>
                );

                return (
                    <Container
                        key={group.id}
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            className="user-group-item-content"
                        >
                            <Label caption={group.name} />
                            {group.hasPassword && (
                                <Icon
                                    src={Codicon.Lock}
                                    className="user-group-lock-icon"
                                />
                            )}
                            {adminBadge}
                        </Container>
                        {group.name !== "World" && (
                            <Button
                                imageOnly
                                className="du-btn-xs"
                                data-tooltip="Edit Group"
                                onClick={(e) => {
                                    const trigger = e.currentTarget as HTMLElement;
                                    void this.handleEditGroupClick(group, trigger);
                                }}
                            >
                                <Icon src={Codicon.Edit} />
                            </Button>
                        )}
                        {isFullAdmin && group.name !== "Admins" && (
                            <Button
                                imageOnly
                                className="du-btn-xs"
                                data-tooltip="Delete Group"
                                onClick={() => {
                                    void this.handleDeleteGroup(group);
                                }}
                            >
                                <Icon src={Codicon.Trash} />
                            </Button>
                        )}
                    </Container>
                );
            });
        }

        return (
            <>
                <ConfirmDialog ref={this.confirmDialogRef} />
                <Popup
                    ref={this.popupRef}
                    showArrow={true}
                    placement={ComponentPlacement.TopCenter}
                >
                    {editorMode !== EditorMode.None && this.renderEditorForm()}
                </Popup>
                <Dialog
                    ref={this.dialogRef}
                    id="userGroupEditorDialog"
                    closeOnBackdropClick={true}
                    onClose={this.handleClose}
                    actions={actions.length > 0 ? actions : undefined}
                >
                    <Container
                        className="font-bold text-lg"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Icon src={Codicon.Organization} style={{ fontSize: "24px", marginRight: "8px" }} />
                        {isFullAdmin ? "Users & Groups" : "My Groups"}
                    </Container>

                    {errorMessage && (
                        <Label className="text-error text-sm" caption={errorMessage} />
                    )}

                    {!loading && isFullAdmin && (
                        <Container className="form-card" orientation={Orientation.TopDown}>
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label className="form-row-heading" caption="Users" />
                                <Button
                                    id="ug-add-user"
                                    className="form-row-add-button"
                                    caption="+"
                                    data-tooltip="Add User"
                                    onClick={this.handleAddClick}
                                />
                            </Container>

                            {userRows}
                        </Container>
                    )}

                    {!loading && (
                        <Container className="form-card" orientation={Orientation.TopDown}>
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label className="form-row-heading" caption="Groups" />
                                {isFullAdmin && (
                                    <Button
                                        id="ug-add-group"
                                        className="form-row-add-button"
                                        caption="+"
                                        data-tooltip="Add Group"
                                        onClick={this.handleAddGroupClick}
                                    />
                                )}
                            </Container>

                            {groupRows}
                        </Container>
                    )}
                </Dialog>
            </>
        );
    }

    private renderEditorForm(): ComponentChild {
        const { editorMode, formUsername, formDisplayName, formPassword, formGroupIds, formGroupName,
            formGroupPassword, formGroupAdminId, formMemberFilter, formErrorMessage, users,
            groups, editingGroupId, editingGroupMembers, } =
            this.state;

        if (editorMode === EditorMode.ManageGroup || editorMode === EditorMode.CreateGroup) {
            const isCreate = editorMode === EditorMode.CreateGroup;
            const group = groups.find((g) => {
                return g.id === editingGroupId;
            });
            const title = isCreate ? "Create Group" : `Manage ${group?.name ?? "Group"}`;

            const adminItems: IDropdownItem[] = [
                {
                    label: "None",
                    onClick: () => {
                        this.setState({ formGroupAdminId: 0 });
                    },
                },
            ];

            for (const u of users) {
                adminItems.push({
                    label: `${u.displayName || u.username} (@${u.username})`,
                    onClick: () => {
                        this.setState({ formGroupAdminId: u.id });
                    },
                });
            }

            const selectedAdmin = formGroupAdminId
                ? users.find((u) => {
                    return u.id === formGroupAdminId;
                })
                : undefined;
            const adminCaption = selectedAdmin
                ? `${selectedAdmin.displayName || selectedAdmin.username} (@${selectedAdmin.username})`
                : "None";

            const existingIds = new Set(editingGroupMembers.map((m) => {
                return m.id;
            }));
            const filter = formMemberFilter.toLowerCase();
            const availableUsers = users.filter((u) => {
                if (existingIds.has(u.id)) {
                    return false;
                }

                if (!filter) {
                    return true;
                }

                return u.username.toLowerCase().includes(filter)
                    || u.displayName.toLowerCase().includes(filter);
            });
            const addMemberItems: IDropdownItem[] = availableUsers.map((u) => {
                return {
                    label: `${u.displayName || u.username} (@${u.username})`,
                    onClick: () => {
                        this.handleAddMember(u.id);
                    },
                };
            });
            const addCaption = addMemberItems.length > 0 ? "+" : "No users available";

            return (
                <>
                    <Container
                        className="font-bold text-lg"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Icon src={Codicon.Organization} style={{ fontSize: "24px", marginRight: "8px" }} />
                        {title}
                    </Container>

                    {formErrorMessage && (
                        <Container className="form-row">
                            <Label
                                caption={formErrorMessage}
                                className="text-error text-sm"
                            />
                        </Container>
                    )}

                    <Container className="form-card" orientation={Orientation.TopDown}>
                        {isCreate && (
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label className="form-row-label" caption="Name" />
                                <Input
                                    placeholder="Group name"
                                    value={formGroupName}
                                    onChange={this.handleFormGroupNameChange}
                                />
                            </Container>
                        )}

                        <Container
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label className="form-row-label" caption="Admin" />
                            <div style={{ flex: 1 }}>
                                <Dropdown
                                    caption={adminCaption}
                                    items={adminItems}
                                    selectedItem={adminCaption}
                                    closeOnSelect
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </Container>

                        <Container
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label className="form-row-label" caption="Password" />
                            <Input
                                placeholder={isCreate ? "Optional shared password" : "Set shared password"}
                                password
                                showPasswordToggle
                                value={formGroupPassword}
                                onChange={this.handleFormGroupPasswordChange}
                            />
                        </Container>
                    </Container>

                    <Container className="form-card" orientation={Orientation.TopDown}>
                        <>
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label className="form-row-heading" caption="Members" />
                                {addMemberItems.length > 0 && (
                                    <Dropdown
                                        caption={addCaption}
                                        items={addMemberItems}
                                        selectedItem={addCaption}
                                        closeOnSelect
                                    />
                                )}
                            </Container>

                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Input
                                    placeholder="Filter users…"
                                    value={formMemberFilter}
                                    onChange={this.handleFormMemberFilterChange}
                                />
                            </Container>

                            {editingGroupMembers.length === 0 ? (
                                <Container className="form-row">
                                    <Label className="text-xs text-base-content/50" caption="No members." />
                                </Container>
                            ) : (
                                editingGroupMembers
                                    .filter((m) => {
                                        if (!formMemberFilter) {
                                            return true;
                                        }

                                        const f = formMemberFilter.toLowerCase();

                                        return m.username.toLowerCase().includes(f)
                                            || m.displayName.toLowerCase().includes(f);
                                    })
                                    .map((m) => {
                                        return (
                                            <Container
                                                key={m.id}
                                                className="form-row"
                                                orientation={Orientation.LeftToRight}
                                                crossAlignment={ChildAlignment.Center}
                                            >
                                                <Container
                                                    orientation={Orientation.TopDown}
                                                    style={{ flex: 1, minWidth: 0 }}
                                                >
                                                    <Label caption={m.displayName || m.username} />
                                                    <Label
                                                        className="text-xs text-base-content/50"
                                                        caption={`@${m.username}`}
                                                    />
                                                </Container>
                                                <Button
                                                    imageOnly
                                                    className="du-btn-xs du-btn-ghost"
                                                    data-tooltip="Remove"
                                                    onClick={() => {
                                                        this.handleRemoveMember(m.id);
                                                    }}
                                                >
                                                    <Icon src={Codicon.Close} style={{ fontSize: "10px" }} />
                                                </Button>
                                            </Container>
                                        );
                                    })
                            )}
                        </>
                    </Container>

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span></span>
                        <Container orientation={Orientation.LeftToRight} className="form-row-actions">
                            <Button
                                caption={isCreate ? "Create" : "Save"}
                                onClick={() => {
                                    void (isCreate ? this.handleCreateGroup() : this.handleSaveGroup());
                                }}
                            />
                        </Container>
                    </Container>
                </>
            );
        }

        const isCreate = editorMode === EditorMode.Create;
        const isReset = editorMode === EditorMode.ResetPassword;

        return (
            <Container className="form-card" orientation={Orientation.TopDown}>
                {formErrorMessage && (
                    <Container className="form-row">
                        <Label caption={formErrorMessage} className="text-error text-sm" />
                    </Container>
                )}

                {isReset ? (
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label className="form-row-label" caption="New Password" />
                        <Input
                            placeholder="Min 6 characters"
                            password
                            showPasswordToggle
                            value={formPassword}

                            onChange={this.handleFormPasswordChange}
                        />
                    </Container>
                ) : (
                    <>
                        <Container
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label className="form-row-label" caption="Username" />
                            <Input
                                placeholder="Username"
                                autoFocus={isCreate}
                                value={formUsername}

                                onChange={this.handleFormUsernameChange}
                            />
                        </Container>

                        <Container
                            className="form-row"
                            orientation={Orientation.LeftToRight}
                            mainAlignment={ChildAlignment.SpaceBetween}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label
                                className="form-row-label"
                                caption="Display Name"

                            />
                            <Input
                                placeholder="Display Name"
                                value={formDisplayName}

                                onChange={this.handleFormDisplayNameChange}
                            />
                        </Container>

                        {isCreate && (
                            <Container
                                className="form-row"
                                orientation={Orientation.LeftToRight}
                                mainAlignment={ChildAlignment.SpaceBetween}
                                crossAlignment={ChildAlignment.Center}
                            >
                                <Label
                                    className="form-row-label"
                                    caption="Password"

                                />
                                <Input
                                    placeholder="Min 6 characters"
                                    password
                                    showPasswordToggle
                                    value={formPassword}

                                    onChange={this.handleFormPasswordChange}
                                />
                            </Container>
                        )}

                        <Container
                            className="form-row form-row-stacked"
                            orientation={Orientation.TopDown}
                        >
                            <Label className="form-row-label" caption="Group Membership" />
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
                        </Container>
                    </>
                )}

                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span></span>
                    <Container orientation={Orientation.LeftToRight} className="form-row-actions">
                        <Button
                            caption={isCreate ? "Create" : (isReset ? "Set Password" : "Save")}
                            onClick={() => {
                                void this.handleSave();
                            }}
                        />
                    </Container>
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
            const users = await dataModel.listUsers();
            this.setState({
                users: users.filter((u) => {
                    return u.username !== "anonymous";
                })
            });
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    private async loadGroups(): Promise<void> {
        const { dataModel } = this.props;
        const { showUsers } = this.props;

        try {
            let groups = await dataModel.listGroups();

            if (showUsers === false) {
                const userId = dataModel.user?.id;
                groups = groups.filter((g) => {
                    return g.adminId === userId;
                });
            }

            this.setState({ groups });
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    private async loadUserGroupIds(userId: number): Promise<Set<number>> {
        const { dataModel } = this.props;
        const { groups } = this.state;
        const groupIds = new Set<number>();

        for (const g of groups) {
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

    private handleAddClick = (e: MouseEvent | KeyboardEvent): void => {
        const trigger = e.currentTarget as HTMLElement;

        this.pendingIdCounter = -1;
        this.setState({
            pendingGroups: [],
            editorMode: EditorMode.Create,
            editingUserId: 0,
            formUsername: "",
            formDisplayName: "",
            formPassword: "",
            formGroupIds: new Set(),
            errorMessage: "",
        }, () => {
            this.openEditorPopup(trigger);
        });
    };

    private handleEditClick = async (user: IUserRow, trigger: HTMLElement): Promise<void> => {
        const groupIds = await this.loadUserGroupIds(user.id);

        this.setState({
            editorMode: EditorMode.Edit,
            editingUserId: user.id,
            formUsername: user.username,
            formDisplayName: user.displayName,
            formPassword: "",
            formGroupIds: groupIds,
            errorMessage: "",
        }, () => {
            this.openEditorPopup(trigger);
        });
    };

    private handleResetPasswordClick = (user: IUserRow, trigger: HTMLElement): void => {
        this.setState({
            editorMode: EditorMode.ResetPassword,
            editingUserId: user.id,
            formPassword: "",
            errorMessage: "",
        }, () => {
            this.openEditorPopup(trigger);
        });
    };

    private handleEditGroupClick = async (group: IGroupRow, trigger: HTMLElement): Promise<void> => {
        const { dataModel } = this.props;
        let members: IGroupMember[] = [];

        try {
            members = await dataModel.listGroupMembers(group.id);
        } catch {
            // Ignore — proceed without member info.
        }

        this.setState({
            editorMode: EditorMode.ManageGroup,
            editingGroupId: group.id,
            formGroupPassword: "",
            formGroupAdminId: group.adminId ?? 0,
            formAddMemberId: 0,
            formMemberFilter: "",
            editingGroupMembers: members,
            formErrorMessage: "",
            errorMessage: "",
        }, () => {
            this.openEditorPopup(trigger);
        });
    };

    private handleAddGroupClick = (e: MouseEvent | KeyboardEvent): void => {
        const trigger = e.currentTarget as HTMLElement;
        const { dataModel } = this.props;

        this.setState({
            editorMode: EditorMode.CreateGroup,
            formGroupName: "",
            formGroupPassword: "",
            formGroupAdminId: dataModel.user?.id ?? 0,
            formMemberFilter: "",
            editingGroupMembers: [],
            formErrorMessage: "",
            errorMessage: "",
        }, () => {
            this.openEditorPopup(trigger);
        });
    };

    private async handleDeleteGroup(group: IGroupRow): Promise<void> {
        const { dataModel } = this.props;

        let memberCount = 0;

        try {
            const members = await dataModel.listGroupMembers(group.id);
            memberCount = members.length;
        } catch {
            // Ignore — proceed without member info.
        }

        const description: string[] = [];

        if (group.hasPassword) {
            description.push(
                "This group has a shared password set. Group members will no longer be able to log in with it.",
            );
        }

        if (memberCount > 0) {
            description.push(
                `${memberCount} user${memberCount === 1 ? "" : "s"} will be removed from this group.`,
            );
        }

        const closure = await this.confirmDialogRef.current?.show(
            `Delete group "${group.name}"?`,
            { accept: "Delete" },
            "Delete Group",
            description.length > 0 ? description : undefined,
            undefined,
            true,
        );

        if (closure !== DialogResponseClosure.Accept) {
            return;
        }

        try {
            await dataModel.deleteGroup(group.id);
            void NotificationCenter.showInfo(`Group "${group.name}" deleted.`);
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });

            return;
        }

        await this.loadGroups();
    }

    private handleFormGroupPasswordChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ formGroupPassword: props.value ?? "" });
    };

    private handleFormGroupNameChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ formGroupName: props.value ?? "" });
    };

    private handleAddMember = (userId: number): void => {
        const { editingGroupMembers, users } = this.state;
        const user = users.find((u) => {
            return u.id === userId;
        });

        if (!user || editingGroupMembers.some((m) => {
            return m.id === userId;
        })) {
            return;
        }

        this.setState({
            editingGroupMembers: [...editingGroupMembers, {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
            }],
        });
    };

    private handleRemoveMember = (userId: number): void => {
        const { editingGroupMembers } = this.state;

        this.setState({
            editingGroupMembers: editingGroupMembers.filter((m) => {
                return m.id !== userId;
            }),
        });
    };

    private handleFormMemberFilterChange = (e: Event, props: { value?: string; }): void => {
        this.setState({ formMemberFilter: props.value ?? "" });
    };

    private async handleCreateGroup(): Promise<void> {
        const { formGroupName, formGroupPassword, formGroupAdminId, editingGroupMembers } = this.state;
        const { dataModel } = this.props;

        const name = formGroupName.trim();

        if (!name) {
            this.setState({ formErrorMessage: "Group name is required." });

            return;
        }

        try {
            const result = await dataModel.createGroup(name, "", undefined, formGroupPassword || undefined,
                formGroupAdminId || undefined);

            for (const m of editingGroupMembers) {
                await dataModel.addUserToGroup(m.id, result.id);
            }
        } catch (e) {
            this.setState({ formErrorMessage: (e as Error).message });

            return;
        }

        this.popupRef.current?.close(false);
        this.setState({ editorMode: EditorMode.None, formGroupName: "", formGroupPassword: "", formErrorMessage: "" });

        await this.loadGroups();
        void NotificationCenter.showInfo(`Group "${name}" created.`);
    }

    private async handleSaveGroup(): Promise<void> {
        const { editingGroupId, formGroupPassword, formGroupAdminId, editingGroupMembers, groups } = this.state;
        const { dataModel } = this.props;

        const group = groups.find((g) => {
            return g.id === editingGroupId;
        });

        try {
            await dataModel.updateGroup(editingGroupId, {
                password: formGroupPassword || null,
                adminId: formGroupAdminId || null,
            });

            // Sync members: load current members, compute diff, apply changes.
            const currentMembers = await dataModel.listGroupMembers(editingGroupId);
            const currentIds = new Set(currentMembers.map((m) => {
                return m.id;
            }));
            const newIds = new Set(editingGroupMembers.map((m) => {
                return m.id;
            }));

            for (const m of currentMembers) {
                if (!newIds.has(m.id)) {
                    await dataModel.removeUserFromGroup(m.id, editingGroupId);
                }
            }

            for (const m of editingGroupMembers) {
                if (!currentIds.has(m.id)) {
                    await dataModel.addUserToGroup(m.id, editingGroupId);
                }
            }
        } catch (e) {
            this.setState({ formErrorMessage: (e as Error).message });

            return;
        }

        this.popupRef.current?.close(false);
        this.setState({
            editorMode: EditorMode.None,
            editingGroupId: 0,
            formErrorMessage: "",
            formGroupPassword: "",
            errorMessage: ""
        });
        await this.loadGroups();
        void NotificationCenter.showInfo(`Group "${group?.name ?? editingGroupId}" updated.`);
    }

    private openEditorPopup(target: HTMLElement): void {
        this.popupRef.current?.open(target.getBoundingClientRect());
    }

    /**
     * Returns all groups — both persisted and pending.
     *
     * @returns The merged group list.
     */
    private getAllGroups(): IGroupRow[] {
        const { groups, pendingGroups } = this.state;

        return [...groups, ...pendingGroups];
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
            adminId: null,
            hasPassword: false,
            lastLogin: null,
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
            users, editorMode, editingUserId, formUsername, formDisplayName, formPassword, formGroupIds
        } = this.state;

        const username = formUsername.trim();
        const displayName = formDisplayName.trim();

        const { dataModel } = this.props;

        if (editorMode === EditorMode.ResetPassword) {
            if (!formPassword || formPassword.length < 6) {
                this.setState({ formErrorMessage: "Password must be at least 6 characters." });

                return;
            }

            try {
                await dataModel.updateUser(editingUserId, { password: formPassword });
                this.popupRef.current?.close(false);
                this.setState({ editorMode: EditorMode.None, editingUserId: 0, formErrorMessage: "" });
                const targetUser = users.find((u) => {
                    return u.id === editingUserId;
                });
                void NotificationCenter.showInfo(`Password reset for @${targetUser?.username ?? editingUserId}.`);
            } catch (e) {
                this.setState({ formErrorMessage: (e as Error).message });
            }

            return;
        }

        if (!username) {
            this.setState({ formErrorMessage: "Username is required." });

            return;
        }

        if (username.length < 3) {
            this.setState({ formErrorMessage: "Username must be at least 3 characters." });

            return;
        }

        if (editorMode === EditorMode.Create) {
            if (!formPassword || formPassword.length < 6) {
                this.setState({ formErrorMessage: "Password must be at least 6 characters." });

                return;
            }

            try {
                // Persist pending groups first, resolve temporary IDs → real IDs.
                const idMap = await this.persistPendingGroups();

                const newId = await dataModel.createUser(
                    username, formPassword, displayName || username,
                );

                for (const groupId of formGroupIds) {
                    const realId = idMap.get(groupId) ?? groupId;

                    await dataModel.addUserToGroup(newId, realId);
                }

                void NotificationCenter.showInfo(`User "${displayName || username}" created.`);
            } catch (e) {
                this.setState({ formErrorMessage: (e as Error).message });

                return;
            }
        } else {
            try {
                // Persist pending groups first, resolve temporary IDs → real IDs.
                const idMap = await this.persistPendingGroups();

                await dataModel.updateUser(editingUserId, {
                    displayName: displayName || username,
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

                void NotificationCenter.showInfo(`User "${displayName || username}" updated.`);
            } catch (e) {
                this.setState({ errorMessage: (e as Error).message });

                return;
            }
        }

        this.popupRef.current?.close(false);
        this.setState({ pendingGroups: [], editorMode: EditorMode.None, editingUserId: 0, errorMessage: "" });
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
        const { dataModel } = this.props;
        const currentUser = dataModel.user;
        const isSelf = currentUser?.id === user.id;

        const description: string[] = [];

        if (isSelf) {
            description.push("You are about to delete your own account. You will be logged out immediately.");
        }

        const closure = await this.confirmDialogRef.current?.show(
            `Delete user "${user.displayName || user.username}"? This cannot be undone.`,
            { accept: "Delete" },
            "Delete User",
            description.length > 0 ? description : undefined,
            undefined,
            true,
        );

        if (closure !== DialogResponseClosure.Accept) {
            return;
        }

        try {
            await dataModel.deleteUser(user.id);
            void NotificationCenter.showInfo(`User "${user.displayName || user.username}" deleted.`);
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });

            return;
        }

        if (isSelf) {
            this.dialogRef.current?.close(true);
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            dataModel.reset();

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

    private handleClose = (): void => {
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

/**
 * Determines whether a hex color is considered "light" (for choosing contrasting text).
 * Uses relative luminance approximation.
 *
 * @param hex The hex color string (e.g. "#a1b2c3").
 * @returns True if the color is light.
 */
const isLightHex = (hex: string): boolean => {
    const raw = hex.replace("#", "");
    const r = parseInt(raw.substring(0, 2), 16) / 255;
    const g = parseInt(raw.substring(2, 4), 16) / 255;
    const b = parseInt(raw.substring(4, 6), 16) / 255;
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);

    return luminance > 0.5;
};

const userBadgeColors = [
    "#e06c75", "#d19a66", "#e5c07b", "#98c379", "#56b6c2",
    "#61afef", "#c678dd", "#be5046", "#7ec8a0", "#e091ca",
    "#5cacee", "#a9cce3", "#c39bd3", "#f0b27a", "#82e0aa",
];

/**
 * @param userId The user's ID.
 *
 * @returns A consistent badge color for the given user.
 */
const userBadgeColor = (userId: number): string => {
    return userBadgeColors[userId % userBadgeColors.length];
};
