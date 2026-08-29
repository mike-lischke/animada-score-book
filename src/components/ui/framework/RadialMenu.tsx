/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";
import { createPortal } from "preact/compat";
import { Button } from "./Button.js";
import { ComponentPlacement, ICommonUIProperties, UIComponent } from "./UIComponent.js";

export interface IRadialMenuItem {
    id: string;
    label: string;
    tooltip?: string;
    icon: ComponentChild;
    onClick?: () => void;
    disabled?: boolean;
}

export interface IRadialMenuProps extends ICommonUIProperties {
    delay?: number;

    /** Diameter of the round menu buttons in pixels. Used for centering the radial fan on the anchor point. */
    buttonSize?: number;
}

interface IRadialMenuState {
    items: IRadialMenuItem[];

    open: boolean;
    expanded: boolean;
    anchorRect: DOMRect;
    placement: ComponentPlacement;
}

interface IRadialItemLayout {
    item: IRadialMenuItem;
    x: number;
    y: number;
    delay: number;
}

export interface IRadialMenuOptions {
    startAngle?: number;
    angleSpan?: number;
    clockwise?: boolean;
}

export class RadialMenu extends UIComponent<IRadialMenuProps, IRadialMenuState> {
    public static readonly defaultButtonSize = 48;

    public override state: IRadialMenuState = {
        open: false,
        expanded: false,
        anchorRect: new DOMRect(),
        placement: ComponentPlacement.TopCenter,
        items: [],
    };

    private static readonly openClass = "radial-menu-open";

    /** Radius of the fan once fully expanded, in pixels. */
    private radius = 0;
    private startAngle?: number;
    private angleSpan?: number;
    private clockwise = false;

    public override componentDidMount(): void {
        document.addEventListener("keydown", this.handleKeyDown);
    }

    public override componentWillUnmount(): void {
        document.removeEventListener("keydown", this.handleKeyDown);
        document.body.classList.remove(RadialMenu.openClass);
    }

