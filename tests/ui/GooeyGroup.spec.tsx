/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GooeyGroup } from "../../src/components/ui/framework/GooeyGroup.js";

describe("GooeyGroup", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders its children", () => {
        renderResult = render(
            <GooeyGroup>
                <button>One</button>
                <button>Two</button>
            </GooeyGroup>,
        );

        expect(renderResult.container.textContent).toContain("One");
        expect(renderResult.container.textContent).toContain("Two");
    });

    it("renders a gooey filter and applies it to the wrapper", () => {
        renderResult = render(<GooeyGroup>content</GooeyGroup>);

        const filter = renderResult.container.querySelector("filter");
        expect(filter).toBeTruthy();

        const filterId = filter!.getAttribute("id");
        expect(filterId).toMatch(/^gooey-\d+$/);

        const wrapper = renderResult.container.querySelector(".gooey-group");
        expect(wrapper).toBeTruthy();
        expect(wrapper!.getAttribute("style")).toContain(`url(#${filterId})`);
    });

    it("merges className and forwards data attributes to the wrapper", () => {
        renderResult = render(
            <GooeyGroup className="custom-class" data-foo="bar">
                content
            </GooeyGroup>,
        );

        const wrapper = renderResult.container.querySelector(".gooey-group");
        expect(wrapper).toBeTruthy();
        expect(wrapper!.className).toContain("custom-class");
        expect(wrapper!.getAttribute("data-foo")).toBe("bar");
    });

    it("assigns a unique filter id to each instance", () => {
        renderResult = render(
            <>
                <GooeyGroup>one</GooeyGroup>
                <GooeyGroup>two</GooeyGroup>
            </>,
        );

        const ids = Array.from(renderResult.container.querySelectorAll("filter")).map((filter) => {
            return filter.getAttribute("id");
        });

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it("floods the blob with the configured background color", () => {
        renderResult = render(<GooeyGroup background="red">content</GooeyGroup>);

        const flood = renderResult.container.querySelector("feFlood[result='bgColor']");
        expect(flood).toBeTruthy();
        expect(flood!.getAttribute("flood-color")).toBe("red");

        const colorMatrix = renderResult.container.querySelector("feColorMatrix");
        expect(colorMatrix!.getAttribute("result")).toBe("gooShape");
    });

    it("keeps the children's colors when no background is configured", () => {
        renderResult = render(<GooeyGroup>content</GooeyGroup>);

        expect(renderResult.container.querySelector("feFlood[result='bgColor']")).toBeFalsy();

        const colorMatrix = renderResult.container.querySelector("feColorMatrix");
        expect(colorMatrix!.getAttribute("result")).toBe("goo");
    });

    it("matches snapshot for default rendering", () => {
        renderResult = render(
            <GooeyGroup>
                <button>One</button>
                <button>Two</button>
            </GooeyGroup>,
        );

        // Normalize the per-instance filter id so the snapshot stays stable across runs.
        const html = renderResult.container.innerHTML.replace(/gooey-\d+/g, "gooey-ID");
        expect(html).toMatchSnapshot();
    });
});
