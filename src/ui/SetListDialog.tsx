/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import type { IScoreListEntry, ISetListInfo } from "../core/DatabaseTypes.js";
import type {
    IGroupRow, ISetListChangeResult, ScoreBookDataModel,
} from "../core/ScoreBookDataModel.js";
import type { ITagOwnerScope } from "../core/types/tags.js";

/** What the dialog is doing with the selected list. */
enum SetListDialogMode {
    Browse,
    Create,
    Rename,
    ConfirmDelete,
}

export interface ISetListDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** The set lists the caller may select. */
    lists: readonly ISetListInfo[];

    /** The list that is active in the collection, which the dialog opens on. */
    activeId?: number;

    open: boolean;

    /** Called when the user closes the dialog. */
    onClose: () => void;

    /** Called when a list was created, deleted or selected and the collection has to follow. */
    onSelect: (id?: number) => void;
}

interface ISetListDialogState {
    groups: IGroupRow[];
    scopes: readonly ITagOwnerScope[];

    /** The list the detail panel shows. */
    selectedId?: number;

    mode: SetListDialogMode;
    nameDraft: string;
    ownerGroupId?: number;

    /** The readable members in the saved order, as the dialog last read them. */
    members: IScoreListEntry[];

    /** The readable scores that are not members yet, which the add field offers. */
    candidates: IScoreListEntry[];

    /** The candidate the add field currently names. */
    addScoreId?: number;

    /** The order the user is composing; it is stored only by the save button. */
    orderDraft: number[];

    /** The group access the user is composing, keyed by group id; a value of false means read access. */
    shareDraft: Map<number, boolean>;

    message?: string;

    /** The last change was rejected because somebody else had changed the list first. */
    conflict: boolean;

    busy: boolean;
}

/**
 * The dialog behind the set-list selector's manage button: create, rename, delete and share lists, add and remove
 * scores by assigning the list's tag, and order the members. Every backend rule stays authoritative; the dialog shows
 * read-only states for members of a shared or owning group and reports conflicts instead of overwriting them.
 */
export class SetListDialog extends UIComponent<ISetListDialogProperties, ISetListDialogState> {
    private readonly dialogRef = createRef<Dialog | null>();
    private dragScoreId?: number;

    public constructor(props: ISetListDialogProperties) {
        super(props);

        this.state = {
            groups: [],
            scopes: [],
            mode: SetListDialogMode.Browse,
            nameDraft: "",
            members: [],
            candidates: [],
            orderDraft: [],
            shareDraft: new Map(),
            conflict: false,
            busy: false,
        };
    }

    public override componentDidMount(): void {
        if (this.props.open) {
            this.dialogRef.current?.open();
            void this.initialize();
        }
    }

    public override componentDidUpdate(previousProperties: ISetListDialogProperties): void {
        const { open, lists } = this.props;

        if (open !== previousProperties.open) {
            if (open) {
                this.dialogRef.current?.open();
                void this.initialize();
            } else {
                this.dialogRef.current?.close(true);
            }

            return;
        }

        if (open && lists !== previousProperties.lists) {
            this.handleCatalogueChange();
        }
    }