    public open(anchorRect: DOMRect, placement: ComponentPlacement, items: IRadialMenuItem[], radius: number,
        options?: IRadialMenuOptions): void {
        this.radius = radius;
        this.startAngle = options?.startAngle;
        this.angleSpan = options?.angleSpan;
        this.clockwise = options?.clockwise ?? false;
        document.body.classList.add(RadialMenu.openClass);
        this.setState({ open: true, expanded: false, anchorRect, placement, items });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.setState({ expanded: true });
            });
        });
    }

    public close(): void {
        const { open } = this.state;

        if (open) {
            this.setState({ expanded: false });
            setTimeout(() => {
                this.setState({ open: false });
                document.body.classList.remove(RadialMenu.openClass);
            }, 300);
        }
    }

    public override render(): ComponentChild {
        const { open, expanded, anchorRect, placement, items } = this.state;

        if (!open || items.length === 0) {
            return null;
        }

        const hostPos = this.computeMenuHostPosition(anchorRect, placement);
        const { buttonSize } = this.props;
        const size = buttonSize ?? RadialMenu.defaultButtonSize;
        const ringPath = this.createRingSegmentPath(items, this.radius, placement, size);
        const ringSize = Math.max((this.radius + (size / 2) + 35) * 2, 180);
        const startSize = Math.max(anchorRect.width, anchorRect.height);
        const backgroundSize = expanded ? ringSize : startSize;
        const layout = this.computeItemPositions(items, placement, expanded);

        const className = this.generateFinalClassName(["radial-menu"]);

        return createPortal(
            <div className={className}>
                <button
                    type="button"
                    className="radial-closer absolute inset-0 pointer-events-auto bg-transparent"
                    onClick={() => {
                        this.close();
                    }}
                />
                <div
                    className="radial-content"
                    style={{
                        left: `${hostPos.left}px`,
                        top: `calc(${hostPos.top}px)`,
                    }}
                >
                    <div
                        className="radial-background"
                        style={{
                            width: `${backgroundSize}px`,
                            height: `${backgroundSize}px`,
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                        }}
                    />
                    <svg
                        className="radial-ring-svg"
                        viewBox={`${-ringSize / 2} ${-ringSize / 2} ${ringSize} ${ringSize}`}
                        aria-hidden="true"
                        style={{
                            width: `${ringSize}px`,
                            height: `${ringSize}px`,
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            opacity: expanded ? 1 : 0,
                        }}
                    >
                        <path d={ringPath.outer} className="radial-ring-track radial-ring-track-outer" />
                        <path d={ringPath.inner} className="radial-ring-track radial-ring-track-inner" />
                    </svg>
                    {this.renderRadialContent(layout, expanded)}
                </div>
            </div>,
            document.body,
        );
    }

    private createRingSegmentPath(items: IRadialMenuItem[], radius: number,
        placement: ComponentPlacement, buttonSize: number): { outer: string; inner: string; } {
        const count = items.length;

        if (radius <= 0) {
            return { outer: "", inner: "" };
        }

        // The arc starts just past the first button and ends just past the last button, so the
        // segment visually brackets the whole fan while still running through the button centers.
        const halfAngle = (Math.atan((buttonSize / 2) / radius) * 180) / Math.PI;
        const margin = 6;

        const direction = this.clockwise ? -1 : 1;
        const startAngle = this.getItemAngle(0, count, placement) - (direction * (halfAngle + margin));
        const endAngle = this.getItemAngle(count - 1, count, placement)
            + (direction * (halfAngle + margin));

        // Two parallel strokes (2px wide, 2px apart) centered on the button radius. Both use
        // the same angular span so they remain concentric around the menu.
        const ringRadius = radius;
        const outerRadius = ringRadius + 2;
        const innerRadius = ringRadius - 2;

        if (count >= 7) {
            return {
                outer: this.createClosedCirclePath(outerRadius),
                inner: this.createClosedCirclePath(innerRadius),
            };
        }

        return {
            outer: this.createArcPath(startAngle, endAngle, outerRadius),
            inner: this.createArcPath(startAngle, endAngle, innerRadius),
        };
    }

    private createClosedCirclePath(radius: number): string {
        return [
            `M ${radius.toFixed(2)} 0`,
            `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${(-radius).toFixed(2)} 0`,
            `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 1 0 ${radius.toFixed(2)} 0`,
        ].join(" ");
    }

    private createArcPath(startAngle: number, endAngle: number, radius: number): string {
        const start = startAngle;
        let end = endAngle;

        if (this.clockwise) {
            while (end > start) {
                end -= 360;
            }
        } else {
            while (end < start) {
                end += 360;
            }
        }

        const startDegrees = (start * Math.PI) / 180;
        const endDegrees = (end * Math.PI) / 180;

        const startX = radius * Math.cos(startDegrees);
        const startY = -radius * Math.sin(startDegrees);
        const endX = radius * Math.cos(endDegrees);
        const endY = -radius * Math.sin(endDegrees);
        const arcSize = this.clockwise ? start - end : end - start;
        const largeArc = arcSize > 180 ? 1 : 0;
        const sweep = this.clockwise ? 1 : 0;

        return [
            `M ${startX.toFixed(2)} ${startY.toFixed(2)}`,
            `A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${endX.toFixed(2)} ${endY.toFixed(2)}`,
        ].join(" ");
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        const { open } = this.state;

        if (event.key === "Escape" && open) {
            this.close();
        }
    };

    // Angle range depending on item count and placement.
    // Convention: 0° = right, 90° = top, 180° = left, 270°/-90° = bottom.
    private getAngleRange(count: number, placement: ComponentPlacement): { start: number; end: number; } {
        // Default direction per placement
        const isTop =
            placement === ComponentPlacement.TopLeft ||
            placement === ComponentPlacement.TopCenter ||
            placement === ComponentPlacement.TopRight;

        const isBottom =
            placement === ComponentPlacement.BottomLeft ||
            placement === ComponentPlacement.BottomCenter ||
            placement === ComponentPlacement.BottomRight;

        const isLeft =
            placement === ComponentPlacement.LeftTop ||
            placement === ComponentPlacement.LeftCenter ||
            placement === ComponentPlacement.LeftBottom;

        const isRight =
            placement === ComponentPlacement.RightTop ||
            placement === ComponentPlacement.RightCenter ||
            placement === ComponentPlacement.RightBottom;

        // 90°-segment around the main direction
        if (count <= 3) {
            if (isTop) {
                return { start: 45, end: 135 };
            } // top

            if (isBottom) {
                return { start: -135, end: -45 };
            } // bottom

            if (isRight) {
                return { start: -45, end: 45 };
            } // right

            if (isLeft) {
                return { start: 135, end: 225 };
            } // left
        }

        // 180°-half circle in main direction
        if (count <= 5) {
            if (isTop) {
                return { start: 0, end: 180 };
            } // opening upwards

            if (isBottom) {
                return { start: 180, end: 360 };
            } // opening downwards

            if (isRight) {
                return { start: -90, end: 90 };
            } // opening to the right

            if (isLeft) {
                return { start: 90, end: 270 };
            } // opening to the left
        }

        // Many items: full circle
        return { start: 0, end: 360 };
    }

    private getItemAngle(index: number, count: number, placement: ComponentPlacement): number {
        const { start, end } = this.getAngleRange(count, placement);
        if (this.startAngle !== undefined) {
            const span = this.angleSpan ?? 360;
            const divisor = span === 360 ? count : Math.max(1, count - 1);
            const step = (this.clockwise ? -span : span) / divisor;

            return this.startAngle + (step * index);
        }

        if (count === 1) {
            return (start + end) / 2;
        }

        const step = (end - start) / (count - 1);

        return start + (step * index);
    }

    private computeMenuHostPosition(rect: DOMRect, placement: ComponentPlacement): { left: number; top: number; } {
        const margin = 8;
        let left = rect.left;
        let top = rect.top;

        switch (placement) {
            case ComponentPlacement.TopLeft: {
                left = rect.left;
                top = rect.top - margin;
                break;
            }

            case ComponentPlacement.TopCenter: {
                left = rect.left + (rect.width / 2);
                top = rect.top + (rect.height / 2);
                break;
            }

            case ComponentPlacement.TopRight: {
                left = rect.right;
                top = rect.top - margin;
                break;
            }

            case ComponentPlacement.BottomLeft: {
                left = rect.left;
                top = rect.bottom + margin;
                break;
            }

            case ComponentPlacement.BottomCenter: {
                left = rect.left + (rect.width / 2);
                top = rect.top + (rect.height / 2);
                break;
            }

            case ComponentPlacement.BottomRight: {
                left = rect.right;
                top = rect.bottom + margin;
                break;
            }

            case ComponentPlacement.LeftTop: {
                left = rect.left - margin;
                top = rect.top;
                break;
            }

            case ComponentPlacement.LeftCenter: {
                left = rect.left + (rect.width / 2);
                top = rect.top + (rect.height / 2);
                break;
            }

            case ComponentPlacement.LeftBottom: {
                left = rect.left - margin;
                top = rect.bottom;
                break;
            }

            case ComponentPlacement.RightTop: {
                left = rect.right + margin;
                top = rect.top;
                break;
            }

            case ComponentPlacement.RightCenter: {
                left = rect.left + (rect.width / 2);
                top = rect.top + (rect.height / 2);
                break;
            }

            case ComponentPlacement.RightBottom: {
                left = rect.right + margin;
                top = rect.bottom;
                break;
            }
        }

        return { left, top };
    }

    private computeItemPositions(items: IRadialMenuItem[], placement: ComponentPlacement,
        expanded: boolean): IRadialItemLayout[] {
        const count = items.length;
        const maxDelay = 0.05;

        return items.map((item, index) => {
            const angle = this.getItemAngle(index, count, placement);
            const rad = (angle * Math.PI) / 180;

            // Final position (fully expanded).
            const targetX = Math.cos(rad) * this.radius;
            const targetY = Math.sin(rad) * this.radius;

            const t = count > 1 ? index / (count - 1) : 0;

            return {
                item,
                x: expanded ? targetX : 0,
                y: expanded ? targetY : 0,
                delay: t * maxDelay,
            };
        });
    }

    private renderRadialContent(layout: IRadialItemLayout[], expanded: boolean): ComponentChild {
        return (
            <>
                {layout.map(({ item, x, y, delay }) => {
                    const scale = expanded ? 1 : 0;
                    const itemTransform =
                        `translate(calc(${x}px - 50%), calc(${-y}px - 50%)) scale(${scale})`;

                    return (
                        <div
                            key={item.id}
                            className="radial-menu-item pointer-events-none"
                            style={{
                                left: "0",
                                top: "0",
                                transform: itemTransform,
                                transitionDelay: `${delay}s`,
                            }}
                        >
                            <Button
                                round
                                data-tooltip={item.tooltip}
                                className="radial-btn pointer-events-auto"
                                disabled={item.disabled}
                                onClick={() => {
                                    item.onClick?.();
                                    this.close();
                                }}
                            >
                                {item.icon}
                            </Button>
                            <span className={`radial-menu-item-label${y > 0 ? " radial-menu-item-label-above" : ""}`}>
                                {item.label}
                            </span>
                        </div>
                    );
                })}
            </>
        );
    }
}
