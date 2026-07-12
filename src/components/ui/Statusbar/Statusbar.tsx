/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { requisitions } from "../../../supplement/Requisitions.js";
import { Container } from "../framework/Container.js";
import { Orientation, ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { StatusBarAlignment, StatusBarItem, type IStatusBarItem, type IStatusBarItemOptions } from "./StatusBarItem.js";

/** Simple disposable returned by setStatusBarMessage. */
export interface IStatusBarDisposable {
    dispose(): void;
}

interface IStatusBarState {
    items: IStatusBarItem[];
}

const singleton = createRef<Statusbar>();

/**
 * A status bar component for displaying permanent and temporary status information.
 * Based on the VS Code StatusBar API pattern.
 *
 * Usage:
 *   Statusbar.createStatusBarItem({ id: "myItem", text: "Hello", alignment: StatusBarAlignment.Left });
 *   Statusbar.setStatusBarMessage("Loading...", 3000);
 */
export class Statusbar extends UIComponent<ICommonUIProperties, IStatusBarState> {
    private scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>();

    public constructor(props: ICommonUIProperties) {
        super(props);

        this.state = {
            items: [],
        };
    }

    /**
     * Creates a status bar item.
     *
     * @param options The initial values for the new status bar item.
     *
     * @returns A new status bar item.
     */
    public static createStatusBarItem(options: IStatusBarItemOptions): IStatusBarItem {
        if (!singleton.current) {
            throw new Error("Statusbar is not mounted. Call createStatusBarItem after the Statusbar is rendered.");
        }

        const { items } = singleton.current.state;

        items.push(new StatusBarItem(singleton.current.update, options));
        singleton.current.setState({ items });

        return items[items.length - 1];
    }

    /**
     * Shows a temporary status bar message.
     *
     * @param text The message to show, supports $(icon-name) codicon syntax.
     * @param hideAfterTimeout Timeout in milliseconds after which the message will be disposed.
     *
     * @returns A disposable which hides the status bar message.
     */
    public static setStatusBarMessage(text: string, hideAfterTimeout?: number): IStatusBarDisposable;
    /**
     * Shows a temporary status bar message that hides when the promise resolves or rejects.
     *
     * @param text The message to show, supports $(icon-name) codicon syntax.
     * @param hideWhenDone Promise on whose completion the message will be disposed.
     *
     * @returns A disposable which hides the status bar message.
     */
    public static setStatusBarMessage(text: string, hideWhenDone: Promise<unknown>): IStatusBarDisposable;
    public static setStatusBarMessage(text: string,
        timeoutOrPromise?: Promise<unknown> | number): IStatusBarDisposable {
        if (!singleton.current) {
            throw new Error("Statusbar is not mounted. Call setStatusBarMessage after the Statusbar is rendered.");
        }

        const details: IStatusBarItemOptions = {
            id: "msg.statusBarMessage",
            text,
            alignment: StatusBarAlignment.Left,
            priority: -1000,
        };

        const { items } = singleton.current.state;

        let item = items.find((candidate) => {
            return candidate.id === details.id;
        });

        if (!item) {
            item = new StatusBarItem(singleton.current.update, details);
            items.push(item);
        } else {
            item.text = text;

            const timer = singleton.current.scheduledTimers.get(item.id);
            if (timer) {
                clearTimeout(timer);
                singleton.current.scheduledTimers.delete(item.id);
            }
        }

        if (timeoutOrPromise === undefined || typeof timeoutOrPromise === "number") {
            item.timeout = timeoutOrPromise ?? 5000;
            const timer = setTimeout(() => {
                item.hide();
            }, item.timeout);
            singleton.current.scheduledTimers.set(item.id, timer);
        } else {
            timeoutOrPromise.then(() => {
                item.hide();
            }).catch(() => {
                item.hide();
            });
        }

        singleton.current.setState({ items });

        return {
            dispose: () => {
                item.hide();
            },
        };
    }

    public override componentWillUnmount(): void {
        for (const [, timer] of this.scheduledTimers) {
            clearTimeout(timer);
        }

        this.scheduledTimers = new Map();
    }

    public render(): ComponentChild {
        const { items } = this.state;

        const { className, ...unhandled } = this.props;

        return (
            <Container
                className={this.generateFinalClassName(["statusbar"])}
                {...unhandled}
            >
                <Container
                    className="statusbar-left"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    {this.renderItems(items, StatusBarAlignment.Left)}
                </Container>
                <Container
                    className="statusbar-right"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Stretch}
                >
                    {this.renderItems(items, StatusBarAlignment.Right)}
                </Container>
            </Container>
        );
    }

    /**
     * Renders status bar items filtered by alignment and sorted by priority.
     *
     * @param allItems All status bar items.
     * @param alignment The alignment to filter by.
     *
     * @returns Sorted and filtered child elements.
     */
    private renderItems(allItems: IStatusBarItem[], alignment: StatusBarAlignment): ComponentChild[] {
        const filtered = allItems.filter((item) => {
            return item.alignment === alignment && item.visible;
        });

        filtered.sort((a, b) => {
            return (b.priority ?? -1e6) - (a.priority ?? -1e6);
        });

        return filtered.map((item, index) => {
            return this.renderItemButton(index, item);
        });
    }

    /**
     * Creates a span element for a single status bar item.
     * Converts $(icon-name) syntax in text to codicon spans.
     *
     * @param index The index of the item used for the preact key.
     * @param item The status bar item details for rendering.
     *
     * @returns A span element for the status bar item.
     */
    private renderItemButton(index: number, item: IStatusBarItem): ComponentChild {
        const text = item.text.replace(/[\n\r]/g, "");
        const elements: ComponentChild[] = [];
        let lastIndex = 0;
        const matches = [...text.matchAll(/\$\([a-z-~]+\)/g)];

        matches.forEach((match, i) => {
            if (match.index > lastIndex) {
                elements.push(text.substring(lastIndex, match.index));
            }

            let icon = match[0].slice(2, -1);
            let iconClass = "";
            if (icon.endsWith("~spin")) {
                iconClass += "codicon-modifier-spin ";
                icon = icon.slice(0, -5);
            }

            iconClass += `codicon codicon-${icon}`;

            elements.push(<span key={`icon-${index}-${i}`} className={iconClass} />);

            lastIndex = match.index + match[0].length;
        });

        if (lastIndex < text.length) {
            elements.push(text.substring(lastIndex));
        }

        const hasCommand = !!item.command;
        const className = "statusbar-item" + (hasCommand ? " statusbar-item-clickable" : "");

        return (
            <span
                key={`statusbarItem${index}`}
                id={item.id}
                class={className}
                data-command={item.command}
                title={item.tooltip}
                role={hasCommand ? "button" : undefined}
                tabIndex={hasCommand ? 0 : undefined}
                style={{
                    color: item.color,
                    backgroundColor: item.backgroundColor,
                }}
                onClick={hasCommand ? this.handleItemClick : undefined}
                onKeyDown={hasCommand ? this.handleItemKeyDown : undefined}
            >
                {elements}
            </span>
        );
    }

    private handleItemClick = (e: MouseEvent): void => {
        const target = e.currentTarget as HTMLElement;
        const command = target.getAttribute("data-command");
        if (command) {
            void requisitions.execute("statusBarItemClicked", { command, event: e });
        }
    };

    private handleItemKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const target = e.currentTarget as HTMLElement;
            const command = target.getAttribute("data-command");
            if (command) {
                void requisitions.execute("statusBarItemClicked", { command, event: e });
            }
        }
    };

    private update = (removeItem?: StatusBarItem): void => {
        const { items } = this.state;

        if (removeItem) {
            const index = items.findIndex((candidate) => {
                return candidate.id === removeItem.id;
            });

            if (index >= 0) {
                items.splice(index, 1);
            }
        }

        this.setState({ items });
    };
}

/**
 * Renders the Statusbar component and assigns the singleton ref.
 *
 * @returns The Statusbar component.
 */
export const renderStatusBar = (): ComponentChild => {
    return <Statusbar ref={singleton} />;
};
