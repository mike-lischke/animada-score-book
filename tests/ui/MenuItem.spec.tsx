/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Codicon } from "../../src/components/ui/framework/Codicon.js";
import { type IMenuItem, MenuItem } from "../../src/components/ui/framework/Menu/MenuItem.js";

describe("MenuItem", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders a label", () => {
        const item: IMenuItem = { id: "test", label: "Hello" };

        renderResult = render(<MenuItem item={item} />);
        expect(renderResult.container.textContent).toContain("Hello");
    });

    it("renders an icon when provided", () => {
        const item: IMenuItem = { id: "test", label: "Save", icon: Codicon.Save };

        renderResult = render(<MenuItem item={item} />);
        const icon = renderResult.container.querySelector(".codicon-save");

        expect(icon).toBeTruthy();
    });

    it("renders a separator when label is '-' and disabled", () => {
        const item: IMenuItem = { id: "sep", label: "-", disabled: true };

        renderResult = render(<MenuItem item={item} />);
        const el = renderResult.container.firstElementChild!;

        expect(el.className).toContain("separator");
        expect(el.className).toContain("disabled");
    });

    it("renders a submenu arrow when hasSubMenu is true", () => {
        const item: IMenuItem = { id: "sub", label: "More", hasSubMenu: true };

        renderResult = render(<MenuItem item={item} />);
        const icon = renderResult.container.querySelector(".codicon-chevron-right");

        expect(icon).toBeTruthy();
    });

    it("applies disabled class when disabled", () => {
        const item: IMenuItem = { id: "disabled", label: "Nope", disabled: true };

        renderResult = render(<MenuItem item={item} />);
        expect(renderResult.container.firstElementChild!.className).toContain("disabled");
    });
});
