/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, ComponentPlacement, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { Popup } from "../components/ui/framework/Popup.js";
import type {
    IGroupRow, ISbDmPermissionInfo, ISbDmScore, ISbDmScoreFolder, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import { SbDmEntityType } from "../core/ScoreBookDataModel.js";
import type { Mutable } from "../core/types/general.js";

/** The well-known name of the World group, matching the backend constant. */
const worldGroupName = "World";

/** The well-known name of the Admins group. Admins have full access — exclude from the pool. */
const adminGroupName = "Admins";

interface IPermissionEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** Called after permissions are saved, with the updated entry. */
    onSaved: (entry: ISbDmScoreFolder | ISbDmScore) => void;
}

interface IPermissionEditorState {
    errorMessage: string;

    /** The entry whose permissions we are editing. */
    entry?: ISbDmScoreFolder | ISbDmScore;

    ownerName: string;
    allGroups: IGroupRow[];

    /** Group IDs with read access. */
    readGroupIds: Set<number>;

    /** Group IDs with write access (subset of readGroupIds). */
    writeGroupIds: Set<number>;
}

const dragType = "application/x-perm-group";

export class PermissionEditor extends UIComponent<IPermissionEditorProperties, IPermissionEditorState> {
    private popupRef = createRef<Popup>();
    private dragGroupId: number | undefined;

    public constructor(props: IPermissionEditorProperties) {
        super(props);

        this.state = {
            errorMessage: "",
            ownerName: "",
            allGroups: [],
            readGroupIds: new Set(),
            writeGroupIds: new Set(),
        };
    }

