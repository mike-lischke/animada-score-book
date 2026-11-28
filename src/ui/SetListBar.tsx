/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, type ComponentChildren, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import type { ISetListInfo } from "../core/DatabaseTypes.js";

/** One pill of the selector: all readable scores, or one set list. */
interface ISetListTab {
    id?: number;
    name: string;
    count: number;
}

export interface ISetListBarProperties extends ICommonUIProperties {
    /** The set lists the caller may select. */
    lists: readonly ISetListInfo[];

    /** The selected list, or undefined for All Scores. */
    activeId?: number;

    /** How many scores All Scores shows, which is what its pill counts. */
    allScoresCount: number;

    /** Whether the active list may be changed, which is what the edit button needs. */
    canEdit: boolean;

    /** Whether the running-order editor is open. */
    editing: boolean;

    /** Whether the caller may create a set list, which is what the add button offers. */
    canCreate: boolean;

    onSelect: (id?: number) => void;

    /** Switches the editor on, or off again. */
    onToggleEdit: () => void;

    /** Opens the form that creates a set list. */
    onAdd: () => void;

    /** The controls that close the toolbar, shown after the pills: the sort selector or the saved-order note. */
    children?: ComponentChildren;
}

interface ISetListBarState {
    /** Whether part of the row is scrolled out of view, which the fade at the edge signals. */
    hasOverflow: boolean;
}

/**
 * The selector above the score cards: a horizontal tab row with All Scores first and one pill per set list. It works
 * like a tab view - exactly one pill is active and the arrow keys, Home and End move between them - and scrolls
 * horizontally when the pills do not fit, keeping the active pill in view. An active list the caller may change adds
 * the switch that opens its running-order editor.
 */
export class SetListBar extends UIComponent<ISetListBarProperties, ISetListBarState> {
    private readonly rowRef = createRef<HTMLDivElement>();
    private readonly tabs: Array<HTMLButtonElement | undefined> = [];

    public constructor(props: ISetListBarProperties) {
        super(props);

        this.state = { hasOverflow: false };
    }

    public override componentDidMount(): void {
        this.updateOverflow();
        this.scrollActiveIntoView();
    }

    public override componentDidUpdate(): void {
        this.updateOverflow();
        this.scrollActiveIntoView();
    }

    public render(): ComponentChild {
        const { canEdit, canCreate, editing, children } = this.props;
        const tabs = this.buildTabs();
        const pills = tabs.map((tab, index) => {
            return this.renderPill(tab, index);
        });

        const row = (
            <div
                ref={this.rowRef}
                className={this.state.hasOverflow ? "set-list-tabs set-list-tabs-cut" : "set-list-tabs"}
                role="tablist"
                aria-label="Set lists"
                onKeyDown={this.handleRowKeyDown}
                onScroll={this.handleRowScroll}
            >
                {pills}
            </div>
        );

        return (
            <Container className={this.generateFinalClassName(["set-list-bar"])} orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Label className="set-list-bar-label" caption="Active set list" />
                {row}
                {canCreate && !editing && this.renderAddButton()}
                {canEdit && this.renderEditButton(editing)}
                {children}
            </Container>
        );
    }

    /**
     * @returns The round button that opens the form for a new set list. It makes room for the edit switch while the
     * running order is being edited, which would otherwise sit between the pills and the sort selector.
     */
    private renderAddButton(): ComponentChild {
        return (
            <Button id="setListsAdd" className="set-list-add" imageOnly={true} round={true} title="Add set list"
                onClick={this.handleAddClick}>
                <Icon src={UIIcon.Add} />
            </Button>
        );
    }

    /**
     * @returns The pills in display order, All Scores first.
     */
    private buildTabs(): ISetListTab[] {
        const { lists, allScoresCount } = this.props;

        return [
            { name: "All Scores", count: allScoresCount },
            ...lists.map((list) => {
                return { id: list.id, name: list.name, count: list.memberCount };
            }),
        ];
    }

