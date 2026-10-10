/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

interface IBarActionDefinition {
    key: string;
    kind: BarActionKind;
    label: string;
    icon: ComponentChild;
}

/** The bar-level actions offered by the strip. */
export enum BarActionKind {
    InsertLeft,
    Clear,
    Delete,
    Duplicate,
    InsertRight,
}

export interface IBarActionStripProps extends ICommonUIProperties {
    barCount: number;
    canDelete: boolean;

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
        this.layout();

        const host = this.props.scrollHostRef.current;
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
        const { barCount, canDelete, onBarAction } = this.props;

        const insertLeftIcon = (
            <Container className="bar-action-insert-icon" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.ArrowLeft} width={14} height={14} />
                <Icon src={UIIcon.Add} width={12} height={12} />
            </Container>
        );
        const insertRightIcon = (
            <Container className="bar-action-insert-icon" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Add} width={12} height={12} />
                <Icon src={UIIcon.ArrowRight} width={14} height={14} />
            </Container>
        );
        const actionDefinitions: IBarActionDefinition[] = [{
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
        }, {
            key: "duplicate",
            kind: BarActionKind.Duplicate,
            label: "Duplicate bar",
            icon: <Icon src={UIIcon.Copy} />,
        }, {
            key: "insert-right",
            kind: BarActionKind.InsertRight,
            label: "Insert bars to the right",
            icon: insertRightIcon,
        }];

        const groups: ComponentChild[] = [];
        for (let barNumber = 1; barNumber <= barCount; barNumber++) {
            const buttons: ComponentChild[] = [];
            for (const action of actionDefinitions) {
                buttons.push(
                    <Button
                        key={action.key}
                        className="bar-action-button"
                        imageOnly
                        compact
                        data-action={action.key}
                        data-tooltip={action.label}
                        aria-label={`${action.label}, bar ${barNumber}`}
                        title={`${action.label}, bar ${barNumber}`}
                        disabled={action.kind === BarActionKind.Delete && !canDelete}
                        onClick={() => {
                            onBarAction(barNumber, action.kind);
                        }}
                    >
                        {action.icon}
                    </Button>,
                );
            }

            groups.push(
                <Container key={barNumber} className="bar-action-group" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    {buttons}
                </Container>,
            );
        }

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
}
