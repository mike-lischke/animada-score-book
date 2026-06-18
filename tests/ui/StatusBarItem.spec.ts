/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    StatusBarAlignment, StatusBarItem, type UpdateFunction
} from "../../src/components/ui/Statusbar/StatusBarItem.js";

describe.sequential("StatusBarItem", () => {
    let update: ReturnType<typeof vi.fn<UpdateFunction>>;

    beforeEach(() => {
        update = vi.fn<UpdateFunction>();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("assigns a generated id when none is provided", () => {
        const item = new StatusBarItem(update, { text: "test" });

        expect(item.id).toMatch(/^statusBarItem\.\d+$/);
    });

    it("uses the provided id when given", () => {
        const item = new StatusBarItem(update, { id: "custom.id", text: "test" });

        expect(item.id).toBe("custom.id");
    });

    it("defaults to Left alignment", () => {
        const item = new StatusBarItem(update, { text: "test" });

        expect(item.alignment).toBe(StatusBarAlignment.Left);
    });

    it("accepts Right alignment", () => {
        const item = new StatusBarItem(update, { text: "test", alignment: StatusBarAlignment.Right });

        expect(item.alignment).toBe(StatusBarAlignment.Right);
    });

    it("is visible by default", () => {
        const item = new StatusBarItem(update, { text: "test" });

        expect(item.visible).toBe(true);
    });

    it("show and hide toggle visibility and call update", () => {
        const item = new StatusBarItem(update, { text: "test" });
        // Constructor calls update once when setting text.
        expect(update).toHaveBeenCalledTimes(1);

        item.hide();
        expect(item.visible).toBe(false);
        expect(update).toHaveBeenCalledTimes(2);

        item.show();
        expect(item.visible).toBe(true);
        expect(update).toHaveBeenCalledTimes(3);
    });

    it("setting text calls update", () => {
        const item = new StatusBarItem(update, { text: "initial" });
        // Constructor already called update once.
        update.mockClear();

        item.text = "changed";
        expect(item.text).toBe("changed");
        expect(update).toHaveBeenCalledTimes(1);
    });

    it("setting timeout calls update", () => {
        const item = new StatusBarItem(update, { text: "test" });
        // Constructor already called update once.
        update.mockClear();

        item.timeout = 3000;
        expect(item.timeout).toBe(3000);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it("dispose calls update with the item itself", () => {
        const item = new StatusBarItem(update, { text: "test" });
        // Constructor already called update once.
        update.mockClear();

        item.dispose();
        expect(update).toHaveBeenCalledWith(item);
    });

    it("stores tooltip, command, color and backgroundColor", () => {
        const item = new StatusBarItem(update, {
            text: "test",
            tooltip: "hover text",
            command: "my.command",
        });

        item.color = "#ff0000";
        item.backgroundColor = "#0000ff";

        expect(item.tooltip).toBe("hover text");
        expect(item.command).toBe("my.command");
        expect(item.color).toBe("#ff0000");
        expect(item.backgroundColor).toBe("#0000ff");
    });

    it("stores priority from options", () => {
        const item = new StatusBarItem(update, { text: "test", priority: 42 });

        expect(item.priority).toBe(42);
    });
});
