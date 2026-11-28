/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Badge } from "../components/ui/framework/Badge.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Popup } from "../components/ui/framework/Popup.js";
import { PortalCloseReason, type IPortalProperties } from "../components/ui/framework/Portal.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, ChildWrap, Orientation } from "../components/ui/framework/ui-types.js";
import type { IScoreListEntry, ISetListInfo } from "../core/DatabaseTypes.js";
import { setListEntryNoteLimit } from "../core/DatabaseTypes.js";
import type { ScoreBookDataModel } from "../core/ScoreBookDataModel.js";
import {
    defaultSetListIconKey, isSetListIconKey, setListIconGroups, type SetListIconKey,
} from "../core/SetListIcons.js";
import { requisitions } from "../supplement/Requisitions.js";
import { ScoreMetaBadges } from "./ScoreMetaBadges.js";
import { setListGlyphOf, setListIconGlyphs } from "./SetListIconGlyphs.js";

export interface ISetListEditorProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /** The list to edit. Its revision is read on every save, so a change made in the meantime is reported. */
    list: ISetListInfo;

    /**
     * Counts the requests to leave the edit mode. The collection raises it when the edit switch is pressed, so the
     * editor can ask about pending changes before it goes.
     */
    closeRequest: number;

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

    /** Whether the editor asks what to do with a composed order before it goes. */
    confirming: boolean;

    /** The entry whose description is being edited, while the mini editor is open. */
    entryDraft?: { scoreId: number; note: string; icon: SetListIconKey; };

    busy: boolean;

    /** What the last change answered, or that it was refused. */
    message?: string;

    /** The order was refused because somebody else had changed the list first. */
    conflict: boolean;
}

/**
 * The running order of a set list, shown beside the score cards while the collection is in set-list edit mode. Its
 * rows are the members in the order the user composes. The edit switch of the toolbar leaves that mode, so the editor
 * asks there whether a composed order and an open description are to be saved instead of keeping buttons of its own.
 * Membership itself is changed on the cards, which offer a checkbox per score in this mode.
 */
export class SetListEditor extends UIComponent<ISetListEditorProperties, ISetListEditorState> {
    private readonly entryPopupRef = createRef<Popup | null>();

    /** Set while a description is on its way to the backend, so a close cannot start a second write. */
    private savingDraft = false;

    /**
     * The edit switch, while a draft is open. A press there leaves the edit mode, which asks about the draft, so it
     * must not count as the press beside the mini editor that stores it.
     */
    private entryAnchorArea?: HTMLElement;

