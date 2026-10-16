/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import type { IRepeatBar } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface IBarActionDefinition {
    key: string;
    kind: BarActionKind;
    label: string;
    icon: ComponentChild;

    /** Whether the action is unavailable for the bar it is drawn above. */
    disabled?: (barNumber: number) => boolean;

    /** Whether the bar is in the state the action switches. */
    active?: (barNumber: number) => boolean;
}

/** The bar-level actions offered by the strip. */
export enum BarActionKind {
    InsertLeft,
    Clear,
    Delete,
    Duplicate,
    InsertRight,
    RepeatStart,
    RepeatEnd,
}

export interface IBarActionStripProps extends ICommonUIProperties {
    barCount: number;
    canDelete: boolean;

    /** The repeat marks the bars carry, keyed by 1-based bar number. */
    repeatBars?: Map<number, IRepeatBar>;

    /** The horizontally scrolling host that contains the bar columns. */
    scrollHostRef: preact.RefObject<HTMLDivElement | null>;

    /** The fixed toolbar viewport the action groups are aligned within. */
    actionViewportRef: preact.RefObject<HTMLDivElement | null>;

    /**
     * Supplies the horizontal center of every measure column, in px at 100% zoom. The staff view renders only a
     * window of measures, so the position of a bar cannot be read from its element.
     *
     * @returns The center of every measure column, keyed by 1-based measure number.
     */
    barCenters: () => Map<number, number>;

    /** Invoked with the 1-based bar number and the selected action. */
    onBarAction: (barNumber: number, action: BarActionKind) => void;
}

/**
 * Direct per-bar action buttons aligned with the measure columns.
 */
export class BarActionStrip extends UIComponent<IBarActionStripProps> {
    private stripRef = createRef<HTMLDivElement | null>();
    private resizeObserver?: ResizeObserver;

    public override componentDidMount(): void {
        const { scrollHostRef } = this.props;
        requisitions.register("arrangementMutated", this.handleArrangementMutated);
        this.layout();

        const host = scrollHostRef.current;
        if (host) {
            this.resizeObserver = new ResizeObserver(() => {
                this.layout();
            });
            this.resizeObserver.observe(host);
        }
    }

    public override componentDidUpdate(): void {
        this.layout();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("arrangementMutated", this.handleArrangementMutated);

        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    /** Aligns the strip with the scroll host and centers each group of buttons over its bar. */
    public layout(): void {
        const { scrollHostRef, actionViewportRef, barCenters } = this.props;
        const strip = this.stripRef.current;
        const host = scrollHostRef.current;
        const viewport = actionViewportRef.current;
        if (!strip || !host || !viewport) {
            return;
        }

        strip.style.width = `${viewport.clientWidth}px`;
        strip.style.transform = "";

        const centers = barCenters();
        const hostRect = host.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        const zoom = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1;
        const groups = strip.querySelectorAll<HTMLElement>(".bar-action-group");
        for (let index = 0; index < groups.length; index++) {
            const center = centers.get(index + 1);
            if (center !== undefined) {
                const screenOffset = hostRect.left - viewportRect.left + ((center - host.scrollLeft) * zoom);
                groups[index].style.left = `${screenOffset}px`;
            }
        }
    }

    public override render(): ComponentChild {
        const groups = this.renderGroups();

        return (
            <Container
                className="bar-action-strip"
                innerRef={this.stripRef}
                style={{ height: "var(--bar-action-strip-height)" }}
            >
                {groups}
            </Container>
        );
    }

    /**
     * A repeat mark is a switch the buttons draw as pressed, so they follow the marks the score holds.
     *
     * @returns True to signal that the event was handled.
     */
    private handleArrangementMutated = (): Promise<boolean> => {
        this.forceUpdate();

        return Promise.resolve(true);
    };

    /**
     * Builds one group of buttons per bar, each centred on its measure column.
     *
     * @returns The groups to draw.
     */
    private renderGroups(): ComponentChild[] {
        const { barCount } = this.props;
        const actions = this.buildActions();

        const groups: ComponentChild[] = [];
        for (let barNumber = 1; barNumber <= barCount; barNumber++) {
            groups.push(
                <Container key={barNumber} className="bar-action-group" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    {this.renderButtons(barNumber, actions)}
                </Container>,
            );
        }

        return groups;
    }

    /**
     * @param barNumber The 1-based bar the buttons act on.
     * @param actions The actions every bar offers.
     *
     * @returns The buttons of one bar.
     */
    private renderButtons(barNumber: number, actions: IBarActionDefinition[]): ComponentChild[] {
        const { onBarAction } = this.props;

        return actions.map((action) => {
            return (
                <Button
                    key={action.key}
                    className="bar-action-button"
                    data-action={action.key}
                    aria-label={`${action.label}, bar ${barNumber}`}
                    title={`${action.label}, bar ${barNumber}`}
                    disabled={action.disabled?.(barNumber) === true}
                    isDefault={action.active?.(barNumber) === true}
                    onClick={() => {
                        onBarAction(barNumber, action.kind);
                    }}
                >
                    {action.icon}
                </Button>
            );
        });
    }

    /**
     * @returns The actions every bar offers, in the order they appear.
     */
    private buildActions(): IBarActionDefinition[] {
        const { barCount, canDelete, repeatBars } = this.props;

        const insertLeftIcon = (
            <Container className="bar-action-insert-icon" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.ArrowLeft} width={16} height={16} />
                <Icon src={UIIcon.Add} width={13} height={13} />
            </Container>
        );
        const insertRightIcon = (
            <Container className="bar-action-insert-icon" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Add} width={13} height={13} />
                <Icon src={UIIcon.ArrowRight} width={16} height={16} />
            </Container>
        );

        return [{
            key: "insert-left",
            kind: BarActionKind.InsertLeft,
            label: "Insert bars to the left",
            icon: insertLeftIcon,
        }, {
            key: "clear",
            kind: BarActionKind.Clear,
            label: "Clear bar",
            icon: <Icon src={UIIcon.ClearAll} />,
        }, {
            key: "delete",
            kind: BarActionKind.Delete,
            label: "Delete bar",
            icon: <Icon src={UIIcon.Trash} />,
            disabled: () => {
                return !canDelete;
            },
        }, {
            key: "duplicate",
            kind: BarActionKind.Duplicate,
            label: "Duplicate bar",
            icon: <Icon src={UIIcon.Copy} />,
        }, {
            key: "repeat-start",
            kind: BarActionKind.RepeatStart,
            label: "Repeat start",
            icon: <ScoreSymbolView symbol={ScoreSymbol.RepeatStart} staffSpace={staffSpacePx} icon />,
            disabled: (barNumber) => {
                // A section that opens needs a bar after it that closes it.
                return barNumber >= barCount;
            },
            active: (barNumber) => {
                return repeatBars?.get(barNumber)?.start === true;
            },
        }, {
            key: "repeat-end",
            kind: BarActionKind.RepeatEnd,
            label: "Repeat end",
            icon: <ScoreSymbolView symbol={ScoreSymbol.RepeatEnd} staffSpace={staffSpacePx} icon />,
            active: (barNumber) => {
                return repeatBars?.get(barNumber)?.end === true;
            },
        }, {
            // The insert actions frame the rest of the bar actions: the one that inserts on the left opens the
            // row, the one that inserts on the right closes it.
            key: "insert-right",
            kind: BarActionKind.InsertRight,
            label: "Insert bars to the right",
            icon: insertRightIcon,
        }];
    }
}
