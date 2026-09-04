/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { getNewId } from "../../../core/utils.js";
import { Button } from "./Button.js";
import { type ICommonUIProperties, type MouseEventCallback, UIComponent } from "./UIComponent.js";

export interface IDropdownItem {
    label?: string;
    icon?: ComponentChild;
    disabled?: boolean;
    onClick?: MouseEventCallback;
}

export interface IDropdownProperties extends ICommonUIProperties {
    caption?: string;
    icon?: ComponentChild;
    selectedItem?: string;
    items: IDropdownItem[];

    /** If true, the dropdown closes automatically after an item is selected. Defaults to false. */
    closeOnSelect?: boolean;
}

interface IDropdownState {
    activeIndex: number;
}

export class Dropdown extends UIComponent<IDropdownProperties, IDropdownState> {
    private anchorName = `--anchor-${getNewId()}`;
    private popoverId = `popover-${getNewId()}`;
    private listRef = createRef<HTMLUListElement>();

    public constructor(props: IDropdownProperties) {
        super(props);

        this.state = { activeIndex: -1 };
    }

    public render(): ComponentChild {
        const { id, caption, disabled, icon, items, selectedItem, style } = this.props;
        const { activeIndex } = this.state;

        const children = items.map((item, index) => {
            const isInteractive = item.onClick !== undefined && !item.disabled;

            return (
                <li
                    key={index}
                    className={[
                        item.label === selectedItem ? "selected" : "",
                        isInteractive && index === activeIndex ? "active" : "",
                        item.disabled ? "disabled" : isInteractive ? "" : "dropdown-caption",
                    ].filter(Boolean).join(" ")}
                >
                    <a
                        tabIndex={isInteractive ? 0 : -1}
                        aria-disabled={item.disabled ? "true" : undefined}
                        onClick={(e) => {
                            if (isInteractive) {
                                this.selectItem(index, e);
                            }
                        }}
                    >
                        {item.icon && <span className="inline-flex w-6 h-6 items-center justify-center">
                            {item.icon}
                        </span>}
                        {item.label}
                    </a>
                </li>
            );
        });

        const defaultCaption = !caption && (icon === undefined) ? "Select an option" : undefined;
        const className = this.generateFinalClassName(["dropdownHost"]);

        return (
            <div id={id} className={className}>
                <Button
                    className="du-btn-ghost"
                    popoverTarget={disabled ? undefined : this.popoverId}
                    style={{ ...style, anchorName: this.anchorName }}
                    imageOnly={!caption && icon !== undefined}
                    disabled={disabled}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                    {...this.dataAttributes}
                >
                    {icon}
                    {caption ?? defaultCaption}
                </Button>

                <ul
                    ref={this.listRef}
                    className="du-dropdown du-menu dropdown-popup"
                    popover="auto"
                    id={this.popoverId}
                    style={{ positionAnchor: this.anchorName }}
                    onKeyDown={this.handleKeyDown}
                    onToggle={this.handlePopoverToggle}
                >
                    {children}
                </ul>
            </div>
        );
    }

    private selectItem = (index: number, e: MouseEvent | KeyboardEvent): void => {
        const { closeOnSelect, items } = this.props;
        const item = items[index];

        if (!item.onClick) {
            return;
        }

        item.onClick(e as MouseEvent);

        if (closeOnSelect) {
            document.getElementById(this.popoverId)?.hidePopover();
        }
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        const { items } = this.props;
        const { activeIndex } = this.state;

        switch (e.key) {
            case "ArrowDown": {
                e.preventDefault();
                const next = this.findNextInteractive(activeIndex, 1);

                this.setState({ activeIndex: next }, () => {
                    this.scrollActiveIntoView();
                });

                break;
            }

            case "ArrowUp": {
                e.preventDefault();
                const next = this.findNextInteractive(activeIndex, -1);

                this.setState({ activeIndex: next }, () => {
                    this.scrollActiveIntoView();
                });

                break;
            }

            case "Enter": {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < items.length) {
                    this.selectItem(activeIndex, e);
                }

                break;
            }

            default: {
                break;
            }
        }
    };

    /**
     * Finds the next interactive item index in the given direction.
     * Returns the current index if no interactive items exist.
     *
     * @param from      Starting index.
     * @param direction +1 for down, -1 for up.
     * @returns The next interactive index, or -1 if none exist.
     */
    private findNextInteractive(from: number, direction: number): number {
        const { items } = this.props;

        if (items.length === 0) {
            return -1;
        }

        for (let i = 0; i < items.length; i++) {
            const raw = from + (direction * (i + 1));
            const index = ((raw % items.length) + items.length) % items.length;

            if (items[index].onClick) {
                return index;
            }
        }

        return -1;
    }

    private scrollActiveIntoView(): void {
        const list = this.listRef.current;

        if (!list) {
            return;
        }

        const active = list.querySelector("li.active");

        active?.scrollIntoView({ block: "nearest" });
    }

    /**
     * When the popover opens, reset the active index and focus the first
     * interactive item so keyboard navigation works immediately.
     *
     * @param e The toggle event from the popover.
     */
    private handlePopoverToggle = (e: Event): void => {
        const popover = e.target as HTMLElement;

        if (popover.matches(":popover-open")) {
            this.setState({ activeIndex: -1 }, () => {
                const first = this.listRef.current?.querySelector(
                    "li:not(.dropdown-caption):not(.disabled) a",
                ) as HTMLElement | null;

                first?.focus();
            });
        }
    };
}
