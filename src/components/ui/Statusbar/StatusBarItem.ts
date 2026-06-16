/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { getNewId } from "../../../core/utils.js";

/** Represents the alignment of status bar items. */
export enum StatusBarAlignment {
    /** Aligned to the left side. */
    Left = 1,

    /** Aligned to the right side. */
    Right = 2,
}

export type UpdateFunction = (removeItem?: StatusBarItem) => void;

export interface IStatusBarItemOptions {
    id?: string;
    text?: string;
    tooltip?: string;
    command?: string;
    alignment?: StatusBarAlignment;
    priority?: number;
    timeout?: number;
}

/**
 * A status bar item modelled after the VS Code StatusBarItem interface.
 */
export interface IStatusBarItem extends IStatusBarItemOptions {
    /** The identifier of this item. Auto-generated if not provided. */
    readonly id: string;

    /** The alignment of this item. */
    readonly alignment: StatusBarAlignment;

    /**
     * The priority of this item. Higher value means the item should be shown more to the left.
     * Items with the same priority are displayed from left to right in the order they were added.
     */
    readonly priority?: number;

    /** The text to show for the entry. Supports $(icon-name) codicon syntax. */
    text: string;

    /** The tooltip text when hovering over this entry. */
    tooltip?: string;

    /** The foreground color for this entry. */
    color?: string;

    /** The background color for this entry. */
    backgroundColor?: string;

    /** Command identifier to run on click. */
    command?: string;

    /** When given the item is automatically hidden after that timeout. */
    timeout?: number;

    /** Whether the entry is visible. */
    visible: boolean;

    /** Shows the entry in the status bar. */
    show(): void;

    /** Hide the entry in the status bar. */
    hide(): void;

    /** Dispose and free associated resources. */
    dispose(): void;
}

export class StatusBarItem implements IStatusBarItem {
    public readonly id: string;
    public readonly alignment: StatusBarAlignment;
    public readonly priority?: number;

    public tooltip?: string;
    public color?: string;
    public backgroundColor?: string;
    public command?: string;

    #visible: boolean;
    #text = "";
    #timeout: number | undefined;

    public constructor(private update: UpdateFunction, options: IStatusBarItemOptions) {
        this.id = options.id ?? `statusBarItem.${getNewId()}`;
        this.text = options.text ?? "";
        this.tooltip = options.tooltip;
        this.command = options.command;
        this.alignment = options.alignment ?? StatusBarAlignment.Left;
        this.priority = options.priority;
        this.#visible = true;
        this.#timeout = options.timeout;
    }

    public get visible(): boolean {
        return this.#visible;
    }

    public get text(): string {
        return this.#text;
    }

    public set text(value: string) {
        this.#text = value;
        this.update();
    }

    public get timeout(): number | undefined {
        return this.#timeout;
    }

    public set timeout(value: number | undefined) {
        this.#timeout = value;
        this.update();
    }

    public show(): void {
        this.#visible = true;
        this.update();
    }

    public hide(): void {
        this.#visible = false;
        this.update();
    }

    public dispose(): void {
        this.update(this);
    }
}