    public constructor(props: ISetListEditorProperties) {
        super(props);

        this.state = {
            members: [],
            orderDraft: [],
            confirming: false,
            busy: false,
            conflict: false,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("setListsChanged", this.handleSetListsChanged);
        void this.loadMembers();
    }

    public override componentDidUpdate(previousProperties: ISetListEditorProperties): void {
        const { closeRequest } = this.props;

        if (closeRequest !== previousProperties.closeRequest) {
            this.handleCloseRequest();
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("setListsChanged", this.handleSetListsChanged);
    }

    public render(): ComponentChild {
        const { orderDraft, busy, message, conflict, confirming } = this.state;

        const countCaption = orderDraft.length === 1 ? "1 score" : `${orderDraft.length} scores`;
        const banner = this.renderBanner(message, conflict);
        const rows = this.renderRows();
        const question = confirming ? this.renderQuestion(busy) : undefined;
        const entryEditor = this.renderEntryEditor();

        return (
            <Container id="setListEditor" className="set-list-editor" orientation={Orientation.TopDown}>
                <Container className="set-list-editor-header" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <Label heading={true} caption="Running order" />
                    <Label className="set-list-editor-count" caption={countCaption} />
                </Container>
                <Label className="set-list-editor-hint" wrap={true}
                    caption="Drag a row or use the arrows to put the scores in the order the list plays." />
                {question}
                {banner}
                {rows}
                {entryEditor}
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
     * @returns The scrolling area of the editor: the member rows in the composed order, or a hint when the list holds
     * no scores the caller may read.
     */
    private renderRows(): ComponentChild {
        const { members, orderDraft } = this.state;

        let content: ComponentChild;
        if (orderDraft.length === 0) {
            content = (
                <Label className="set-list-editor-empty" wrap={true}
                    caption="This set list holds no scores yet. Tick a score on the left to add it." />
            );
        } else {
            const byId = new Map(members.map((entry) => {
                return [entry.id, entry] as [number, IScoreListEntry];
            }));

            content = orderDraft.map((scoreId, index) => {
                return this.renderRow(scoreId, byId.get(scoreId), index, orderDraft.length);
            });
        }

        return (
            <Container className="set-list-editor-rows" orientation={Orientation.TopDown}>
                {content}
            </Container>
        );
    }

    /**
     * @param scoreId The member to render.
     * @param entry The score entry behind it, if it is known.
     * @param index Its position in the composed order.
     * @param count How many members the list holds.
     *
     * @returns One compact entry: the drag handle, the position, the score with its facts and the controls that move
     * or remove it, and below them the description line with its icon and its edit button. The arrows are the
     * alternative to dragging, so the order also changes without a pointer.
     */
    private renderRow(scoreId: number, entry: IScoreListEntry | undefined, index: number,
        count: number): ComponentChild {
        const { busy: working, confirming, draggingId, dropTargetId } = this.state;
        const busy = working || confirming;
        const name = entry?.name ?? `#${scoreId}`;

        const classes = ["set-list-editor-row"];
        if (draggingId === scoreId) {
            classes.push("set-list-editor-row-dragging");
        }

        if (dropTargetId === scoreId) {
            classes.push("set-list-editor-row-target");
        }

        const className = classes.join(" ");
        const head = this.renderRowHead(scoreId, entry, name, index, count, busy);
        const foot = this.renderRowFoot(scoreId, entry, name, busy);

        return (
            <Container
                key={scoreId}
                className={className}
                orientation={Orientation.TopDown}
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
                {head}
                {foot}
            </Container>
        );
    }

    /**
     * @param scoreId The member to render.
     * @param entry The score entry behind it, if it is known.
     * @param name The name the controls name the score by.
     * @param index Its position in the composed order.
     * @param count How many members the list holds.
     * @param busy Whether a change is on its way.
     *
     * @returns The two lines of the entry: its position and name, then the facts the score states about itself.
     */
    private renderRowHead(scoreId: number, entry: IScoreListEntry | undefined, name: string, index: number,
        count: number, busy: boolean): ComponentChild {
        return (
            <Container className="set-list-editor-entry" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
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
     * @param scoreId The member whose description the line belongs to.
     * @param entry The score entry behind it, if it is known.
     * @param name The name the edit button names the score by.
     * @param busy Whether a change is on its way.
     *
     * @returns The line under the entry: its icon, its description or a hint that there is none, and the button that
     * opens the mini editor and stores what it holds on a second press.
     */
    private renderRowFoot(scoreId: number, entry: IScoreListEntry | undefined, name: string,
        busy: boolean): ComponentChild {
        const note = entry?.note ?? "";
        const icon = setListGlyphOf(entry?.icon);
        const buttonTitle = `Edit the description of ${name}`;

        let caption: ComponentChild;
        if (note.length > 0) {
            caption = <span className="set-list-editor-note" title={note}>{note}</span>;
        } else {
            caption = <span className="set-list-editor-note set-list-editor-note-empty">Add a description…</span>;
        }

        return (
            <Container className="set-list-editor-foot" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={icon} className="set-list-editor-foot-icon" />
                {caption}
                <Button id={`setListEntryEdit-${scoreId}`} className="set-list-editor-foot-edit" plain={true}
                    title={buttonTitle} disabled={busy}
                    onClick={(event) => {
                        this.handleEntryEdit(scoreId, entry, event);
                    }}>
                    <span>Edit</span>
                </Button>
            </Container>
        );
    }

    /**
     * @returns The mini editor of one entry: its description and the icon catalogue. The foot line's button opens it,
     * and both that button and a press beside the editor store what it holds; Escape drops the change. The popup stays
     * mounted, so its ref can open it; it shows nothing while no entry is being edited.
     */
    private renderEntryEditor(): ComponentChild {
        const { entryDraft } = this.state;

        let content: ComponentChild = undefined;
        if (entryDraft !== undefined) {
            const iconGroups = setListIconGroups.map((group) => {
                return this.renderIconGroup(group.caption, group.keys, entryDraft.icon);
            });

            content = (
                <Container className="set-list-entry-editor" orientation={Orientation.TopDown}>
                    <textarea
                        id="setListEntryNote"
                        className="set-list-entry-editor-note"
                        aria-label="Description of the entry"
                        placeholder="What happens here?"
                        rows={3}
                        maxLength={setListEntryNoteLimit}
                        value={entryDraft.note}
                        onInput={this.handleEntryNoteInput}
                    />
                    <Container className="set-list-entry-editor-icons" orientation={Orientation.TopDown}>
                        {iconGroups}
                    </Container>
                </Container>
            );
        }

        return (
            <Popup
                id="setListEntryEditor"
                ref={this.entryPopupRef}
                showArrow={true}
                focusOnOpen={true}
                placement={ComponentPlacement.BottomLeft}
                offset={6}
                anchorArea={this.entryAnchorArea}
                header={<Label caption="Description" />}
                onClose={this.handleEntryEditorClosed}
            >
                {content}
            </Popup>
        );
    }

    /**
     * @param caption The caption of the block.
     * @param keys The icons of that block.
     * @param chosen The icon the draft currently names.
     *
     * @returns One block of the icon picker.
     */
    private renderIconGroup(caption: string, keys: readonly SetListIconKey[],
        chosen: SetListIconKey): ComponentChild {
        const buttons = keys.map((key) => {
            const selected = key === chosen;
            const className = selected ? "set-list-icon-choice is-selected" : "set-list-icon-choice";

            return (
                <Button key={key} className={className} imageOnly={true} plain={true} title={key}
                    aria-pressed={selected}
                    onClick={() => {
                        this.pickEntryIcon(key);
                    }}>
                    <Icon src={setListIconGlyphs[key]} />
                </Button>
            );
        });

        return (
            <Container key={caption} className="set-list-icon-group" orientation={Orientation.TopDown}>
                <Label className="set-list-icon-group-caption" caption={caption} />
                <Container className="set-list-icon-row" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center} wrap={ChildWrap.Wrap}>
                    {buttons}
                </Container>
            </Container>
        );
    }

    /**
     * @param busy Whether a change is on its way.
     *
     * @returns The question about the changes: saving them, or leaving the edit mode without them.
     */
    private renderQuestion(busy: boolean): ComponentChild {
        return (
            <Container className="set-list-editor-question" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Label className="set-list-editor-question-caption" wrap={true} caption="Save the changes?" />
                <Button id="setListEditorSave" title="Save the changes and leave the editor" disabled={busy}
                    onClick={this.handleSaveClick}>
                    <Icon src={UIIcon.Save} />
                    <span>Save</span>
                </Button>
                <Button id="setListEditorDiscard" title="Leave the editor without the changes" disabled={busy}
                    onClick={this.handleDiscardClick}>
                    <span>Discard</span>
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
     * @returns Whether the composed order differs from the one the list has stored. Membership is applied as soon as
     * a checkbox is ticked, so the order is the only part of the sequence that can be lost by leaving the edit mode.
     */
    private hasOrderChanges(): boolean {
        const { members, orderDraft } = this.state;
        const saved = members.map((entry) => {
            return entry.id;
        });

        return orderDraft.length !== saved.length
            || orderDraft.some((scoreId, index) => {
                return scoreId !== saved[index];
            });
    }

    /**
     * @returns Whether the open draft says something the entry does not have yet. A draft that was merely opened and
     * left untouched holds nothing that is worth a question.
     */
    private hasDraftChanges(): boolean {
        const { members, entryDraft } = this.state;

        if (entryDraft === undefined) {
            return false;
        }

        const entry = members.find((candidate) => {
            return candidate.id === entryDraft.scoreId;
        });

        return entryDraft.note.trim() !== (entry?.note ?? "")
            || entryDraft.icon !== (entry?.icon ?? defaultSetListIconKey);
    }

    /**
     * @returns Whether leaving the edit mode would drop a composed order or an edited description.
     */
    private hasChanges(): boolean {
        return this.hasOrderChanges() || this.hasDraftChanges();
    }

    /**
     * Runs when the collection asks to leave the edit mode. Without a change the editor simply goes; otherwise it asks
     * whether to save the composed order and the open description first. The draft outlives the popup for that
     * question, which is why the popup is closed here instead of storing it as a press beside it would.
     */
    private handleCloseRequest(): void {
        if (!this.hasChanges()) {
            this.props.onClose();

            return;
        }

        this.setState({ confirming: true });
        this.entryPopupRef.current?.close(true);
    }

    /**
     * Writes the composed order. A stale revision is reported instead of overwriting what somebody else changed.
     */
    private async saveOrder(): Promise<void> {
        const { dataModel, list, onClose } = this.props;
        const { orderDraft } = this.state;

        this.setState({ busy: true, message: undefined, conflict: false, confirming: false });
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

    /**
     * Opens the mini editor for one entry, or saves the one that is open. The button of the description line is both
     * the opener and the save action, so the editor needs no buttons of its own.
     *
     * @param scoreId The member whose description is edited.
     * @param entry The score entry behind it, if it is known.
     * @param event The click on the button, which names the element the popup anchors to.
     */
    private handleEntryEdit(scoreId: number, entry: IScoreListEntry | undefined,
        event: MouseEvent | KeyboardEvent): void {
        const { entryDraft } = this.state;

        if (entryDraft?.scoreId === scoreId) {
            if (!this.savingDraft) {
                void this.saveEntry();
            }

            return;
        }

        const target = event.currentTarget as HTMLElement | null;
        const stored = entry?.icon;
        const icon = isSetListIconKey(stored) ? stored : defaultSetListIconKey;

        this.entryAnchorArea = document.getElementById("setListsEdit") ?? undefined;
        this.setState({ entryDraft: { scoreId, note: entry?.note ?? "", icon } });
        if (target !== null) {
            this.entryPopupRef.current?.open(target);
        }
    }

    private handleEntryNoteInput = (event: Event): void => {
        const { entryDraft } = this.state;

        if (entryDraft === undefined) {
            return;
        }

        this.setState({ entryDraft: { ...entryDraft, note: (event.currentTarget as HTMLTextAreaElement).value } });
    };

    /**
     * @param icon The icon the entry is to wear.
     */
    private pickEntryIcon(icon: SetListIconKey): void {
        const { entryDraft } = this.state;

        if (entryDraft !== undefined) {
            this.setState({ entryDraft: { ...entryDraft, icon } });
        }
    }

    /**
     * Runs when the mini editor closed itself. A press beside it keeps what was typed, Escape drops it, and a close
     * the editor asked for leaves the draft to the code that closed it.
     *
     * @param cancelled Whether the close counts as a cancellation for the popup itself.
     * @param portalProperties The properties the portal closed with.
     * @param reason What made the popup go away.
     */
    private handleEntryEditorClosed = (cancelled: boolean, portalProperties: IPortalProperties,
        reason: PortalCloseReason): void => {
        if (reason === PortalCloseReason.Programmatic) {
            // The editor closed the popup itself: either it stored the draft already, or it holds it for the question.
            return;
        }

        if (reason === PortalCloseReason.OutsideClick) {
            if (!this.savingDraft) {
                void this.saveEntry();
            }

            return;
        }

        this.setState({ entryDraft: undefined });
    };

    /**
     * Stores the description and the icon of the draft. The entry in the rows follows right away, because a saved
     * note touches neither the order nor the revision the backend reports.
     *
     * @returns Whether the draft reached the backend.
     */
    private async saveEntry(): Promise<boolean> {
        const { dataModel, list } = this.props;
        const { entryDraft } = this.state;

        if (entryDraft === undefined) {
            return false;
        }

        const note = entryDraft.note.trim();
        const icon = entryDraft.icon === defaultSetListIconKey ? undefined : entryDraft.icon;

        this.savingDraft = true;
        let saved: boolean;
        try {
            saved = await dataModel.saveSetListEntry(list.id, entryDraft.scoreId, note, icon);
        } finally {
            this.savingDraft = false;
        }

        if (!saved) {
            // The data model already reported why the change was refused.
            return false;
        }

        // A press beside the editor can save one entry and open another before the answer arrives. That younger draft
        // owns the editor now, so the rows follow and the save keeps its hands off it.
        const { entryDraft: currentDraft } = this.state;
        const draftStillOpen = currentDraft?.scoreId === entryDraft.scoreId;

        this.setState((previous) => {
            return {
                members: previous.members.map((entry) => {
                    if (entry.id !== entryDraft.scoreId) {
                        return entry;
                    }

                    return { ...entry, note: note.length > 0 ? note : undefined, icon };
                }),
                entryDraft: draftStillOpen ? undefined : currentDraft,
            };
        });

        if (draftStillOpen) {
            this.entryPopupRef.current?.close(false);
        }

        return true;
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
        void this.saveChanges();
    };

    private handleDiscardClick = (): void => {
        this.setState({ entryDraft: undefined, confirming: false });
        this.props.onClose();
    };

    /**
     * Writes what the question bar offered: the open description first, then the composed order. A refused write keeps
     * the editor open, so nothing is lost while the note about it is read.
     */
    private async saveChanges(): Promise<void> {
        if (this.hasDraftChanges()) {
            const stored = await this.saveEntry();
            if (!stored) {
                return;
            }
        }

        if (this.hasOrderChanges()) {
            await this.saveOrder();

            return;
        }

        this.setState({ confirming: false });
        this.props.onClose();
    }

    private handleSetListsChanged = (): Promise<boolean> => {
        void this.loadMembers();

        return Promise.resolve(true);
    };
}
