/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UIIcon } from "../../src/components/ui/framework/UIIcon.js";
import { MenuBar } from "../../src/components/ui/framework/Menu/MenuBar.js";
import { type IMenuItem } from "../../src/components/ui/framework/Menu/MenuItem.js";

interface IMenuBarItem extends IMenuItem {
    children?: IMenuItem[];
}

const items: IMenuBarItem[] = [
    {
        id: "file", label: "File", children: [
            { id: "new", label: "New" },
            { id: "open", label: "Open" },
        ]
    },
    { id: "help", label: "Help" },
];

describe("MenuBar", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders all top-level items as buttons", () => {
        renderResult = render(<MenuBar items={items} />);
        const buttons = renderResult.container.querySelectorAll("button");

        expect(buttons.length).toBe(2);
        expect(buttons[0].textContent).toContain("File");
        expect(buttons[1].textContent).toContain("Help");
    });

    it("renders icons when provided", () => {
        const iconItems: IMenuBarItem[] = [
            { id: "file", label: "File", icon: UIIcon.File, children: [] },
        ];

        renderResult = render(<MenuBar items={iconItems} />);
        const icon = renderResult.container.querySelector("svg.icon[data-icon='File']");

        expect(icon).toBeTruthy();
    });

    it("calls onItemClick when a top-level item is clicked", () => {
        const onClick = vi.fn();

        renderResult = render(<MenuBar items={items} onItemClick={onClick} />);
        const button = renderResult.container.querySelector("button")!;

        button.click();
        expect(onClick).toHaveBeenCalledWith("file");
    });

    it("renders submenu for items with children", () => {
        renderResult = render(<MenuBar items={items} />);

        // Click the "File" button to open its submenu.
        const fileButton = renderResult.container.querySelector("button")!;

        fileButton.click();

        // The submenu should have appeared.
        const popovers = renderResult.container.querySelectorAll("[popover]");

        // The menu div with popover attribute should contain sub-items.
        expect(popovers.length).toBeGreaterThan(0);
    });
});
