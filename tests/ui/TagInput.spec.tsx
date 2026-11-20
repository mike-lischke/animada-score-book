/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type ITag, type ITagCompletion, TagInput
} from "../../src/components/ui/framework/TagInput.js";
import { TagPalette } from "../../src/core/TagPalette.js";

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
        const badges = renderResult.container.querySelectorAll(".du-badge");

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

    it("keeps the close button away from a locked tag", () => {
        const onRemove = vi.fn();
        const tags: ITag[] = [
            { id: 1, caption: "Caixa", locked: true },
            { id: 2, caption: "Source" },
        ];

        renderResult = render(<TagInput tags={tags} removable onRemove={onRemove} />);
        const removeButtons = renderResult.container.querySelectorAll("button");

        expect(removeButtons.length).toBe(1);

        removeButtons[0].click();
        expect(onRemove).toHaveBeenCalledWith(2);
    });

    it("renders a text input for adding new tags", () => {
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} />);
        const input = renderResult.container.querySelector("input");

        expect(input).toBeTruthy();
        expect(input!.getAttribute("placeholder")).toBe("Add…");
    });

    it("renders a plain tag list without input, close buttons and colour pickers when read only", () => {
        const tags: ITag[] = [
            { id: 1, caption: "Alpha", colorIndex: 1 },
            { id: 2, caption: "Beta", locked: true },
        ];
        const onBadgeColourChange = vi.fn();

        renderResult = render(
            <TagInput tags={tags} readOnly removable onBadgeColourChange={onBadgeColourChange} />,
        );

        expect(renderResult.container.querySelectorAll(".du-badge").length).toBe(2);
        expect(renderResult.container.querySelector("input")).toBeFalsy();
        expect(renderResult.container.querySelector("button")).toBeFalsy();
    });

    it("passes the palette colour of the tag to the stylesheet", () => {
        const tags: ITag[] = [{ id: 1, caption: "Alpha", colorIndex: 1 }];

        renderResult = render(<TagInput tags={tags} readOnly />);
        const badge = renderResult.container.querySelector<HTMLElement>(".tag-input-tag")!;

        expect(badge.classList.contains("tag-input-tag-colored")).toBe(true);
        expect(badge.style.getPropertyValue("--tag-color")).toBe(TagPalette.colourAt(1).color);
    });

    it("offers the palette per tag when colour changes are handled", () => {
        const onBadgeColourChange = vi.fn();
        const tags: ITag[] = [{ id: 1, caption: "Alpha", colorIndex: 1 }];

        renderResult = render(<TagInput tags={tags} onBadgeColourChange={onBadgeColourChange} />);
        const picker = renderResult.container.querySelector<HTMLSelectElement>(".tag-input-colour-picker")!;

        expect(picker.querySelectorAll("option").length).toBe(TagPalette.count);

        fireEvent.change(picker, { target: { value: "3" } });
        expect(onBadgeColourChange).toHaveBeenCalledWith(1, 3);
    });

    it("calls onAdd with a caption when allowNew lets the input create a tag", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} allowNew onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "  Gamma  " } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).toHaveBeenCalledWith({ caption: "Gamma" });
    });

    it("does not call onAdd for unknown text when allowNew is not set", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Gamma" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).not.toHaveBeenCalled();
    });

    it("clears the input after adding a tag", () => {
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} allowNew onAdd={vi.fn()} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Delta" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(input.value).toBe("");
    });

    it("does not call onAdd when Enter is pressed with empty input", () => {
        const onAdd = vi.fn();
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} allowNew onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.keyDown(input, { key: "Enter" });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("shows matching completions when typing", () => {
        const completions: ITagCompletion[] = [
            { caption: "Apple" }, { caption: "Apricot" }, { caption: "Banana" }, { caption: "Cherry" },
        ];
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

    it("leaves the tags on the entity out of the completions", () => {
        const completions: ITagCompletion[] = [{ caption: "Apple", tagId: 1 }];
        const tags: ITag[] = [{ id: 1, caption: "Apple" }];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "A" } });

        expect(renderResult.container.querySelector("ul")).toBeFalsy();
    });

    it("still offers a same-named tag of another owner that is not on the entity", () => {
        const completions: ITagCompletion[] = [
            { caption: "Apple", tagId: 1 },
            { caption: "Apple", tagId: 2, owner: "Group" },
        ];
        const tags: ITag[] = [{ id: 1, caption: "Apple" }];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "App" } });

        const dropdown = renderResult.container.querySelector("ul")!;

        expect(dropdown.querySelectorAll("li").length).toBe(1);
        expect(dropdown.textContent).toContain("Group");
    });

    it("shows the owner only next to a name that occurs more than once", () => {
        const completions: ITagCompletion[] = [
            { caption: "Caixa", tagId: 1, owner: "Global" },
            { caption: "Caixa", tagId: 2, owner: "Group" },
            { caption: "Surdo", tagId: 3, owner: "Global" },
        ];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ca" } });

        const owners = Array.from(renderResult.container.querySelectorAll(".tag-input-completion-owner")).map((o) => {
            return o.textContent;
        });

        expect(owners).toEqual(["Global", "Group"]);

        fireEvent.input(input, { target: { value: "Su" } });

        expect(renderResult.container.querySelector(".tag-input-completion-owner")).toBeFalsy();
    });

    it("selects a completion on click", () => {
        const onAdd = vi.fn();
        const completions: ITagCompletion[] = [{ caption: "Apple", tagId: 7 }, { caption: "Apricot", tagId: 8 }];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });

        const firstCompletion = renderResult.container.querySelector("li a")!;

        fireEvent.mouseDown(firstCompletion);
        expect(onAdd).toHaveBeenCalledWith({ caption: "Apple", tagId: 7 });
    });

    it("navigates completions with arrow keys", () => {
        const completions: ITagCompletion[] = [{ caption: "Apple" }, { caption: "Apricot" }];
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

    it("walks the completions backwards with ArrowUp", () => {
        const completions: ITagCompletion[] = [{ caption: "Apple" }, { caption: "Apricot" }];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });
        fireEvent.keyDown(input, { key: "ArrowUp" });

        const active = renderResult.container.querySelector("li.du-active");

        expect(active?.textContent).toContain("Apricot"); // Wraps to the last entry.
    });

    it("ignores whitespace-only input", () => {
        const onAdd = vi.fn();
        const completions: ITagCompletion[] = [{ caption: "Apple", tagId: 7 }];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} allowNew onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "   " } });

        expect(renderResult.container.querySelector("ul")).toBeFalsy();

        fireEvent.keyDown(input, { key: "Enter" });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("commits the highlighted completion on Enter", () => {
        const onAdd = vi.fn();
        const completions: ITagCompletion[] = [{ caption: "Apple", tagId: 7 }, { caption: "Apricot", tagId: 8 }];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Ap" } });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).toHaveBeenCalledWith({ caption: "Apricot", tagId: 8 });
    });

    it("takes the existing tag when its name is typed, whatever the case and accents", () => {
        const onAdd = vi.fn();
        const completions: ITagCompletion[] = [{ caption: "Café", tagId: 5 }];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} allowNew onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "cafe" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).toHaveBeenCalledWith({ caption: "Café", tagId: 5 });
    });

    it("does not commit a typed name that several tags share", () => {
        const onAdd = vi.fn();
        const completions: ITagCompletion[] = [
            { caption: "Caixa", tagId: 1, owner: "Global" },
            { caption: "Caixa", tagId: 2, owner: "Group" },
        ];
        const tags: ITag[] = [];

        renderResult = render(<TagInput tags={tags} completions={completions} allowNew onAdd={onAdd} />);
        const input = renderResult.container.querySelector("input")!;

        fireEvent.input(input, { target: { value: "Caixa" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onAdd).not.toHaveBeenCalled();
    });
});
