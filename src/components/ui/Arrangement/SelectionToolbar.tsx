/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment, ChildWrap, Orientation } from "../framework/ui-types.js";
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

/** A section a selection toolbar draws as one row of controls, captioned above it. */
export interface ISelectionToolbarSection {
    /**
     * The caption above the section, which tells the rows of a toolbar that holds several of them apart. A
     * toolbar that holds one section draws no caption.
     */
    label?: string;

    /** A short label the section shows at the end of its caption, e.g. the group its controls belong to. */
    badge?: string;

    /** Extra class of the section's row, which tells the rows carrying controls of their own apart. */
    className?: string;

    /** The actions of the section, in the order they appear. */
    actions?: ISelectionToolbarAction[];

    /** Controls the section brings itself, which the row draws in place of actions. */
    content?: ComponentChild;

    /**
     * Whether the row sits on the card's tray, the surface the note styles read as the palette of the addressed
     * instrument. A section that lists actions always sits on one.
     */
    tray?: boolean;
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

        const card = (
            <>
                {header}
                <Container
                    className="selection-toolbar-sections"
                    orientation={Orientation.LeftToRight}
                    mainAlignment={ChildAlignment.SpaceBetween}
                    crossAlignment={ChildAlignment.Start}
                    wrap={ChildWrap.Wrap}
                    gap={10}
                >
                    {sections}
                </Container>
            </>
        );

        return this.renderSurface(card);
    }

    /**
     * Names the elements a toolbar acts on from the tracks that hold them and the bars they cover.
     *
     * @param tracks The tracks the addressed elements belong to.
     * @param bars The covered bar numbers, 0 for a track selection, which spans the whole score.
     *
     * @returns The title the card's header shows.
     */
    protected static titleOf(tracks: ISbDmTrack[], bars: number[]): ISelectionToolbarTitle {
        const instruments = [...new Set(tracks.map((track) => {
            return track.instrument.displayName;
        }))];

        // A track selection covers every bar, so naming the bars of the others would misstate it.
        const namesBar = !bars.some((bar) => {
            return bar === 0;
        });

        return {
            instrument: instruments.join(", "),
            position: namesBar && bars.length > 0 ? SelectionToolbar.positionOf(bars) : undefined,
            color: tracks[0]?.instrument.color,
        };
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

    /**
     * Names the bars a selection covers: one bar, a contiguous run of them, or their count.
     *
     * @param bars The covered bar numbers.
     *
     * @returns The name of the covered bars.
     */
    private static positionOf(bars: number[]): string {
        const measures = [...new Set(bars)].sort((left, right) => {
            return left - right;
        });

        if (measures.length === 1) {
            return `Bar ${measures[0]}`;
        }

        const first = measures[0];
        const last = measures[measures.length - 1];
        if (last - first === measures.length - 1) {
            return `Bars ${first} – ${last}`;
        }

        return `${measures.length} bars`;
    }

    /**
     * @param section The section to draw.
     *
     * @returns The classes of the section's box.
     */
    private static boxClassesOf(section: ISelectionToolbarSection): string {
        // A section on the tray reads as the palette of the addressed elements, so it takes a row of its own.
        return SelectionToolbar.sitsOnTray(section)
            ? "selection-toolbar-group is-tray"
            : "selection-toolbar-group";
    }

    /**
     * @param section The section to draw.
     *
     * @returns True when the section's row sits on the card's tray.
     */
    private static sitsOnTray(section: ISelectionToolbarSection): boolean {
        return section.actions !== undefined || section.tray === true;
    }

    private renderHeader(): ComponentChild {
        const { instrument, position, color } = this.toolbarTitle;
        const dot = <span className="selection-toolbar-dot" style={{ backgroundColor: color }} />;
        const name = <span className="selection-toolbar-instrument">{instrument}</span>;

        let placement: ComponentChild;
        if (position !== undefined) {
            placement = (
                <>
                    <span className="selection-toolbar-separator">-</span>
                    <span className="selection-toolbar-position">{position}</span>
                </>
            );
        }

        return (
            <Container
                className="selection-toolbar-header"
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

        // Only a toolbar that holds several sections captions them, so its rows can be told apart.
        const captions = sections.length > 1;
        const parts: ComponentChild[] = [];
        for (const section of sections) {
            parts.push(this.renderSection(section, captions));
        }

        return parts;
    }

    /**
     * Draws one section: the caption naming it and the row of its controls.
     *
     * @param section The section to draw.
     * @param captioned Whether the card captions its sections.
     *
     * @returns The section's box.
     */
    private renderSection(section: ISelectionToolbarSection, captioned: boolean): ComponentChild {
        let caption: ComponentChild;
        if (captioned) {
            caption = this.renderCaption(section);
        }

        return (
            <Container
                className={SelectionToolbar.boxClassesOf(section)}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.Stretch}
                gap={6}
            >
                {caption}
                {this.renderRow(section)}
            </Container>
        );
    }

    /**
     * Draws the row that captions a section: the caption naming it and the short label it states.
     *
     * @param section The section to caption.
     *
     * @returns The caption row, or undefined when the section states neither.
     */
    private renderCaption(section: ISelectionToolbarSection): ComponentChild {
        const { label, badge } = section;
        if (label === undefined && badge === undefined) {
            return undefined;
        }

        let caption: ComponentChild;
        if (label !== undefined) {
            caption = <div className="selection-toolbar-section">{label}</div>;
        }

        let badgeLabel: ComponentChild;
        if (badge !== undefined) {
            badgeLabel = <span className="selection-toolbar-badge">{badge}</span>;
        }

        return (
            <Container
                className="selection-toolbar-caption"
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.SpaceBetween}
                crossAlignment={ChildAlignment.Center}
            >
                {caption}
                {badgeLabel}
            </Container>
        );
    }

    /**
     * Draws the row of one section: the controls it brings itself, or the actions it lists.
     *
     * @param section The section to draw.
     *
     * @returns The section's row.
     */
    private renderRow(section: ISelectionToolbarSection): ComponentChild {
        const { actions, className, content } = section;

        let body: ComponentChild;
        if (content !== undefined) {
            body = content;
        } else {
            body = this.renderActions(actions ?? []);
        }

        const rowClasses = ["selection-toolbar-actions"];
        if (className !== undefined) {
            rowClasses.push(className);
        }

        if (SelectionToolbar.sitsOnTray(section)) {
            rowClasses.push("selection-toolbar-tray");
        }

        return (
            <Container
                className={rowClasses.join(" ")}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                wrap={ChildWrap.Wrap}
                gap={6}
            >
                {body}
            </Container>
        );
    }

    private renderActions(actions: ISelectionToolbarAction[]): ComponentChild[] {
        const buttons = actions.map((action) => {
            let className = "selection-toolbar-action";
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

        return buttons;
    }
}