    public render(): ComponentChild {
        const { open, lists } = this.props;
        const { message, conflict, mode } = this.state;
        const selected = this.selectedList();
        const listButtons = lists.map((list) => {
            return this.renderListButton(list);
        });

        const banner = this.renderBanner(message, conflict);
        let detail: ComponentChild;
        switch (mode) {
            case SetListDialogMode.Create: {
                detail = this.renderCreateForm();
                break;
            }

            case SetListDialogMode.Rename: {
                detail = this.renderRenameForm();
                break;
            }

            case SetListDialogMode.ConfirmDelete: {
                detail = this.renderDeleteConfirm();
                break;
            }

            case SetListDialogMode.Browse: {
                detail = selected === undefined ? this.renderEmptyDetail() : this.renderDetail(selected);
                break;
            }
        }

        return (
            <Dialog
                id="setListDialog"
                ref={this.dialogRef}
                className="set-list-dialog"
                ariaLabel="Set lists"
                closeOnBackdropClick={true}
                onClose={this.handleDialogClose}
            >
                <Container id="setListDialogContent" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Stretch}>
                    <Container className="set-list-dialog-sidebar" orientation={Orientation.TopDown}>
                        <Label heading={true}>Set lists</Label>
                        {banner}
                        <Container className="set-list-dialog-lists" orientation={Orientation.TopDown}>
                            {listButtons}
                        </Container>
                        <Button id="setListCreate" className="set-list-dialog-button" title="Create a set list"
                            disabled={!open || this.state.scopes.length === 0} onClick={this.handleCreateClick}>
                            <Icon src={UIIcon.Add} />
                            <span>New set list</span>
                        </Button>
                    </Container>
                    <Container className="set-list-dialog-detail" orientation={Orientation.TopDown}>
                        {detail}
                    </Container>
                </Container>
            </Dialog>
        );
    }

    /**
     * @param list The list to show in the sidebar.
     *
     * @returns The sidebar entry as a button.
     */
    private renderListButton(list: ISetListInfo): ComponentChild {
        const { selectedId } = this.state;
        const selected = list.id === selectedId;

        return (
            <button
                key={list.id}
                id={`setListEntry-${list.id}`}
                type="button"
                className={selected ? "set-list-entry set-list-entry-selected" : "set-list-entry"}
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                    void this.selectList(list.id);
                }}
            >
                <span className="set-list-entry-name">{list.name}</span>
                <span className="set-list-entry-count">{list.memberCount}</span>
            </button>
        );
    }

    private renderBanner(message: string | undefined, conflict: boolean): ComponentChild {
        if (message === undefined) {
            return undefined;
        }

        return (
            <Label className={conflict ? "set-list-dialog-message set-list-dialog-conflict"
                : "set-list-dialog-message"} caption={message} wrap={true} />
        );
    }

    private renderEmptyDetail(): ComponentChild {
        return <Label className="set-list-dialog-hint" caption="Select a set list to see its scores." wrap={true} />;
    }

    /**
     * @param list The selected list.
     *
     * @returns The detail panel: name, owner and rights, then sharing and membership when the caller may edit.
     */
    private renderDetail(list: ISetListInfo): ComponentChild {
        const owner = this.ownerCaption(list);
        const actions = this.renderDetailActions(list);
        const hint = list.editable
            ? undefined
            : <Label className="set-list-dialog-hint" wrap={true}
                caption="You can select this list but not change it." />;

        let sharing: ComponentChild = undefined;
        let membership: ComponentChild = undefined;
        if (list.managesAccess) {
            sharing = this.renderSharing(list);
        }

        if (list.editable) {
            membership = this.renderMembership(list);
        }

        return (
            <Container className="set-list-detail-panel" orientation={Orientation.TopDown}>
                <Container className="set-list-detail-header" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Label heading={true} caption={list.name} />
                    <Label className="set-list-detail-owner" caption={owner} />
                    {actions}
                </Container>
                {hint}
                {sharing}
                {membership}
            </Container>
        );
    }

    private renderDetailActions(list: ISetListInfo): ComponentChild {
        if (!list.editable) {
            return undefined;
        }

        return (
            <Container className="set-list-detail-actions" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button id="setListRename" imageOnly={true} title="Rename the set list"
                    onClick={this.handleRenameClick}>
                    <Icon src={UIIcon.Edit} />
                </Button>
                <Button id="setListDelete" imageOnly={true} title="Delete the set list"
                    onClick={this.handleDeleteClick}>
                    <Icon src={UIIcon.Trash} />
                </Button>
            </Container>
        );
    }

    /**
     * @param list The selected list.
     *
     * @returns The access section: one access level per group, and a save button for the draft. Groups with write
     * access can change the list, exactly like a group with write access to a score.
     */
    private renderSharing(list: ISetListInfo): ComponentChild {
        const { groups, shareDraft } = this.state;
        const shareable = groups.filter((group) => {
            return group.name !== "World" && group.name !== "Admins";
        });

        const rows = shareable.map((group) => {
            const level = shareDraft.get(group.id);

            return (
                <label key={group.id} className="set-list-share-row">
                    <span className="set-list-share-name">{group.name}</span>
                    <select className="set-list-access-select" aria-label={`Access for ${group.name}`}
                        value={level === undefined ? "none" : level ? "write" : "read"}
                        onChange={(event) => {
                            this.setShareLevel(group.id, (event.target as HTMLSelectElement).value);
                        }}>
                        <option value="none">No access</option>
                        <option value="read">Read</option>
                        <option value="write">Write</option>
                    </select>
                </label>
            );
        });

        if (rows.length === 0) {
            return (
                <Label className="set-list-dialog-hint"
                    caption="There is no other group to grant access to." />
            );
        }

        return (
            <Container className="set-list-share" orientation={Orientation.TopDown}>
                <Label caption="Group access" />
                <Label className="set-list-dialog-hint" wrap={true}
                    caption="Groups with write access can change the list, its scores and its order." />
                {rows}
                <Button id="setListShareSave" className="set-list-dialog-button" title="Save the group access"
                    disabled={this.state.busy} onClick={this.handleShareSave}>
                    <Icon src={UIIcon.Save} />
                    <span>Save access</span>
                </Button>
            </Container>
        );
    }

    /**
     * @param list The selected list.
     *
     * @returns The membership section: the ordered member rows with drag and keyboard controls, and the add field.
     */
    private renderMembership(list: ISetListInfo): ComponentChild {
        const { members, orderDraft, busy } = this.state;
        const byId = new Map(members.map((entry) => {
            return [entry.id, entry] as [number, IScoreListEntry];
        }));

        const rows = orderDraft.map((scoreId, index) => {
            const entry = byId.get(scoreId);

            return this.renderMemberRow(list, scoreId, entry, index, orderDraft.length);
        });

        return (
            <Container className="set-list-members" orientation={Orientation.TopDown}>
                <Label caption={`Scores in this list (${orderDraft.length})`} />
                <Container className="set-list-member-rows" orientation={Orientation.TopDown}>
                    {rows}
                </Container>
                <Container className="set-list-order-actions" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Button id="setListOrderSave" className="set-list-dialog-button" title="Save the order"
                        disabled={busy} onClick={this.handleOrderSave}>
                        <Icon src={UIIcon.Save} />
                        <span>Save order</span>
                    </Button>
                    <Button id="setListOrderReset" className="set-list-dialog-button" title="Discard the order change"
                        disabled={busy} onClick={this.handleOrderReset}>
                        <span>Cancel</span>
                    </Button>
                </Container>
                {this.renderAddRow()}
            </Container>
        );
    }

    /**
     * @param list The selected list.
     * @param scoreId The member to render.
     * @param entry The score entry behind it, if it is known.
     * @param index Its position in the draft.
     * @param count How many members there are.
     *
     * @returns One member row, draggable and operable by keyboard.
     */
    private renderMemberRow(list: ISetListInfo, scoreId: number, entry: IScoreListEntry | undefined, index: number,
        count: number): ComponentChild {
        const name = entry?.name ?? `#${scoreId}`;

        return (
            <div
                key={scoreId}
                className="set-list-member-row"
                draggable={true}
                onDragStart={() => {
                    this.dragScoreId = scoreId;
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                }}
                onDrop={() => {
                    this.dropOn(scoreId);
                }}
            >
                <span className="set-list-member-handle" aria-hidden="true">≡</span>
                <span className="set-list-member-position">{index + 1}</span>
                <span className="set-list-member-name">{name}</span>
                <Container className="set-list-member-actions" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Button imageOnly={true} title={`Move ${name} up`} disabled={index === 0}
                        onClick={() => {
                            this.moveMember(scoreId, -1);
                        }}>
                        <Icon src={UIIcon.ArrowUp} />
                    </Button>
                    <Button imageOnly={true} title={`Move ${name} down`} disabled={index === count - 1}
                        onClick={() => {
                            this.moveMember(scoreId, 1);
                        }}>
                        <Icon src={UIIcon.ArrowDown} />
                    </Button>
                    <Button imageOnly={true} title={`Remove ${name} from the list`}
                        onClick={() => {
                            void this.removeMember(list, scoreId);
                        }}>
                        <Icon src={UIIcon.Trash} />
                    </Button>
                </Container>
            </div>
        );
    }

    /**
     * @returns The row that puts a readable score that is not a member yet into the list.
     */
    private renderAddRow(): ComponentChild {
        const { candidates, addScoreId } = this.state;
        if (candidates.length === 0) {
            return <Label className="set-list-dialog-hint" caption="Every readable score is already in this list." />;
        }

        const options = candidates.map((entry) => {
            return <option key={entry.id} value={entry.id}>{entry.name}</option>;
        });

        return (
            <Container className="set-list-add-row" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <select id="setListAddScore" className="set-list-add-select" aria-label="Score to add"
                    value={addScoreId ?? candidates[0].id}
                    onChange={(event) => {
                        this.setState({ addScoreId: Number((event.target as HTMLSelectElement).value) });
                    }}>
                    {options}
                </select>
                <Button id="setListAdd" className="set-list-dialog-button" title="Add the selected score"
                    onClick={this.handleAddMember}>
                    <Icon src={UIIcon.Add} />
                    <span>Add</span>
                </Button>
            </Container>
        );
    }

    private renderCreateForm(): ComponentChild {
        const { nameDraft, ownerGroupId, scopes, busy } = this.state;
        const options = scopes.map((scope) => {
            const caption = scope.groupId === undefined ? "Administrators (global)" : scope.name;

            return <option key={scope.groupId ?? "global"} value={scope.groupId ?? ""}>{caption}</option>;
        });

        return (
            <Container className="set-list-create" orientation={Orientation.TopDown}>
                <Label heading={true} caption="New set list" />
                <Label caption="Name" />
                <input id="setListName" className="set-list-name-input" type="text" value={nameDraft}
                    aria-label="Set list name"
                    onInput={(event) => {
                        this.setState({ nameDraft: (event.target as HTMLInputElement).value });
                    }} />
                <Label caption="Tag catalogue" />
                <Label className="set-list-dialog-hint" wrap={true}
                    caption="Where the list's tag lives. Ownership and access are assigned after creating it." />
                <select id="setListOwner" className="set-list-owner-select" aria-label="Tag catalogue"
                    value={ownerGroupId ?? ""}
                    onChange={(event) => {
                        const value = (event.target as HTMLSelectElement).value;
                        this.setState({ ownerGroupId: value === "" ? undefined : Number(value) });
                    }}>
                    {options}
                </select>
                <Container className="set-list-order-actions" orientation={Orientation.LeftToRight}>
                    <Button id="setListCreateSave" className="set-list-dialog-button" title="Create the set list"
                        disabled={busy} onClick={this.handleCreateSave}>
                        <span>Create</span>
                    </Button>
                    <Button id="setListCreateCancel" className="set-list-dialog-button" title="Discard the new list"
                        disabled={busy} onClick={this.handleCancelMode}>
                        <span>Cancel</span>
                    </Button>
                </Container>
            </Container>
        );
    }

    private renderRenameForm(): ComponentChild {
        const { nameDraft, busy } = this.state;

        return (
            <Container className="set-list-create" orientation={Orientation.TopDown}>
                <Label heading={true} caption="Rename set list" />
                <Label caption="Name" />
                <input id="setListRenameName" className="set-list-name-input" type="text" value={nameDraft}
                    aria-label="Set list name"
                    onInput={(event) => {
                        this.setState({ nameDraft: (event.target as HTMLInputElement).value });
                    }} />
                <Container className="set-list-order-actions" orientation={Orientation.LeftToRight}>
                    <Button id="setListRenameSave" className="set-list-dialog-button" title="Save the name"
                        disabled={busy} onClick={this.handleRenameSave}>
                        <span>Save</span>
                    </Button>
                    <Button id="setListRenameCancel" className="set-list-dialog-button" title="Discard the new name"
                        disabled={busy} onClick={this.handleCancelMode}>
                        <span>Cancel</span>
                    </Button>
                </Container>
            </Container>
        );
    }

    private renderDeleteConfirm(): ComponentChild {
        const { busy } = this.state;
        const list = this.selectedList();
        const name = list?.name ?? "";

        return (
            <Container className="set-list-create" orientation={Orientation.TopDown}>
                <Label heading={true} caption="Delete set list" />
                <Label wrap={true} caption={`Delete "${name}"? Its tag is removed from every score.`} />
                <Container className="set-list-order-actions" orientation={Orientation.LeftToRight}>
                    <Button id="setListDeleteConfirm" className="set-list-dialog-button" title="Delete the set list"
                        disabled={busy} onClick={this.handleDeleteConfirm}>
                        <Icon src={UIIcon.Trash} />
                        <span>Delete</span>
                    </Button>
                    <Button id="setListDeleteCancel" className="set-list-dialog-button" title="Keep the set list"
                        disabled={busy} onClick={this.handleCancelMode}>
                        <span>Cancel</span>
                    </Button>
                </Container>
            </Container>
        );
    }

    /**
     * @param list The selected list.
     *
     * @returns A caption that names the owner, exactly as a score names its owner.
     */
    private ownerCaption(list: ISetListInfo): string {
        return list.ownerName === undefined ? "No owner" : `Owner: ${list.ownerName}`;
    }

    private selectedList(): ISetListInfo | undefined {
        const { lists } = this.props;
        const { selectedId } = this.state;

        return lists.find((list) => {
            return list.id === selectedId;
        });
    }

    private async initialize(): Promise<void> {
        const { dataModel, activeId, lists } = this.props;
        const groups = await dataModel.listGroups().catch(() => {
            return [];
        });

        const selectedId = lists.some((list) => {
            return list.id === activeId;
        }) ? activeId : (lists.length > 0 ? lists[0].id : undefined);

        this.setState({
            groups,
            scopes: dataModel.tagOwnerScopes,
            selectedId,
            mode: SetListDialogMode.Browse,
            message: undefined,
            conflict: false,
        });

        if (selectedId !== undefined) {
            await this.loadList(selectedId);
        }
    }

    private async selectList(id: number): Promise<void> {
        this.setState({ selectedId: id, mode: SetListDialogMode.Browse, message: undefined, conflict: false });
        await this.loadList(id);
    }

    /**
     * Follows a catalogue that changed while the dialog is open: a list that was deleted or left the caller's reach
     * is named, and the dialog falls back to the first list that is still there.
     */
    private handleCatalogueChange(): void {
        const { lists } = this.props;
        const { selectedId } = this.state;

        if (selectedId !== undefined && lists.some((list) => {
            return list.id === selectedId;
        })) {
            return;
        }

        const nextId = lists.length > 0 ? lists[0].id : undefined;

        this.setState({
            selectedId: nextId,
            mode: SetListDialogMode.Browse,
            message: selectedId === undefined ? undefined : "This set list is no longer available.",
            conflict: false,
        });

        if (nextId !== undefined) {
            void this.loadList(nextId);
        }
    }

    /**
     * Reads the members and the addable scores of a list and resets the drafts to what the backend holds.
     *
     * @param id The list to read.
     */
    private async loadList(id: number): Promise<void> {
        const { dataModel, lists } = this.props;
        const list = lists.find((candidate) => {
            return candidate.id === id;
        });

        const [members, readable] = await Promise.all([
            dataModel.loadSetListScores(id),
            dataModel.listReadableScores(),
        ]);

        const memberIds = new Set(members.map((entry) => {
            return entry.id;
        }));

        this.setState({
            members,
            candidates: readable.filter((entry) => {
                return !memberIds.has(entry.id);
            }),
            orderDraft: members.map((entry) => {
                return entry.id;
            }),
            shareDraft: new Map((list?.groups ?? []).map((group) => {
                return [group.groupId, group.writable] as [number, boolean];
            })),
            addScoreId: undefined,
        });
    }

    /**
     * @param groupId The group whose access changes.
     * @param level The selected level: none, read or write.
     */
    private setShareLevel(groupId: number, level: string): void {
        const next = new Map(this.state.shareDraft);

        if (level === "none") {
            next.delete(groupId);
        } else {
            next.set(groupId, level === "write");
        }

        this.setState({ shareDraft: next });
    }

    private moveMember(scoreId: number, delta: number): void {
        const { orderDraft } = this.state;
        const index = orderDraft.indexOf(scoreId);
        const target = index + delta;

        if (index < 0 || target < 0 || target >= orderDraft.length) {
            return;
        }

        const next = [...orderDraft];
        next.splice(index, 1);
        next.splice(target, 0, scoreId);
        this.setState({ orderDraft: next });
    }

    private dropOn(targetId: number): void {
        const { orderDraft } = this.state;
        const sourceId = this.dragScoreId;
        this.dragScoreId = undefined;

        if (sourceId === undefined || sourceId === targetId) {
            return;
        }

        const next = orderDraft.filter((scoreId) => {
            return scoreId !== sourceId;
        });
        const target = next.indexOf(targetId);
        next.splice(target, 0, sourceId);
        this.setState({ orderDraft: next });
    }

    private handleCreateClick = (): void => {
        const { scopes } = this.state;
        if (scopes.length === 0) {
            return;
        }

        this.setState({
            mode: SetListDialogMode.Create,
            nameDraft: "",
            ownerGroupId: scopes[0].groupId,
            message: undefined,
            conflict: false,
        });
    };

    private handleRenameClick = (): void => {
        const list = this.selectedList();

        this.setState({
            mode: SetListDialogMode.Rename,
            nameDraft: list?.name ?? "",
            message: undefined,
            conflict: false,
        });
    };

    private handleDeleteClick = (): void => {
        this.setState({ mode: SetListDialogMode.ConfirmDelete, message: undefined, conflict: false });
    };

    private handleCancelMode = (): void => {
        this.setState({ mode: SetListDialogMode.Browse, message: undefined, conflict: false });
    };

    private handleCreateSave = (): void => {
        void this.createList();
    };

    private async createList(): Promise<void> {
        const { dataModel, onSelect } = this.props;
        const { nameDraft, ownerGroupId } = this.state;
        const name = nameDraft.trim();

        if (name.length === 0) {
            this.setState({ message: "A set list needs a name.", conflict: false });

            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.createSetList(name, ownerGroupId);
        this.setState({ busy: false });

        if (!result.success || result.id === undefined) {
            this.setState({ message: result.error ?? "The set list could not be created.", conflict: false });

            return;
        }

        this.setState({ mode: SetListDialogMode.Browse, selectedId: result.id, message: undefined, conflict: false });
        await this.loadList(result.id);
        onSelect(result.id);
    }

    private handleRenameSave = (): void => {
        void this.renameList();
    };

    private async renameList(): Promise<void> {
        const { dataModel } = this.props;
        const list = this.selectedList();
        const name = this.state.nameDraft.trim();

        if (list === undefined) {
            return;
        }

        if (name.length === 0) {
            this.setState({ message: "A set list needs a name.", conflict: false });

            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.renameSetList(list.id, list.revision, name);
        this.setState({ busy: false });
        await this.reportChange(result, SetListDialogMode.Browse);
    }

    private handleDeleteConfirm = (): void => {
        void this.deleteList();
    };

    private async deleteList(): Promise<void> {
        const { dataModel, lists, onSelect, activeId } = this.props;
        const list = this.selectedList();

        if (list === undefined) {
            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.deleteSetList(list.id);
        this.setState({ busy: false });

        if (!result.success) {
            this.setState({ message: result.error ?? "The set list could not be deleted.", conflict: false });

            return;
        }

        const remaining = lists.filter((candidate) => {
            return candidate.id !== list.id;
        });
        const nextId = remaining.length > 0 ? remaining[0].id : undefined;

        if (activeId === list.id) {
            onSelect(undefined);
        }

        this.setState({ mode: SetListDialogMode.Browse, selectedId: nextId, message: undefined, conflict: false });
        if (nextId !== undefined) {
            await this.loadList(nextId);
        }
    }

    private handleShareSave = (): void => {
        void this.saveSharing();
    };

    private async saveSharing(): Promise<void> {
        const { dataModel } = this.props;
        const list = this.selectedList();
        const { shareDraft } = this.state;

        if (list === undefined) {
            return;
        }

        const current = new Map(list.groups.map((group) => {
            return [group.groupId, group.writable] as [number, boolean];
        }));

        const added: Array<{ groupId: number; writable: boolean; }> = [];
        const removed: number[] = [];

        for (const [groupId, writable] of shareDraft) {
            if (current.get(groupId) !== writable) {
                added.push({ groupId, writable });

                // A write grant cannot be lowered by re-adding it, so the old row is dropped first.
                if (current.get(groupId) === true) {
                    removed.push(groupId);
                }
            }
        }

        for (const groupId of current.keys()) {
            if (!shareDraft.has(groupId)) {
                removed.push(groupId);
            }
        }

        if (added.length === 0 && removed.length === 0) {
            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.changeSetListAccess(list.id, list.revision, added, removed);
        this.setState({ busy: false });
        await this.reportChange(result, SetListDialogMode.Browse);
    }

    private handleOrderSave = (): void => {
        void this.saveOrder();
    };

    private async saveOrder(): Promise<void> {
        const { dataModel } = this.props;
        const list = this.selectedList();

        if (list === undefined) {
            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.reorderSetList(list.id, list.revision, this.state.orderDraft);
        this.setState({ busy: false });
        await this.reportChange(result, SetListDialogMode.Browse);
    }

    private handleOrderReset = (): void => {
        const { members } = this.state;

        this.setState({
            orderDraft: members.map((entry) => {
                return entry.id;
            }),
            message: undefined,
            conflict: false,
        });
    };

    private handleAddMember = (): void => {
        void this.addMember();
    };

    private async addMember(): Promise<void> {
        const { dataModel } = this.props;
        const list = this.selectedList();
        const { candidates, addScoreId } = this.state;
        const scoreId = addScoreId ?? (candidates.length > 0 ? candidates[0].id : undefined);

        if (list === undefined || scoreId === undefined) {
            return;
        }

        this.setState({ busy: true, addScoreId: undefined });
        const assigned = await dataModel.assignTag(scoreId, list.tagId);
        this.setState({ busy: false });

        if (!assigned) {
            this.setState({ message: "The score could not be added.", conflict: false });

            return;
        }

        await this.loadList(list.id);
    }

    private async removeMember(list: ISetListInfo, scoreId: number): Promise<void> {
        const { dataModel } = this.props;

        this.setState({ busy: true });
        const removed = await dataModel.unassignTag(scoreId, list.tagId);
        this.setState({ busy: false });

        if (!removed) {
            this.setState({ message: "The score could not be removed.", conflict: false });

            return;
        }

        await this.loadList(list.id);
    }

    /**
     * @param result What the backend answered to a change.
     * @param mode The mode to fall back to when the change worked.
     */
    private async reportChange(result: ISetListChangeResult, mode: SetListDialogMode): Promise<void> {
        const list = this.selectedList();

        if (!result.success) {
            this.setState({
                message: result.conflict
                    ? "The set list was changed in the meantime. Its current state is loaded again."
                    : result.error ?? "The change was refused.",
                conflict: result.conflict === true,
            });

            if (result.conflict && list !== undefined) {
                await this.loadList(list.id);
            }

            return;
        }

        this.setState({ mode, message: undefined, conflict: false });
        if (list !== undefined) {
            await this.loadList(list.id);
        }
    }

    /**
     * Runs when the dialog closed itself, which Escape and a click beside it do. A close the app requested is
     * already known there, so only a self-close is reported.
     */
    private handleDialogClose = (): void => {
        const { open, onClose } = this.props;

        if (open) {
            onClose();
        }
    };
}
