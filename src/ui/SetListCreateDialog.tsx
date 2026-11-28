/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Label } from "../components/ui/framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import type { ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

export interface ISetListCreateDialogProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    open: boolean;

    /** Called when the user closes the form without creating anything. */
    onClose: () => void;

    /** Called with the id of the list that was created, which the collection then selects. */
    onCreated: (id: number) => void;
}

interface ISetListCreateDialogState {
    name: string;

    /** The groups the list is shared with; none keeps it private to its creator. */
    sharedGroupIds: number[];

    /** The groups the list may be shared with, read when the form opens. */
    groups: Array<{ id: number; name: string; }>;

    /** Whether the group list was read; before that the form cannot say whether sharing is possible at all. */
    groupsLoaded: boolean;

    /** What the backend answered to the last attempt. */
    message?: string;

    busy: boolean;
}

/**
 * The form behind the toolbar's add button: a name and the groups the list is shared with. The creator owns the list
 * - the backend decides that, not a field here - and sharing grants reading only, so a list without a group stays
 * private to the caller who created it.
 */
export class SetListCreateDialog extends UIComponent<ISetListCreateDialogProperties, ISetListCreateDialogState> {
    private readonly dialogRef = createRef<Dialog | null>();

    public constructor(props: ISetListCreateDialogProperties) {
        super(props);

        this.state = { name: "", sharedGroupIds: [], groups: [], groupsLoaded: false, busy: false };
    }

    public override componentDidMount(): void {
        if (this.props.open) {
            this.openForm();
        }
    }

    public override componentDidUpdate(previousProperties: ISetListCreateDialogProperties): void {
        const { open } = this.props;

        if (open === previousProperties.open) {
            return;
        }

        if (open) {
            this.openForm();
        } else {
            this.dialogRef.current?.close(true);
        }
    }

    public render(): ComponentChild {
        const { name, groups, groupsLoaded, sharedGroupIds, message, busy } = this.state;

        const groupRows = groups.map((group) => {
            return (
                <Container key={group.id} className="set-list-create-group" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Checkbox
                        id={`setListShareGroup-${group.id}`}
                        checked={sharedGroupIds.includes(group.id)}
                        ariaLabel={group.name}
                        onChange={(chosen) => {
                            this.handleGroupToggle(group.id, chosen);
                        }}
                    />
                    <Label caption={group.name} />
                </Container>
            );
        });

        let shareHint: string;
        if (!groupsLoaded) {
            shareHint = "Reading the groups you may share the list with…";
        } else if (groups.length === 0) {
            shareHint = "You do not administer a group, so this list stays private to you.";
        } else {
            shareHint = "Members of the chosen groups may open the list. Without a group it stays private to you.";
        }

        let note: ComponentChild = undefined;
        if (message !== undefined) {
            note = (
                <Label id="setListCreateMessage" className="set-list-create-message" caption={message} wrap={true} />
            );
        }

        return (
            <Dialog
                id="setListCreateDialog"
                ref={this.dialogRef}
                className="set-list-create-dialog"
                ariaLabel="Add set list"
                closeOnBackdropClick={true}
                onClose={this.handleDialogClose}
            >
                <Container className="set-list-create-form" orientation={Orientation.TopDown}>
                    <Label heading={true} caption="New set list" />
                    <Label caption="Name" />
                    <input
                        id="setListCreateName"
                        className="set-list-create-name"
                        type="text"
                        aria-label="Name of the set list"
                        value={name}
                        onInput={this.handleNameInput}
                        onKeyDown={this.handleNameKeyDown}
                    />
                    <Label caption="Share with" />
                    <Label className="set-list-create-hint" wrap={true} caption={shareHint} />
                    <Container className="set-list-create-groups" orientation={Orientation.TopDown}>
                        {groupRows}
                    </Container>
                    {note}
                    <Container className="set-list-create-actions" orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}>
                        <Button id="setListCreateConfirm" isDefault={true} disabled={busy}
                            onClick={this.handleCreateClick}>
                            <span>Create</span>
                        </Button>
                        <Button id="setListCreateCancel" disabled={busy} onClick={this.props.onClose}>
                            <span>Cancel</span>
                        </Button>
                    </Container>
                </Container>
            </Dialog>
        );
    }

    private openForm(): void {
        this.setState({ name: "", sharedGroupIds: [], groups: [], groupsLoaded: false, busy: false });
        this.dialogRef.current?.open();
        void this.loadGroups();
    }

    /**
     * Reads the groups a list may be shared with. The form stays usable without them: a caller who answers for no
     * group creates a private list.
     */
    private async loadGroups(): Promise<void> {
        const groups = await this.props.dataModel.listShareGroups();

        this.setState({ groups, groupsLoaded: true });
    }

    private handleNameInput = (event: Event): void => {
        this.setState({ name: (event.currentTarget as HTMLInputElement).value, message: undefined });
    };

    /**
     * @param groupId The group whose tick changed.
     * @param chosen Whether the group is now one of the list's recipients.
     */
    private handleGroupToggle(groupId: number, chosen: boolean): void {
        this.setState((previous) => {
            const sharedGroupIds = chosen
                ? [...previous.sharedGroupIds, groupId]
                : previous.sharedGroupIds.filter((candidate) => {
                    return candidate !== groupId;
                });

            return { sharedGroupIds, message: undefined };
        });
    }

    /**
     * @param event The key press in the name field. Enter creates the list, so the form needs no second click.
     */
    private handleNameKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") {
            event.preventDefault();
            void this.createList();
        }
    };

    private handleCreateClick = (): void => {
        void this.createList();
    };

    private async createList(): Promise<void> {
        const { dataModel, onCreated } = this.props;
        const { name, sharedGroupIds } = this.state;
        const trimmed = name.trim();

        if (trimmed.length === 0) {
            this.setState({ message: "A set list needs a name." });

            return;
        }

        this.setState({ busy: true });
        const result = await dataModel.createSetList(trimmed, sharedGroupIds);
        this.setState({ busy: false });

        if (!result.success || result.id === undefined) {
            this.setState({ message: result.error ?? "The set list could not be created." });

            return;
        }

        onCreated(result.id);
    }

    /**
     * Runs when the form closed itself, which Escape and a press beside it do. A close the collection asked for is
     * already known there, so only a self-close is reported.
     */
    private handleDialogClose = (): void => {
        if (this.props.open) {
            this.props.onClose();
        }
    };
}
