/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";
import { Button } from "./Button.js";
import { Container } from "./Container.js";
import { ChildAlignment } from "./ui-types.js";
import { ComponentPlacement, ICommonUIProperties, UIComponent } from "./UIComponent.js";

export interface IRadialMenuItem {
    id: string;
    icon: ComponentChild;
    onClick?: () => void;
}

export interface IRadialMenuProps extends ICommonUIProperties {
    delay?: number;
}

interface IRadialMenuState {
    items: IRadialMenuItem[];

    open: boolean;
    anchorRect: DOMRect;
    placement: ComponentPlacement;

    targetRadius: number;
    currentRadius: number;
}

export class RadialMenu extends UIComponent<IRadialMenuProps, IRadialMenuState> {
    public override state: IRadialMenuState = {
        open: false,
        anchorRect: new DOMRect(),
        placement: ComponentPlacement.TopCenter,
        items: [],
        currentRadius: 0,
        targetRadius: 0,
    };

    public open(anchorRect: DOMRect, placement: ComponentPlacement, items: IRadialMenuItem[], radius: number): void {
        this.setState({ open: true, anchorRect, placement, items, currentRadius: 0, targetRadius: radius });
        setTimeout(() => {
            this.setState({ currentRadius: radius });
        }, 100);
    }

    public close(): void {
        const { open } = this.state;

        if (open) {
            this.setState({ currentRadius: 0 });
            setTimeout(() => {
                this.setState({ open: false });
            }, 300);
        }
    }

    public override render(): ComponentChild {
        const { open, anchorRect, placement, items, currentRadius, targetRadius } = this.state;

        if (!open || items.length === 0) {
            return null;
        }

        const hostPos = this.computeMenuHostPosition(anchorRect, placement);
        const backgroundSize = currentRadius * (2 + (80 / targetRadius));

        const className = this.generateFinalClassName(["radial-menu"]);

        return (
            <div className={className}>
                <button
                    id="closer"
                    type="button"
                    className="absolute inset-0 pointer-events-auto bg-transparent"
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
                            transform: "translate(-50%, -50%)",
                        }}
                    />
                    {this.renderRadialContent(items, currentRadius, placement)}
                </div>
            </div>
        );
    }

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
                top = rect.top - margin;
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
                top = rect.bottom + margin;
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
                left = rect.left - margin;
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
                left = rect.right + margin;
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

    private renderRadialContent(items: IRadialMenuItem[], radius: number,
        placement: ComponentPlacement,): ComponentChild {
        const { open } = this.state;

        const count = items.length;
        const baseBtn = "radial-btn absolute pointer-events-auto " +
            "transition-all duration-300 ease-in-out";
        const openClasses = "opacity-100 scale-100";
        const closedClasses = "opacity-0 scale-50";

        const startFactor = 0.1;
        const maxDelay = 0.05;

        return (
            <Container
                mainAlignment={ChildAlignment.Center}
                crossAlignment={ChildAlignment.Center}
                className="inline-flex pointer-events-none"
                style={{ transform: `translate(-20px, -20px)` }}
            >
                {items.map((item, index) => {
                    const angle = this.getItemAngle(index, count, placement);
                    const rad = (angle * Math.PI) / 180;

                    // Final position (fully expanded).
                    const targetX = Math.cos(rad) * radius;
                    const targetY = Math.sin(rad) * radius;

                    // Start position closer to the center for animation.
                    const startX = Math.cos(rad) * radius * startFactor;
                    const startY = Math.sin(rad) * radius * startFactor;

                    const t = count > 1 ? index / (count - 1) : 0;
                    const delay = t * maxDelay;

                    const x = open ? targetX : startX;
                    const y = open ? targetY : startY;

                    return (
                        <div key={item.id} className="absolute pointer-events-none">
                            <Button
                                round
                                className={`${baseBtn} ${radius > 0 ? openClasses : closedClasses}`}
                                style={{
                                    transform: `translate(${x}px, ${-y}px)`,
                                    transitionDelay: `${delay}s`,
                                }}
                                onClick={() => {
                                    item.onClick?.();
                                    this.close();
                                }}
                            >
                                {item.icon}
                            </Button>
                        </div>
                    );
                })}
            </Container>
        );
    }
}
