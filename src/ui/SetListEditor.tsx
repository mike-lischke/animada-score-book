/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Badge } from "../components/ui/framework/Badge.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import type { IScoreListEntry, ISetListInfo } from "../core/DatabaseTypes.js";
import type { ScoreBookDataModel } from "../core/ScoreBookDataModel.js";
import { requisitions } from "../supplement/Requisitions.js";
import { ScoreMetaBadges } from "./ScoreMetaBadges.js";

export interface ISetListEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** The list to edit. Its revision is read on every save, so a change made in the meantime is reported. */
    list: ISetListInfo;

    /** Called with the ids of the members whenever they were read again, which the cards' checkboxes follow. */
    onMembershipChanged: (memberIds: ReadonlySet<number>) => void;

    /** Called when the editor is done, either after saving the order or when the user leaves it. */
    onClose: () => void;
}

interface ISetListEditorState {
    /** The readable members in the saved order, as the editor last read them. */
    members: IScoreListEntry[];

    /** The order the user is composing; only the save button stores it. */
    orderDraft: number[];

    /** The row being dragged, if any. */
    draggingId?: number;

    /** The row the pointer is over while another row is dragged, which marks where it would land. */
    dropTargetId?: number;

    busy: boolean;

    /** What the last change answered, or that it was refused. */
    message?: string;

    /** The order was refused because somebody else had changed the list first. */
    conflict: boolean;
}

/**
 * The running order of a set list, shown beside the score cards while the collection is in set-list edit mode. Its
 * rows are the members in the order the user composes, and the save button writes that order and leaves the edit
 * mode - exactly like saving a score leaves its edit mode. Membership itself is changed on the cards, which offer a
 * checkbox per score in this mode.
 */