    /**
     * Opens the permission editor for the given score library entry.
     *
     * @param target The DOM element or rect to anchor the popup to.
     * @param entry  The data model entry whose permissions are being edited.
     */
    public async open(target: HTMLElement | DOMRect,
        entry: ISbDmScoreFolder | ISbDmScore): Promise<void> {
        const { dataModel } = this.props;
        const entityType = entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score";

        this.setState({ errorMessage: "", entry }, () => {
            const rect = target instanceof DOMRect ? target : target.getBoundingClientRect();

            this.popupRef.current?.open(rect);
        });

        try {
            const [perm, users, groups] = await Promise.all([
                dataModel.getPermissions(entityType, entry.id),
                dataModel.listUsers(),
                dataModel.listGroups(),
            ]);

            let ownerName = "Inherited";

            if (perm?.ownerId != null) {
                const owner = users.find((u) => {
                    return u.id === perm.ownerId;
                });

                ownerName = owner ? owner.displayName : `User #${perm.ownerId}`;
            }

            const readGroupIds = new Set<number>();
            const writeGroupIds = new Set<number>();

            if (perm?.groups) {
                // The World group must never have write access.
                const worldGroup = groups.find((g) => {
                    return g.name === worldGroupName;
                });

                for (const g of perm.groups) {
                    readGroupIds.add(g.groupId);

                    if (g.writable && g.groupId !== worldGroup?.id) {
                        writeGroupIds.add(g.groupId);
                    }
                }
            }

            // Sync state with the entry's current perm (the single source of truth).
            // If the entry was edited before without closing, its perm already
            // reflects the latest saved state.
            if (entry.perm) {
                for (const id of entry.perm.groupIds) {
                    readGroupIds.add(id);
                }
            }

            this.setState({
                allGroups: groups.filter((g) => {
                    return g.name !== adminGroupName;
                }),
                readGroupIds,
                writeGroupIds,
                ownerName,
            });
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    }

    public render(): ComponentChild {
        const { errorMessage, ownerName, allGroups, readGroupIds, writeGroupIds } = this.state;

        const poolGroups = allGroups.filter((g) => {
            return !readGroupIds.has(g.id) && g.name !== adminGroupName;
        });

        const readGroups = allGroups.filter((g) => {
            return readGroupIds.has(g.id);
        });

        const writeGroups = allGroups.filter((g) => {
            return writeGroupIds.has(g.id);
        });

        return (
            <Popup
                id="permissionEditor"
                ref={this.popupRef}
                showArrow
                header={<Label id="permissionEditorHeader" caption={`Owner: ${ownerName}`} />}
                placement={ComponentPlacement.BottomCenter}
            >
                {errorMessage && <Label caption={errorMessage} />}
                {!errorMessage && (
                    <Container
                        className="perm-editor-layout"
                        orientation={Orientation.LeftToRight}
                        gap="12px"
                    >
                        <Container
                            className="perm-editor-left"
                            orientation={Orientation.TopDown}
                            gap="8px"
                        >
                            <Container orientation={Orientation.TopDown} gap="4px">
                                <Label caption="Read" className="perm-column-title" />
                                <div
                                    class="perm-drop-zone"
                                    onDragOver={this.handleDragOver}
                                    onDrop={this.handleDropOnRead}
                                >
                                    {readGroups.map((g) => {
                                        return this.renderGroupChip(g, false, () => {
                                            this.removeReadGroup(g.id);
                                        });
                                    })}
                                    {readGroups.length === 0 && (
                                        <span class="perm-drop-hint">Drop groups here</span>
                                    )}
                                </div>
                            </Container>

                            <Container orientation={Orientation.TopDown} gap="4px">
                                <Label caption="Write" className="perm-column-title" />
                                <div
                                    class="perm-drop-zone"
                                    onDragOver={this.handleDragOverWrite}
                                    onDrop={this.handleDropOnWrite}
                                >
                                    {writeGroups.map((g) => {
                                        return this.renderGroupChip(g, false, () => {
                                            this.removeWriteGroup(g.id);
                                        });
                                    })}
                                    {writeGroups.length === 0 && (
                                        <span class="perm-drop-hint">Drop groups here</span>
                                    )}
                                </div>
                            </Container>
                        </Container>

                        <Container
                            className="perm-editor-right"
                            orientation={Orientation.TopDown}
                            gap="4px"
                        >
                            <Label caption="Groups" className="perm-column-title" />
                            <div class="perm-group-pool">
                                {poolGroups.map((g) => {
                                    return this.renderGroupChip(g, true);
                                })}
                                {poolGroups.length === 0 && (
                                    <span class="perm-drop-hint">All groups assigned</span>
                                )}
                            </div>
                        </Container>
                    </Container>
                )}
            </Popup>
        );
    }

    private renderGroupChip(group: IGroupRow, draggable: boolean, onRemove?: () => void): ComponentChild {
        return (
            <span
                class="perm-chip"
                draggable={draggable}
                onDragStart={draggable ? (e) => {
                    this.handleDragStart(e, group.id);
                } : undefined}
                onDragEnd={draggable ? this.handleDragEnd : undefined}
                style={{ borderColor: group.color, backgroundColor: group.color + "20" }}
            >
                {group.name}
                {onRemove && (
                    <Button
                        imageOnly
                        className="perm-chip-remove"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                    >
                        <Icon src={Codicon.Close} />
                    </Button>
                )}
            </span>
        );
    }

    private handleDragStart = (e: DragEvent, groupId: number): void => {
        e.dataTransfer!.setData(dragType, String(groupId));
        (e.target as HTMLElement).classList.add("dragging");
        this.dragGroupId = groupId;
    };

    private handleDragEnd = (e: DragEvent): void => {
        (e.target as HTMLElement).classList.remove("dragging");
        this.dragGroupId = undefined;
    };

    private handleDropOnRead = (e: DragEvent): void => {
        e.preventDefault();
        const raw = e.dataTransfer?.getData(dragType);

        if (!raw) {
            return;
        }

        const groupId = Number(raw);

        if (!groupId) {
            return;
        }

        this.addGroup(groupId, false);
    };

    private handleDropOnWrite = (e: DragEvent): void => {
        e.preventDefault();
        const raw = e.dataTransfer?.getData(dragType);

        if (!raw) {
            return;
        }

        const groupId = Number(raw);

        if (!groupId) {
            return;
        }

        const group = this.state.allGroups.find((g) => {
            return g.id === groupId;
        });

        if (group?.name === worldGroupName) {
            return;
        }

        this.addGroup(groupId, true);
    };

    private handleDragOver = (e: DragEvent): void => {
        e.preventDefault();
    };

    private handleDragOverWrite = (e: DragEvent): void => {
        if (this.dragGroupId === undefined) {
            return;
        }

        const group = this.state.allGroups.find((g) => {
            return g.id === this.dragGroupId;
        });

        if (group?.name === worldGroupName) {
            e.dataTransfer!.dropEffect = "none";

            return;
        }

        e.preventDefault();
    };

    private addGroup(groupId: number, writable: boolean): void {
        const { readGroupIds, writeGroupIds } = this.state;

        const nextRead = new Set(readGroupIds);

        nextRead.add(groupId);

        const nextWrite = new Set(writeGroupIds);

        if (writable) {
            nextWrite.add(groupId);
        }

        this.setState({ readGroupIds: nextRead, writeGroupIds: nextWrite }, () => {
            void this.saveChanges();
        });
    }

    private removeReadGroup(groupId: number): void {
        const { readGroupIds, writeGroupIds } = this.state;

        const nextRead = new Set(readGroupIds);

        nextRead.delete(groupId);

        const nextWrite = new Set(writeGroupIds);

        nextWrite.delete(groupId);

        this.setState({ readGroupIds: nextRead, writeGroupIds: nextWrite }, () => {
            void this.saveChanges();
        });
    }

    private removeWriteGroup(groupId: number): void {
        const { writeGroupIds } = this.state;

        const nextWrite = new Set(writeGroupIds);

        nextWrite.delete(groupId);

        this.setState({ writeGroupIds: nextWrite }, () => {
            void this.saveChanges();
        });
    }

    private saveChanges = async (): Promise<void> => {
        const { dataModel, onSaved } = this.props;
        const { entry, readGroupIds, writeGroupIds, allGroups } = this.state;

        if (!entry) {
            return;
        }

        const entityType = entry.type === SbDmEntityType.ScoreFolder ? "folder" : "score";
        const prevGroupIds = entry.perm?.groupIds ?? [];
        const worldGroup = allGroups.find((g) => {
            return g.name === worldGroupName;
        });

        const addGroups: Array<{ groupId: number; writable: boolean; }> = [];

        for (const id of readGroupIds) {
            addGroups.push({ groupId: id, writable: id !== worldGroup?.id && writeGroupIds.has(id) });
        }

        const removeGroups: Array<{ groupId: number; }> = [];

        for (const id of prevGroupIds) {
            if (!readGroupIds.has(id)) {
                removeGroups.push({ groupId: id });
            }
        }

        try {
            await dataModel.setPermissions(entityType, entry.id, undefined,
                addGroups.length > 0 ? addGroups : undefined, removeGroups.length > 0 ? removeGroups : undefined);

            // Update the entry's perm directly — it is the single source of truth.
            // Only update fields affected by group drag operations.
            // canWrite, canRead, isOwner are user-relative and were set correctly by the backend.
            const perm = entry.perm as Mutable<ISbDmPermissionInfo>;

            perm.groupIds = [...readGroupIds];
            perm.isWorld = worldGroup !== undefined && readGroupIds.has(worldGroup.id);

            onSaved(entry);
        } catch (e) {
            this.setState({ errorMessage: (e as Error).message });
        }
    };
}
