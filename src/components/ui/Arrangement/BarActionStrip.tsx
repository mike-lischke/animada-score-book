/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

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
 * Per-bar action menus rendered inside the scroll host above the bars.
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
        const { scrollHostRef, barCenters } = this.props;
        const strip = this.stripRef.current;
        const host = scrollHostRef.current;
        if (!strip || !host) {
            return;
        }

        const centers = barCenters();
        const groups = strip.querySelectorAll<HTMLElement>(".bar-action-group");
        for (let index = 0; index < groups.length; index++) {
            const center = centers.get(index + 1);
            if (center !== undefined) {
                groups[index].style.left = `${center}px`;
            }
        }
    }

    public override render(): ComponentChild {
        const { barCount, canDelete, onBarAction } = this.props;

        const actionDefinitions = [{
            kind: BarActionKind.InsertLeft,
            "data-tooltip": "Insert bars to the left",
        }, {
            kind: BarActionKind.Clear,
            "data-tooltip": "Clear bar",
        }, {
            kind: BarActionKind.Delete,
            "data-tooltip": "Delete bar",
        }, {
            kind: BarActionKind.Duplicate,
            "data-tooltip": "Duplicate bar",
        }, {
            kind: BarActionKind.InsertRight,
            "data-tooltip": "Insert bars to the right",
        }];

        const groups: ComponentChild[] = [];
        for (let barNumber = 1; barNumber <= barCount; barNumber++) {
            const items: IDropdownItem[] = actionDefinitions.map((action) => {
                return {
                    label: action["data-tooltip"],
                    disabled: action.kind === BarActionKind.Delete && !canDelete,
                    onClick: () => {
                        onBarAction(barNumber, action.kind);
                    },
                };
            });

            groups.push(
                <Container key={barNumber} className="bar-action-group" crossAlignment={ChildAlignment.Center}>
                    <Dropdown
                        className="bar-action-menu"
                        icon={<Icon src={UIIcon.KebabVertical} width={16} height={16} alt="Bar actions" />}
                        items={items}
                        closeOnSelect
                        compact
                        data-tooltip={`Bar ${barNumber} actions`}
                    />
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
