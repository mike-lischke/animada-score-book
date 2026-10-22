/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Stack } from "./Stack.js";

type EscHandler = () => void;

/**
 * Orders the layers Escape closes: only the topmost registered layer reacts, so one key press never closes
 * more than one level. A layer unregisters itself when it closes; while no layer is registered the fallback runs.
 *
 * Native popovers are tracked here too, because the browser closes them on Escape on its own. Registering them
 * keeps Escape from reaching the layer they were opened in.
 */
class EscapeStack extends Stack<EscHandler> {
    private attached = false;

    /** Handlers of currently open native popovers, keyed by their element. */
    private readonly popoverHandlers = new Map<HTMLElement, EscHandler>();

    private fallback?: EscHandler;

    public attach(): void {
        if (this.attached) {
            return;
        }

        this.attached = true;
        window.addEventListener("keydown", this.handleKey);
        // The toggle event does not bubble, so it has to be observed in the capture phase.
        document.addEventListener("toggle", this.handlePopoverToggle, true);
    }

    public detach(): void {
        if (!this.attached) {
            return;
        }

        this.attached = false;
        window.removeEventListener("keydown", this.handleKey);
        document.removeEventListener("toggle", this.handlePopoverToggle, true);
    }

    /**
     * Registers the handler of a layer at the top of the stack.
     *
     * @param handlers The handlers that close the registered layers.
     * @returns The new length of the stack.
     */
    public override push(...handlers: EscHandler[]): number {
        this.attach();

        return super.push(...handlers);
    }

    /**
     * Registers the handler of a layer at the top of the stack, unless it is already registered.
     *
     * @param handler The handler that closes the layer.
     */
    public register(handler: EscHandler): void {
        if (!this.includes(handler)) {
            this.push(handler);
        }
    }

    /**
     * Sets the handler that runs while no layer is registered.
     *
     * @param handler The handler, or undefined to remove the fallback.
     */
    public setFallback(handler: EscHandler | undefined): void {
        this.fallback = handler;

        if (handler) {
            this.attach();
        }
    }

    /**
     * Removes the given handler from the stack.
     *
     * @param handler The handler to remove from the stack.
     * @returns True if the handler was found and removed, false otherwise.
     */
    public remove(handler: EscHandler): boolean {
        const index = this.indexOf(handler);
        if (index < 0) {
            return false;
        }

        this.splice(index, 1);
        this.detachIfUnused();

        return true;
    }

    private detachIfUnused(): void {
        if (this.empty && !this.fallback && this.popoverHandlers.size === 0) {
            this.detach();
        }
    }

    private handleKey = (e: KeyboardEvent): void => {
        if (e.key !== "Escape") {
            return;
        }

        this.pruneDetachedPopovers();

        const handler = this.top ?? this.fallback;
        if (!handler) {
            return;
        }

        e.stopImmediatePropagation();
        e.preventDefault();
        handler();
    };

    private handlePopoverToggle = (e: Event): void => {
        const element = e.target;
        if (!(element instanceof HTMLElement) || !element.hasAttribute("popover")) {
            return;
        }

        if (element.matches(":popover-open")) {
            this.registerPopover(element);
        } else {
            this.unregisterPopover(element);
        }
    };

    private registerPopover(element: HTMLElement): void {
        if (this.popoverHandlers.has(element)) {
            return;
        }

        const handler = (): void => {
            this.unregisterPopover(element);

            if (element.matches(":popover-open")) {
                element.hidePopover();
            }
        };

        this.popoverHandlers.set(element, handler);
        this.push(handler);
    }

    private unregisterPopover(element: HTMLElement): void {
        const handler = this.popoverHandlers.get(element);
        if (!handler) {
            return;
        }

        this.popoverHandlers.delete(element);
        this.remove(handler);
    }

    /** Drops popovers that left the document without reporting a toggle event. */
    private pruneDetachedPopovers(): void {
        for (const element of this.popoverHandlers.keys()) {
            if (!element.isConnected) {
                this.unregisterPopover(element);
            }
        }
    }

}

export const escapeStack = new EscapeStack();
