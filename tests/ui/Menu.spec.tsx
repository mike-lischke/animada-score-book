/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UIIcon } from "../../src/components/ui/framework/UIIcon.js";
import { Menu } from "../../src/components/ui/framework/Menu/Menu.js";
import { type IMenuItem } from "../../src/components/ui/framework/Menu/MenuItem.js";
import * as utils from "../../src/core/utils.js";

const items: IMenuItem[] = [
    { id: "new", label: "New", icon: UIIcon.NewFile },
    { id: "sep", label: "-", disabled: true },
    { id: "del", label: "Delete", icon: UIIcon.Trash },
];

describe("Menu", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        vi.restoreAllMocks();
        let nextId = 100;
        vi.spyOn(utils, "getNewId").mockImplementation(() => {
            return nextId++;
        });
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders a trigger button when caption is given", () => {
        renderResult = render(<Menu items={items} caption="Actions" />);
        expect(renderResult.container.textContent).toContain("Actions");
    });

    it("renders a trigger button with icon when only icon is given", () => {
        renderResult = render(<Menu items={items} icon={UIIcon.KebabVertical} />);
        const button = renderResult.container.querySelector("button");

        expect(button).toBeTruthy();
        expect(button!.textContent).toBeFalsy(); // Image-only, no text caption.
    });

    it("renders no trigger when neither caption nor icon is given", () => {
        renderResult = render(<Menu items={items} />);
        const button = renderResult.container.querySelector("button");

        expect(button).toBeFalsy();
    });

    it("renders menu items when open", () => {
        renderResult = render(<Menu items={items} caption="Actions" />);

        // Open the menu programmatically.
        const popover = renderResult.container.querySelector<HTMLElement>("[popover]");
        if (popover) {
            popover.dispatchEvent(new Event("toggle"));
        }

        // The popover div should be in the DOM (always rendered).
        const popoverDiv = renderResult.container.querySelector<HTMLElement>("[popover]");

        expect(popoverDiv).toBeTruthy();
        expect(popoverDiv!.textContent).toContain("New");
        expect(popoverDiv!.textContent).toContain("Delete");
    });

    it("calls onItemClick with the item id when an item is clicked", () => {
        const onClick = vi.fn();

        renderResult = render(<Menu items={items} caption="Actions" onItemClick={onClick} />);

        const newItem = renderResult.container.querySelector<HTMLElement>(".menuItem:not(.separator):not(.disabled)");

        expect(newItem).toBeTruthy();
        newItem!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onClick).toHaveBeenCalledWith("new");
    });

    it("does not call onItemClick for disabled or separator items", () => {
        const onClick = vi.fn();

        renderResult = render(<Menu items={items} caption="Actions" onItemClick={onClick} />);

        const separator = renderResult.container.querySelector<HTMLElement>(".menuItem.separator");

        expect(separator).toBeTruthy();
        separator!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onClick).not.toHaveBeenCalled();
    });
});
