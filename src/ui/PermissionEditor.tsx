/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, ComponentPlacement, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { Popup } from "../components/ui/composites/Popup.js";
import type { IGroupRow, IUserRow, ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

interface IPermissionEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called after permissions are saved successfully. */
    onSaved: () => void;
}

interface IPermissionEditorState {
    loading: boolean;
    errorMessage: string;
    entityType: string;
    entityId: number;
    entityName: string;
    users: IUserRow[];
    groups: IGroupRow[];
    /** Whether permissions are inherited (no explicit row in DB). */
    inherited: boolean;
    /** Initial inherited perm bits for change detection. */
    inheritedOwnerPerm: number;
    inheritedGroupPerm: number;
    inheritedWorldPerm: number;
    ownerId: number | null;
    groupId: number | null;
    ownerRead: boolean;
    ownerWrite: boolean;
    groupRead: boolean;
    groupWrite: boolean;
    worldRead: boolean;
    worldWrite: boolean;
    saving: boolean;
}

export class PermissionEditor extends UIComponent<IPermissionEditorProperties, IPermissionEditorState> {
    private popupRef = createRef<Popup>();

    public constructor(props: IPermissionEditorProperties) {
        super(props);

        this.state = {
            loading: false,
            errorMessage: "",
            entityType: "",
            entityId: 0,
            entityName: "",
            users: [],
            groups: [],
            inherited: false,
            inheritedOwnerPerm: 0,
            inheritedGroupPerm: 0,
            inheritedWorldPerm: 0,
            ownerId: null,
            groupId: null,
            ownerRead: false,
            ownerWrite: false,
            groupRead: false,
            groupWrite: false,
            worldRead: false,
            worldWrite: false,
            saving: false,
        };
    }

