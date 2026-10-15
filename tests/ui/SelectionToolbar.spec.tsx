/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    SelectionToolbar, type ISelectionToolbarAction, type ISelectionToolbarSection, type ISelectionToolbarTitle,
} from "../../src/components/ui/Arrangement/SelectionToolbar.js";
import type { ICommonUIProperties } from "../../src/components/ui/framework/UIComponent.js";

interface ITestToolbarProps extends ICommonUIProperties {
    heading: ISelectionToolbarTitle;
    sections: ISelectionToolbarSection[];
}

/** The card alone, so the base can be tested without the score elements a toolbar serves. */
class TestToolbar extends SelectionToolbar<ITestToolbarProps, Record<string, never>> {
    protected override get toolbarTitle(): ISelectionToolbarTitle {
        return this.props.heading;
    }

    protected override get toolbarSections(): ISelectionToolbarSection[] {
        return this.props.sections;
    }
}

/**
 * @param id The action's identity, which also names the icon it draws.
 * @param extra Further fields of the action.
 *
 * @returns The action.
 */
const action = (id: string, extra: Partial<ISelectionToolbarAction> = {}): ISelectionToolbarAction => {
    return { id, icon: <span className={`icon-${id}`} />, ...extra };
};

describe("SelectionToolbar", { concurrent: false }, () => {
    let renderResult: RenderResult | null = null;

    const renderCard = (heading: ISelectionToolbarTitle, sections: ISelectionToolbarSection[]): RenderResult => {
        renderResult = render(<TestToolbar heading={heading} sections={sections} />);

        return renderResult;
    };

    const captions = (result: RenderResult): Array<string | null> => {
        return [...result.container.querySelectorAll(".selectionToolbarSection")].map((element) => {
            return element.textContent;
        });
    };

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
        vi.restoreAllMocks();
    });

    it("draws the instrument, its dot and the position of the addressed elements", () => {
        const result = renderCard({ instrument: "Caixa", position: "Measure 2", color: "#123456" }, [{ actions: [] }]);
        const dot = result.container.querySelector<HTMLElement>(".selectionToolbarDot");

        expect(dot?.style.backgroundColor).toBe("rgb(18, 52, 86)");
        expect(result.container.querySelector(".selectionToolbarInstrument")?.textContent).toBe("Caixa");
        expect(result.container.querySelector(".selectionToolbarSeparator")?.textContent).toBe("-");
        expect(result.container.querySelector(".selectionToolbarPosition")?.textContent).toBe("Measure 2");
    });

    it("leaves the position out while the toolbar names one element", () => {
        const result = renderCard({ instrument: "Caixa" }, [{ actions: [] }]);

        expect(result.container.querySelector(".selectionToolbarSeparator")).toBeNull();
        expect(result.container.querySelector(".selectionToolbarPosition")).toBeNull();
    });

    it("draws one tray without a caption", () => {
        const result = renderCard({ instrument: "Caixa" },
            [{ label: "Ignored", actions: [action("first"), action("second")] }]);

        expect(captions(result)).toEqual([]);
        expect(result.container.querySelectorAll(".selectionToolbarActions")).toHaveLength(1);
        expect(result.container.querySelectorAll(".selectionToolbarAction")).toHaveLength(2);
    });

    it("captions both trays while the card holds two sections", () => {
        const result = renderCard({ instrument: "Caixa" }, [
            { label: "Piece", actions: [action("first")] },
            { label: "Entry", actions: [action("second"), action("third")] },
        ]);

        expect(captions(result)).toEqual(["Piece", "Entry"]);
        expect(result.container.querySelectorAll(".selectionToolbarActions")).toHaveLength(2);
        expect(result.container.querySelectorAll(".selectionToolbarAction")).toHaveLength(3);
    });

    it("leaves a section without a label uncaptioned while the card holds several", () => {
        const result = renderCard({ instrument: "Caixa" }, [
            { actions: [action("first")] },
            { label: "Entry", actions: [action("second")] },
        ]);

        expect(captions(result)).toEqual(["Entry"]);
    });

    it("draws an action as the state it states", () => {
        const result = renderCard({ instrument: "Caixa" }, [{
            actions: [
                action("plain", { tooltip: "Plain" }),
                action("active", { tooltip: "Active", active: true }),
                action("destructive", { tooltip: "Delete", destructive: true }),
                action("disabled", { tooltip: "Disabled", disabled: true }),
            ],
        }]);

        const buttons = [...result.container.querySelectorAll<HTMLButtonElement>(".selectionToolbarAction")];

        expect(buttons.map((button) => {
            return button.title;
        })).toEqual(["Plain", "Active", "Delete", "Disabled"]);
        expect(buttons[0].classList.contains("is-destructive")).toBe(false);
        expect(buttons[1].classList.contains("du-btn-primary")).toBe(true);
        expect(buttons[2].classList.contains("is-destructive")).toBe(true);
        expect(buttons[3].disabled).toBe(true);
    });

    it("runs the handler of the action that was clicked", () => {
        const onClick = vi.fn();
        const result = renderCard({ instrument: "Caixa" }, [{ actions: [action("first", { onClick })] }]);

        fireEvent.click(result.container.querySelector<HTMLButtonElement>(".selectionToolbarAction")!);

        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