    /**
     * @param tab The pill to render.
     * @param index The position of the pill, which the keyboard handling uses.
     *
     * @returns The pill as a tab.
     */
    private renderPill(tab: ISetListTab, index: number): ComponentChild {
        const { activeId } = this.props;
        const selected = tab.id === activeId;
        const id = tab.id === undefined ? "all" : String(tab.id);

        return (
            <button
                key={id}
                ref={(element) => {
                    this.tabs[index] = element ?? undefined;
                }}
                id={`set-list-tab-${id}`}
                type="button"
                role="tab"
                className={selected ? "set-list-pill set-list-pill-active" : "set-list-pill"}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-set-list={id}
                title={`${tab.name} (${tab.count})`}
                onClick={() => {
                    this.handlePillClick(tab.id);
                }}
            >
                <span className="set-list-pill-name">{tab.name}</span>
                <span className="set-list-pill-count" aria-label={`${tab.count} scores`}>{tab.count}</span>
            </button>
        );
    }

    /**
     * @param editing Whether the running-order editor is open.
     *
     * @returns The switch that opens the editor for the active list. It is the same control the cards use for their
     * tag editing, so both edit modes of the collection look and read the same.
     */
    private renderEditButton(editing: boolean): ComponentChild {
        const className = editing ? "edit-switch is-active" : "edit-switch";

        return (
            <Button id="setListsEdit" className={className} title="Edit the running order and the scores of this list"
                aria-pressed={editing} onClick={this.handleEditClick}>
                <span className="edit-switch-dot" aria-hidden="true" />
                <span className="edit-switch-label">{editing ? "Editing" : "Edit"}</span>
            </Button>
        );
    }

    private handlePillClick = (id?: number): void => {
        const { activeId, onSelect } = this.props;

        if (id !== activeId) {
            onSelect(id);
        }
    };

    private handleEditClick = (): void => {
        this.props.onToggleEdit();
    };

    private handleAddClick = (): void => {
        this.props.onAdd();
    };

    private handleRowScroll = (): void => {
        this.updateOverflow();
    };

    /**
     * Implements the tab behaviour: the arrow keys move to the neighbouring pill and select it, Home and End jump to
     * the first and last one. Focus follows the selection, so the row stays operable without a mouse.
     *
     * @param event The key event of the tab row.
     */
    private handleRowKeyDown = (event: KeyboardEvent): void => {
        const { onSelect } = this.props;
        const tabs = this.buildTabs();

        let next: number | undefined;
        switch (event.key) {
            case "ArrowRight": {
                next = this.indexOfActive() + 1;
                break;
            }

            case "ArrowLeft": {
                next = this.indexOfActive() - 1;
                break;
            }

            case "Home": {
                next = 0;
                break;
            }

            case "End": {
                next = tabs.length - 1;
                break;
            }

            default: {
                return;
            }
        }

        event.preventDefault();
        if (next < 0 || next >= tabs.length) {
            return;
        }

        this.tabs[next]?.focus();
        onSelect(tabs[next].id);
    };

    /**
     * @returns The index of the pill that is active right now; All Scores for no selection.
     */
    private indexOfActive(): number {
        const { lists, activeId } = this.props;
        const index = lists.findIndex((list) => {
            return list.id === activeId;
        });

        return index < 0 ? 0 : index + 1;
    }

    private scrollActiveIntoView(): void {
        const index = this.indexOfActive();
        const tab = this.tabs[index];

        if (tab !== undefined && typeof tab.scrollIntoView === "function") {
            tab.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    private updateOverflow(): void {
        const row = this.rowRef.current;
        const hasOverflow = row !== null
            && row.scrollWidth - row.clientWidth - row.scrollLeft > 1;

        if (hasOverflow !== this.state.hasOverflow) {
            this.setState({ hasOverflow });
        }
    }
}
