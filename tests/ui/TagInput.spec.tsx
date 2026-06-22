/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ITag, TagInput } from "../../src/components/ui/framework/TagInput.js";

describe("TagInput", () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("renders existing tags as badges", () => {
        const tags: ITag[] = [
            { id: 1, caption: "Alpha" },
            { id: 2, caption: "Beta" },
        ];

        renderResult = render(<TagInput tags={tags} />);
        const badges = renderResult.container.querySelectorAll(".badge");

        expect(badges.length).toBe(2);
        expect(badges[0].textContent).toContain("Alpha");
        expect(badges[1].textContent).toContain("Beta");
    });

    it("renders remove buttons when removable is true", () => {
        const tags: ITag[] = [{ id: 1, caption: "Alpha" }];

        renderResult = render(<TagInput tags={tags} removable />);
        const removeButtons = renderResult.container.querySelectorAll("button");

        expect(removeButtons.length).toBe(1);
    });

    it("does not render remove buttons when removable is not set", () => {
        const tags: ITag[] = [{ id: 1, caption: "Alpha" }];

        renderResult = render(<TagInput tags={tags} />);
        const removeButtons = renderResult.container.querySelectorAll("button");

        expect(removeButtons.length).toBe(0);
    });

    it("calls onRemove with the tag id when remove button is clicked", () => {
        const onRemove = vi.fn();
        const tags: ITag[] = [{ id: 42, caption: "Alpha" }];

        renderResult = render(<TagInput tags={tags} removable onRemove={onRemove} />);
        const button = renderResult.container.querySelector("button")!;

        button.click();
        expect(onRemove).toHaveBeenCalledWith(42);
    });

    it("renders a text input for adding new tags", () => {
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} />);
        const input = renderResult.container.querySelector("input");

        expect(input).toBeTruthy();
        expect(input!.getAttribute("placeholder")).toBe("Add…");
    });

    it("calls onAdd with trimmed input value when Enter is pressed", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "  Gamma  " } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).toHaveBeenCalledWith("Gamma");
    });

    it("clears the input after adding a tag", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Delta" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect((input as HTMLInputElement).value).toBe("");
    });

    it("does not call onAdd when Enter is pressed with empty input", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.keyDown(input, { key: "Enter" });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("shows matching completions when typing", () => {
        const completions = ["Apple", "Apricot", "Banana", "Cherry"];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });

        const dropdown = renderResult.container.querySelector("ul");

        expect(dropdown).toBeTruthy();
        expect(dropdown!.textContent).toContain("Apple");
        expect(dropdown!.textContent).toContain("Apricot");
        expect(dropdown!.textContent).not.toContain("Banana");
    });

    it("excludes already-tagged captions from completions", () => {
        const completions = ["Apple", "Banana"];
        const tags: ITag[] = [{ id: 1, caption: "Apple" }];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "A" } });

        const dropdown = renderResult.container.querySelector("ul");

        expect(dropdown).toBeFalsy(); // Apple is already tagged, no other A-matches.
    });

    it("selects a completion on click", () => {
        const onAdd = vi.fn();
        const completions = ["Apple", "Apricot"];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });

        const firstCompletion = renderResult.container.querySelector("li a")!;

        fireEvent.mouseDown(firstCompletion);
        expect(onAdd).toHaveBeenCalledWith("Apple");
    });

    it("navigates completions with arrow keys", () => {
        const completions = ["Apple", "Apricot"];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });
        fireEvent.keyDown(input, { key: "ArrowDown" });

        let active = renderResult.container.querySelector("li.du-active");

        expect(active?.textContent).toContain("Apple");

        fireEvent.keyDown(input, { key: "ArrowDown" });

        active = renderResult.container.querySelector("li.du-active");
        expect(active?.textContent).toContain("Apricot");

        fireEvent.keyDown(input, { key: "ArrowDown" });

        active = renderResult.container.querySelector("li.du-active");
        expect(active?.textContent).toContain("Apple"); // Wraps around.
    });
});
