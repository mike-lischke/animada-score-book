/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Icon } from "../framework/Icon.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ScoreElementKind, type ScoreElementRegistry } from "../../../ui/ScoreElementRegistry.js";

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
    scrollHostRef: preact.RefObject<HTMLDivElement>;
    scoreElementRegistry: ScoreElementRegistry;

    /** Invoked with the 1-based bar number and the selected action. */
    onBarAction: (barNumber: number, action: BarActionKind) => void;
}

/**
 * Strip of per-bar action buttons rendered inside the scroll host above the bars, so it scrolls
 * natively together with the bar columns.
 */
export class BarActionStrip extends UIComponent<IBarActionStripProps> {
    private stripRef = createRef<HTMLDivElement>();
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
        const { scrollHostRef, scoreElementRegistry } = this.props;
        const strip = this.stripRef.current;
        const host = scrollHostRef.current;
        if (!strip || !host) {
            return;
        }

        const groups = strip.querySelectorAll<HTMLElement>(".bar-action-group");
        const barElements = scoreElementRegistry.findElements(ScoreElementKind.BarContainer).sort((first, second) => {
            const firstBar = scoreElementRegistry.getLocation(first)?.bar ?? 0;
            const secondBar = scoreElementRegistry.getLocation(second)?.bar ?? 0;

            return firstBar - secondBar;
        });

        const count = Math.min(groups.length, barElements.length);
        for (let i = 0; i < count; i++) {
            const group = groups[i];
            const bar = barElements[i];

            group.style.left = `${bar.offsetLeft + (bar.offsetWidth / 2) - (group.offsetWidth / 2)}px`;
        }
    }

    public override render(): ComponentChild {
        const { barCount, canDelete, onBarAction } = this.props;

        const actionDefinitions = [{
            kind: BarActionKind.InsertLeft,
            icon: UIIcon.ArrowLeft,
            "data-tooltip": "Insert bars to the left",
        }, {
            kind: BarActionKind.Clear,
            icon: UIIcon.ClearAll,
            "data-tooltip": "Clear bar",
        }, {
            kind: BarActionKind.Delete,
            icon: UIIcon.Trash,
            "data-tooltip": "Delete bar",
        }, {
            kind: BarActionKind.Duplicate,
            icon: UIIcon.Copy,
            "data-tooltip": "Duplicate bar",
        }, {
            kind: BarActionKind.InsertRight,
            icon: UIIcon.ArrowRight,
            "data-tooltip": "Insert bars to the right",
        }];

        const groups: ComponentChild[] = [];
        for (let barNumber = 1; barNumber <= barCount; barNumber++) {
            const buttons: ComponentChild[] = [];
            for (const action of actionDefinitions) {
                const disabled = action.kind === BarActionKind.Delete && !canDelete;
                buttons.push(
                    <button
                        key={action.kind}
                        type="button"
                        className="bar-action-button"
                        data-tooltip={action["data-tooltip"]}
                        aria-label={action["data-tooltip"]}
                        disabled={disabled}
                        onClick={() => {
                            onBarAction(barNumber, action.kind);
                        }}
                    >
                        <Icon src={action.icon} width={16} height={16} alt={action["data-tooltip"]} />
                    </button>,
                );
            }

            groups.push(
                <GooeyGroup key={barNumber} className="bar-action-group" background="var(--color-base-200)">
                    {buttons}
                </GooeyGroup>,
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