    public async open(target: HTMLElement, entityType: string, entityId: number, entityName: string,
        inheritedPermBits?: number,
    ): Promise<void> {
        const { dataModel } = this.props;

        this.setState({
            loading: true, errorMessage: "",
            entityType, entityId, entityName, inherited: false,
        }, () => {
            this.popupRef.current?.open(target.getBoundingClientRect(), ComponentPlacement.RightCenter);
        });

        try {
            const [perm, users, groups] = await Promise.all([
                dataModel.getPermissions(entityType, entityId),
                dataModel.listUsers(),
                dataModel.listGroups(),
            ]);

            const filteredUsers = users.filter((u) => {
                return u.username !== "anonymous";
            });

            if (perm) {
                this.setState({
                    users: filteredUsers,
                    groups,
                    inherited: false,
                    ownerId: perm.ownerId,
                    groupId: perm.groupId,
                    ownerRead: (perm.ownerPerm & 4) !== 0,
                    ownerWrite: (perm.ownerPerm & 2) !== 0,
                    groupRead: (perm.groupPerm & 4) !== 0,
                    groupWrite: (perm.groupPerm & 2) !== 0,
                    worldRead: (perm.worldPerm & 4) !== 0,
                    worldWrite: (perm.worldPerm & 2) !== 0,
                    loading: false,
                });
            } else if (inheritedPermBits !== undefined) {
                const bits = inheritedPermBits;
                const o = (bits >> 6) & 0x7;
                const g = (bits >> 3) & 0x7;
                const w = bits & 0x7;

                this.setState({
                    users: filteredUsers,
                    groups,
                    inherited: true,
                    inheritedOwnerPerm: o,
                    inheritedGroupPerm: g,
                    inheritedWorldPerm: w,
                    ownerId: null,
                    groupId: null,
                    ownerRead: ((bits >> 6) & 4) !== 0,
                    ownerWrite: ((bits >> 6) & 2) !== 0,
                    groupRead: ((bits >> 3) & 4) !== 0,
                    groupWrite: ((bits >> 3) & 2) !== 0,
                    worldRead: (bits & 4) !== 0,
                    worldWrite: (bits & 2) !== 0,
                    loading: false,
                });
            } else {
                this.setState({ users: filteredUsers, groups, loading: false });
            }
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message, loading: false });
        }
    }

    public render(): ComponentChild {
        const { loading, errorMessage, entityName, users, groups, ownerId, groupId, ownerRead, ownerWrite, groupRead,
            groupWrite, worldRead, worldWrite, saving } = this.state;

        if (loading) {
            return (
                <Popup ref={this.popupRef} showArrow={true}>
                    <Label caption="Loading…" />
                </Popup>
            );
        }

        const ownerItems: IDropdownItem[] = [
            {
                label: "None",
                onClick: () => {
                    this.setState({ ownerId: null });
                },
            },
        ];

        for (const u of users) {
            ownerItems.push({
                label: `${u.displayName || u.username} (@${u.username})`,
                onClick: () => {
                    this.setState({ ownerId: u.id });
                },
            });
        }

        const ownerCaption = ownerId
            ? (users.find((u) => {
                return u.id === ownerId;
            })?.username ?? String(ownerId))
            : "None";

        const groupItems: IDropdownItem[] = [
            {
                label: "None",
                onClick: () => {
                    this.setState({ groupId: null });
                },
            },
        ];

        for (const g of groups) {
            groupItems.push({
                label: g.name,
                onClick: () => {
                    this.setState({ groupId: g.id });
                },
            });
        }

        const groupCaption = groupId
            ? (groups.find((g) => {
                return g.id === groupId;
            })?.name ?? String(groupId))
            : "None";

        const permRow = (label: string, read: boolean, write: boolean,
            onRead: (v: boolean) => void, onWrite: (v: boolean) => void,
        ): ComponentChild => {
            return (
                <Container
                    className="form-row"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Label className="form-row-label" caption={label} />
                    <Container
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        className="form-row-actions"
                    >
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            style={{ gap: "4px" }}
                        >
                            <Checkbox
                                checked={read}
                                onChange={(v) => {
                                    onRead(v);
                                }}
                            />
                            <Label caption="R" />
                        </Container>
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                            style={{ gap: "4px" }}
                        >
                            <Checkbox
                                checked={write}
                                onChange={(v) => {
                                    onWrite(v);
                                }}
                            />
                            <Label caption="W" />
                        </Container>
                    </Container>
                </Container>
            );
        };

        return (
            <Popup ref={this.popupRef} showArrow={true}>
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Key} style={{ fontSize: "20px", marginRight: "8px" }} />
                    {entityName}
                </Container>

                {errorMessage && (
                    <Container className="form-row">
                        <Label caption={errorMessage} className="text-error text-sm" />
                    </Container>
                )}

                <Container className="form-card" orientation={Orientation.TopDown}>
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <Label className="form-row-label" caption="Owner" />
                        <div style={{ flex: 1 }}>
                            <Dropdown
                                caption={ownerCaption}
                                items={ownerItems}
                                selectedItem={ownerCaption}
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
                        <Label className="form-row-label" caption="Group" />
                        <div style={{ flex: 1 }}>
                            <Dropdown
                                caption={groupCaption}
                                items={groupItems}
                                selectedItem={groupCaption}
                                closeOnSelect
                                style={{ width: "100%" }}
                            />
                        </div>
                    </Container>
                </Container>

                <Container className="form-card" orientation={Orientation.TopDown}>
                    {permRow("Owner", ownerRead, ownerWrite,
                        (v) => {
                            this.setState({ ownerRead: v });
                        },
                        (v) => {
                            this.setState({ ownerWrite: v });
                        },
                    )}
                    {permRow("Group", groupRead, groupWrite,
                        (v) => {
                            this.setState({ groupRead: v });
                        },
                        (v) => {
                            this.setState({ groupWrite: v });
                        },
                    )}
                    {permRow("World", worldRead, worldWrite,
                        (v) => {
                            this.setState({ worldRead: v });
                        },
                        (v) => {
                            this.setState({ worldWrite: v });
                        },
                    )}
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
                            caption="Save"
                            disabled={saving}
                            onClick={() => {
                                void this.handleSave();
                            }}
                        />
                    </Container>
                </Container>
            </Popup>
        );
    }

    private async handleSave(): Promise<void> {
        const { ownerId, groupId, ownerRead, ownerWrite, groupRead, groupWrite, worldRead, worldWrite,
            entityType, entityId, inherited, inheritedOwnerPerm, inheritedGroupPerm, inheritedWorldPerm,
        } = this.state;
        const { dataModel, onSaved } = this.props;

        const ownerPerm = (ownerRead ? 4 : 0) | (ownerWrite ? 2 : 0);
        const groupPerm = (groupRead ? 4 : 0) | (groupWrite ? 2 : 0);
        const worldPerm = (worldRead ? 4 : 0) | (worldWrite ? 2 : 0);

        // If inherited and nothing changed, just close without saving.
        if (inherited && ownerId === null && groupId === null
            && ownerPerm === inheritedOwnerPerm
            && groupPerm === inheritedGroupPerm
            && worldPerm === inheritedWorldPerm
        ) {
            this.popupRef.current?.close();

            return;
        }

        this.setState({ saving: true, errorMessage: "" });

        try {
            await dataModel.setPermissions(entityType, entityId, ownerId, groupId,
                ownerPerm, groupPerm, worldPerm);
            this.popupRef.current?.close();
            onSaved();
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message, saving: false });
        }
    }
}