export class SetListEditor extends UIComponent<ISetListEditorProperties, ISetListEditorState> {
    public constructor(props: ISetListEditorProperties) {
        super(props);

        this.state = {
            members: [],
            orderDraft: [],
            busy: false,
            conflict: false,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("setListsChanged", this.handleSetListsChanged);
        void this.loadMembers();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("setListsChanged", this.handleSetListsChanged);
    }

    public render(): ComponentChild {
        const { orderDraft, busy, message, conflict } = this.state;

        const countCaption = orderDraft.length === 1 ? "1 score" : `${orderDraft.length} scores`;
        const banner = this.renderBanner(message, conflict);
        const rows = this.renderRows();
        const actions = this.renderActions(busy);

        return (
            <Container id="setListEditor" className="set-list-editor" orientation={Orientation.TopDown}>
                <Container className="set-list-editor-header" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Label heading={true} caption="Running order" />
                    <Label className="set-list-editor-count" caption={countCaption} />
                </Container>
                <Label className="set-list-editor-hint" wrap={true}
                    caption="Drag a row or use the arrows to put the scores in the order the list plays." />
                {banner}
                {rows}
                {actions}
            </Container>
        );
    }

    /**
     * @param draft The order the user composed so far.
     * @param members The members as they were just read, in the saved order.
     *
     * @returns The draft without the scores that left the list, followed by the members that are new to it. The
     * composed order of the remaining rows stays, so removing a score does not undo the work done so far.
     */
    private static reconcile(draft: readonly number[], members: readonly IScoreListEntry[]): number[] {
        const present = new Set(members.map((entry) => {
            return entry.id;
        }));
        const known = new Set(draft);

        const kept = draft.filter((scoreId) => {
            return present.has(scoreId);
        });
        const added = members.filter((entry) => {
            return !known.has(entry.id);
        }).map((entry) => {
            return entry.id;
        });

        return [...kept, ...added];
    }

    /**
     * @param message What the last change answered, if anything.
     * @param conflict Whether the change was refused because the list had changed in the meantime.
     *
     * @returns The note above the rows, or nothing while there is nothing to report.
     */
    private renderBanner(message: string | undefined, conflict: boolean): ComponentChild {
        if (message === undefined) {
            return undefined;
        }

        const className = conflict
            ? "set-list-editor-message set-list-editor-conflict"
            : "set-list-editor-message";

        return <Label className={className} caption={message} wrap={true} />;
    }

    /**
     * @returns The member rows in the composed order, or a hint when the list holds no scores the caller may read.
     */
    private renderRows(): ComponentChild {
        const { members, orderDraft } = this.state;

        if (orderDraft.length === 0) {
            return (
                <Label className="set-list-editor-empty" wrap={true}
                    caption="This set list holds no scores yet. Tick a score on the left to add it." />
            );
        }

        const byId = new Map(members.map((entry) => {
            return [entry.id, entry] as [number, IScoreListEntry];
        }));

        const rows = orderDraft.map((scoreId, index) => {
            return this.renderRow(scoreId, byId.get(scoreId), index, orderDraft.length);
        });

        return (
            <Container className="set-list-editor-rows" orientation={Orientation.TopDown}>
                {rows}
            </Container>
        );
    }

    /**
     * @param scoreId The member to render.
     * @param entry The score entry behind it, if it is known.
     * @param index Its position in the composed order.
     * @param count How many members the list holds.
     *
     * @returns One row: the drag handle, the position, the score with its facts, and the controls that move or remove
     * it. The arrows are the alternative to dragging, so the order also changes without a pointer.
     */
    private renderRow(scoreId: number, entry: IScoreListEntry | undefined, index: number,
        count: number): ComponentChild {
        const { busy, draggingId, dropTargetId } = this.state;
        const name = entry?.name ?? `#${scoreId}`;

        const classes = ["set-list-editor-row"];
        if (draggingId === scoreId) {
            classes.push("set-list-editor-row-dragging");
        }

        if (dropTargetId === scoreId) {
            classes.push("set-list-editor-row-target");
        }

        const className = classes.join(" ");

        return (
            <Container
                key={scoreId}
                className={className}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                data-score-id={scoreId}
                draggable={!busy}
                onDragStart={() => {
                    this.handleDragStart(scoreId);
                }}
                onDragEnter={() => {
                    this.handleDragEnter(scoreId);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                }}
                onDragLeave={() => {
                    this.handleDragLeave(scoreId);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    this.handleDrop(scoreId);
                }}
                onDragEnd={this.handleDragEnd}
            >
                <Icon src={UIIcon.DragVertical} className="set-list-editor-handle" />
                <Badge className="set-list-editor-position" caption={String(index + 1)} />
                <Container className="set-list-editor-identity" orientation={Orientation.TopDown}>
                    <span className="set-list-editor-name" title={name}>{name}</span>
                    <ScoreMetaBadges meta={entry?.meta} />
                </Container>
                <Container className="set-list-editor-row-actions" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Button imageOnly={true} title={`Move ${name} up`} disabled={busy || index === 0}
                        onClick={() => {
                            this.move(scoreId, -1);
                        }}>
                        <Icon src={UIIcon.ArrowUp} />
                    </Button>
                    <Button imageOnly={true} title={`Move ${name} down`} disabled={busy || index === count - 1}
                        onClick={() => {
                            this.move(scoreId, 1);
                        }}>
                        <Icon src={UIIcon.ArrowDown} />
                    </Button>
                    <Button imageOnly={true} title={`Remove ${name} from the list`} disabled={busy}
                        onClick={() => {
                            void this.removeMember(scoreId);
                        }}>
                        <Icon src={UIIcon.Close} />
                    </Button>
                </Container>
            </Container>
        );
    }

    /**
     * @param busy Whether a change is on its way.
     *
     * @returns The save button, which also leaves the edit mode, and the button that leaves it without saving the
     * order.
     */
    private renderActions(busy: boolean): ComponentChild {
        const { onClose } = this.props;

        return (
            <Container className="set-list-editor-actions" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button id="setListEditorSave" className="set-list-editor-save"
                    title="Save the order and leave the editor" disabled={busy} onClick={this.handleSaveClick}>
                    <Icon src={UIIcon.Save} />
                    <span>Save order</span>
                </Button>
                <Button id="setListEditorClose" className="set-list-editor-close"
                    title="Leave the editor without saving the order" disabled={busy} onClick={onClose}>
                    <span>Close</span>
                </Button>
            </Container>
        );
    }

    /**
     * Reads the members again and reports them, so the cards' checkboxes follow what the backend holds.
     */
    private async loadMembers(): Promise<void> {
        const { dataModel, list, onMembershipChanged } = this.props;

        const members = await dataModel.loadSetListScores(list.id);
        const memberIds = new Set(members.map((entry) => {
            return entry.id;
        }));

        onMembershipChanged(memberIds);
        this.setState((previous) => {
            return { members, orderDraft: SetListEditor.reconcile(previous.orderDraft, members) };
        });
    }

    /**
     * @param scoreId The member to move.
     * @param delta How far it moves; a negative value moves it up.
     */
    private move(scoreId: number, delta: number): void {
        const { orderDraft } = this.state;
        const index = orderDraft.indexOf(scoreId);
        const target = index + delta;

        if (index < 0 || target < 0 || target >= orderDraft.length) {
            return;
        }

        const next = [...orderDraft];
        next.splice(index, 1);
        next.splice(target, 0, scoreId);

        this.setState({ orderDraft: next, message: undefined, conflict: false });
    }

    /**
     * @param scoreId The member to take out of the list. Its tag assignment is what the list holds, so removing the
     * member is unassigning the list's tag.
     */
    private async removeMember(scoreId: number): Promise<void> {
        const { dataModel, list } = this.props;

        this.setState({ busy: true, message: undefined, conflict: false });
        const removed = await dataModel.unassignTag(scoreId, list.tagId);
        this.setState({ busy: false });

        if (removed) {
            // The change reaches this editor through `setListsChanged`, which reads the members again.
            return;
        }

        this.setState({ message: "The score could not be removed from the list." });
    }

    /**
     * Writes the composed order. A stale revision is reported instead of overwriting what somebody else changed.
     */
    private async saveOrder(): Promise<void> {
        const { dataModel, list, onClose } = this.props;
        const { orderDraft } = this.state;

        this.setState({ busy: true, message: undefined, conflict: false });
        const result = await dataModel.reorderSetList(list.id, list.revision, orderDraft);
        this.setState({ busy: false });

        if (!result.success) {
            this.setState({
                message: result.conflict
                    ? "The set list was changed in the meantime. Its order is loaded again."
                    : result.error ?? "The order could not be saved.",
                conflict: result.conflict === true,
            });

            if (result.conflict) {
                await this.loadMembers();
            }

            return;
        }

        onClose();
    }

    private handleDragStart(scoreId: number): void {
        this.setState({ draggingId: scoreId, dropTargetId: undefined });
    }

    private handleDragEnter(scoreId: number): void {
        const { draggingId, dropTargetId } = this.state;

        if (draggingId !== undefined && scoreId !== dropTargetId) {
            this.setState({ dropTargetId: scoreId });
        }
    }

    private handleDragLeave(scoreId: number): void {
        if (this.state.dropTargetId === scoreId) {
            this.setState({ dropTargetId: undefined });
        }
    }

    private handleDragEnd = (): void => {
        this.setState({ draggingId: undefined, dropTargetId: undefined });
    };

    /**
     * @param targetId The row the dragged one was dropped on. It takes the position of that row.
     */
    private handleDrop(targetId: number): void {
        const { orderDraft, draggingId } = this.state;

        this.setState({ draggingId: undefined, dropTargetId: undefined });

        if (draggingId === undefined || draggingId === targetId) {
            return;
        }

        const next = orderDraft.filter((scoreId) => {
            return scoreId !== draggingId;
        });
        const target = next.indexOf(targetId);
        next.splice(target, 0, draggingId);

        this.setState({ orderDraft: next, message: undefined, conflict: false });
    }

    private handleSaveClick = (): void => {
        void this.saveOrder();
    };

    private handleSetListsChanged = (): Promise<boolean> => {
        void this.loadMembers();

        return Promise.resolve(true);
    };
}
