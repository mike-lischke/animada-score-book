/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, render, waitFor, type RenderResult } from "@testing-library/preact";
import { createRef, type FunctionComponent } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Popup } from "../../src/components/ui/framework/Popup.js";
import { PortalCloseReason } from "../../src/components/ui/framework/Portal.js";
import { ComponentPlacement } from "../../src/components/ui/framework/UIComponent.js";
import { Orientation } from "../../src/components/ui/framework/ui-types.js";

const rectOf = (left: number, top: number, width: number, height: number): DOMRect => {
    return {
        x: left,
        y: top,
        width,
        height,
        left,
        top,
        right: left + width,
        bottom: top + height,
        toJSON: () => {
            return {};
        },
    };
};

describe("Popup", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    beforeEach(() => {
        renderResult = null;
    });

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        document.querySelectorAll(".portal").forEach((portal) => {
            portal.remove();
        });
        renderResult = null;
    });

    it("matches the baseline snapshot with minimal props", async () => {
        const popupRef = createRef<Popup>();
        const Wrapper: FunctionComponent = () => {
            return <Popup ref={popupRef}>Popup content</Popup>;
        };

        renderResult = render(<Wrapper />);
        await act(() => {
            popupRef.current.openAtRect(rectOf(24, 40, 80, 24));
        });

        const popup = await waitFor(() => {
            const element = document.body.querySelector<HTMLElement>(".popup");
            expect(element).toBeTruthy();

            return element!;
        });

        expect(popup).toMatchSnapshot();
    });

    it("matches the baseline snapshot with all props set", async () => {
        const popupRef = createRef<Popup>();
        let opened = false;
        let closed = false;
        const onOpen = (): void => {
            opened = true;
        };

        const onClose = (): void => {
            closed = true;
        };

        const Wrapper: FunctionComponent = () => {
            return (
                <Popup
                    ref={popupRef}
                    id="complete-popup"
                    className="custom-popup"
                    header={<span>Popup header</span>}
                    placement={ComponentPlacement.BottomRight}
                    orientation={Orientation.LeftToRight}
                    pinned
                    focusOnOpen
                    restoreFocusOnClose={false}
                    dismissOnOutsideClick={false}
                    showArrow={false}
                    onOpen={onOpen}
                    onClose={onClose}
                >
                    <button type="button">Popup action</button>
                </Popup>
            );
        };

        renderResult = render(<Wrapper />);
        await act(() => {
            popupRef.current.openAtRect(rectOf(40, 60, 100, 28));
        });

        const popup = await waitFor(() => {
            const element = document.body.querySelector<HTMLElement>("#complete-popup");
            expect(element).toBeTruthy();

            return element!;
        });

        expect(opened).toBe(true);

        expect(closed).toBe(false);
        expect(popup).toMatchSnapshot();
    });

    it("mounts popup content inside a pointer-transparent portal", async () => {
        const popupRef = createRef<Popup>();
        const Wrapper: FunctionComponent = () => {
            return <Popup ref={popupRef}>Context actions</Popup>;
        };

        renderResult = render(<Wrapper />);
        await act(() => {
            popupRef.current.openAtRect(rectOf(12, 18, 64, 24));
        });

        const popup = await waitFor(() => {
            const element = document.body.querySelector<HTMLElement>(".popup");
            expect(element).toBeTruthy();

            return element!;
        });
        const portal = popup.parentElement;

        expect(portal?.classList.contains("portal")).toBe(true);

        expect(portal?.classList.contains("ignoreMouse")).toBe(true);
        expect(portal?.style.getPropertyValue("--background-opacity")).toBe("0");
    });

    it("replaces the previous popup in the active popup slot", async () => {
        const firstRef = createRef<Popup>();
        const secondRef = createRef<Popup>();
        let closeCancelled: boolean | undefined;
        let closeReason: PortalCloseReason | undefined;
        const onFirstClose = (cancelled: boolean, properties: unknown, reason: PortalCloseReason): void => {
            closeCancelled = cancelled;
            closeReason = reason;
            expect(properties).toBeDefined();
        };

        const Wrapper: FunctionComponent = () => {
            return (
                <>
                    <Popup ref={firstRef} onClose={onFirstClose}>First popup</Popup>
                    <Popup ref={secondRef}>Second popup</Popup>
                </>
            );
        };

        renderResult = render(<Wrapper />);
        await act(() => {
            firstRef.current.openAtRect(rectOf(10, 10, 40, 20));
        });
        await waitFor(() => {
            expect(document.body.querySelector(".popup")?.textContent).toContain("First popup");
        });

        await act(() => {
            secondRef.current.openAtRect(rectOf(80, 80, 40, 20));
        });

        await waitFor(() => {
            expect(document.body.querySelectorAll(".popup")).toHaveLength(1);
            expect(document.body.querySelector(".popup")?.textContent).toContain("Second popup");
        });
        expect(closeCancelled).toBe(true);
        expect(closeReason).toBe(PortalCloseReason.Replaced);
    });
});
