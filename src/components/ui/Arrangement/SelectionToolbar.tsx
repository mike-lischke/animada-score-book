/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

/** What a selection toolbar acts on, as its header names it. */
export interface ISelectionToolbarTitle {
    /** The instrument of the addressed elements. */
    instrument: string;

    /** Where the addressed elements sit, e.g. the measures a track piece covers; omitted while one element is. */
    position?: string;

    /** Color of the dot that marks the instrument. */
    color?: string;
}

/** One action of a selection toolbar. */
export interface ISelectionToolbarAction {
    id: string;
    icon: ComponentChild;
    tooltip?: string;
    disabled?: boolean;

    /** Draws the action as the pressed state of the switch it is. */
    active?: boolean;

    /** Marks an action that destroys score content, which the toolbar draws as the dangerous one. */
    destructive?: boolean;
    onClick?: () => void;
}

/** A group of actions a selection toolbar draws as one tray. */
export interface ISelectionToolbarSection {
    /**
     * The caption above the section, which tells the trays of a toolbar that holds several of them apart. A
     * toolbar that holds one section draws no caption.
     */
    label?: string;

    /** The actions of the section, in the order they appear. */
    actions: ISelectionToolbarAction[];
}

/**
 * The card that the popups carrying the actions of selected score elements share: a header naming what they act on
 * and a tray of action buttons. A subclass states the elements it addresses and the actions they offer; the card,
 * its surface and its look are stated once here.
 */
export abstract class SelectionToolbar<P extends ICommonUIProperties, S> extends UIComponent<P, S> {
    /** Class of the card's surface, which the popup of a host that owns it carries. */
    public static readonly surfaceClassName = "selection-toolbar";

    public override render(): ComponentChild {
        const header = this.renderHeader();
        const sections = this.renderSections();

        return this.renderSurface(<>{header}{sections}</>);
    }

    /**
     * The elements the toolbar acts on, as its header names them.
     *
     * @returns The title the card's header shows.
     */
    protected abstract get toolbarTitle(): ISelectionToolbarTitle;

    /**
     * The action sections the toolbar offers, in the order they appear.
     *
     * @returns The sections to draw.
     */
    protected abstract get toolbarSections(): ISelectionToolbarSection[];

    /**
     * Wraps the card into the surface it floats on. A toolbar that owns its popup — the track toolbar anchors
     * itself beside the trigger it belongs to — states it here; the default draws the card as it is, which is
     * what a toolbar inside the popup of a host needs: the selection popup carries the track-piece card.
     *
     * @param card The rendered card.
     *
     * @returns The surface to render.
     */
    protected renderSurface(card: ComponentChild): ComponentChild {
        return card;
    }

    private renderHeader(): ComponentChild {
        const { instrument, position, color } = this.toolbarTitle;
        const dot = <span className="selectionToolbarDot" style={{ backgroundColor: color }} />;
        const name = <span className="selectionToolbarInstrument">{instrument}</span>;

        let placement: ComponentChild;
        if (position !== undefined) {
            placement = (
                <>
                    <span className="selectionToolbarSeparator">-</span>
                    <span className="selectionToolbarPosition">{position}</span>
                </>
            );
        }

        return (
            <Container
                className="selectionToolbarHeader"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                {dot}
                {name}
                {placement}
            </Container>
        );
    }

    private renderSections(): ComponentChild[] {
        const sections = this.toolbarSections;

        // Only a toolbar that holds several sections captions them, so its trays can be told apart.
        const captions = sections.length > 1;
        const parts: ComponentChild[] = [];
        for (const section of sections) {
            const { label, actions } = section;
            if (captions && label !== undefined) {
                parts.push(<div className="selectionToolbarSection">{label}</div>);
            }

            parts.push(this.renderTray(actions));
        }

        return parts;
    }

    private renderTray(actions: ISelectionToolbarAction[]): ComponentChild {
        const buttons = actions.map((action) => {
            let className = "selectionToolbarAction";
            if (action.destructive === true) {
                className += " is-destructive";
            }

            return (
                <Button
                    key={action.id}
                    className={className}
                    title={action.tooltip}
                    disabled={action.disabled}
                    isDefault={action.active}
                    onClick={action.onClick}
                >
                    {action.icon}
                </Button>
            );
        });

        return (
            <Container
                className="selectionToolbarActions"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                {buttons}
            </Container>
        );
    }
}
