/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentPlacement } from "./UIComponent.js";

/**
 * Computes the dimensions of the given content with the given style, which can include font, size and border values.
 *
 * @param content The text to measure.
 * @param style The style to apply to the text.
 *
 * @returns A tuple with the computed width and height of the content.
 */
export const computeBounds = (content: string, style: Partial<CSSStyleDeclaration>): [number, number] => {
    // Create a new element, set its properties to the given style and measure the text.
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.visibility = "hidden";
    element.style.whiteSpace = style.whiteSpace ?? "nowrap";
    element.style.width = style.width ?? "fit-content";
    element.style.maxWidth = style.maxWidth ?? "800px";
    element.style.height = style.height ?? "fit-content";
    element.style.maxHeight = style.maxHeight ?? "500px";
    element.style.padding = style.padding ?? "6px";
    element.style.font = style.font ?? "";
    element.style.fontWeight = style.fontWeight ?? "";
    element.style.fontStyle = style.fontStyle ?? "";
    element.style.lineHeight = style.lineHeight ?? "";
    element.innerText = content;

    document.body.appendChild(element);

    const width = element.offsetWidth;
    const height = element.offsetHeight;

    document.body.removeChild(element);

    return [width, height];
};

/**
 * Convert document (actually: viewport) coordinates to screen coordinates.
 *
 * @param x The x-coordinate in the document.
 * @param y The y-coordinate in the document.
 *
 * @returns The x and y coordinates in the screen coordinate system.
 */
export const documentToScreen = (x: number, y: number): [number, number] => {
    const screenX = x + window.scrollX + window.screenX;
    const screenY = y + window.scrollY + window.screenY;

    return [screenX, screenY];
};

/**
 * Convert screen coordinates to document (viewport) coordinates.
 *
 * @param x The x-coordinate in the screen coordinate system.
 * @param y The y-coordinate in the screen coordinate system.
 *
 * @returns The x and y coordinates in the document.
 */
export const screenToDocument = (x: number, y: number): [number, number] => {
    const documentX = x - window.scrollX - window.screenX;
    const documentY = y - window.scrollY - window.screenY;

    return [documentX, documentY];
};

/**
 * Clamps the given coordinates to the document bounds, considering also the screen position of the browser window.
 * Unfortunately, screen clamping only works for the primary screen.
 *
 * @param bounds The bounds of the element to clamp.
 * @param offsetX An additional offset for the x-coordinate.
 * @param offsetY An additional offset for the y-coordinate.
 *
 * @returns The clamped x and y coordinates.
 */
export const clampToDocument = (bounds: DOMRect, offsetX: number, offsetY: number): [number, number] => {
    // First compute the new x and y coordinates within the document bounds.
    const newX = Math.min(Math.max(bounds.left + offsetX, 0), window.innerWidth - bounds.width + offsetX);
    const newY = Math.min(Math.max(bounds.top + offsetY, 0), window.innerHeight - bounds.height + offsetY);

    // Then clamp the new coordinates to the screen bounds.
    let [screenX, screenY] = documentToScreen(newX, newY);
    screenX = Math.min(Math.max(screenX, 0), window.screen.availWidth - bounds.width + offsetX);
    screenY = Math.min(Math.max(screenY, 0), window.screen.availHeight - bounds.height + offsetY);

    return screenToDocument(screenX, screenY);
};

/**
 * Determines the top-left position of the content element, depending on the specified placement under consideration
 * of possible overlaps with the bounds of the given outer container.
 *
 * @param placement The position where to place the given content.
 * @param content The element for which the position is to be computed.
 * @param reference The area relative to which the content must be placed.
 * @param offset An additional distance between content and reference elements.
 * @param canFlip A flag to tell if the position can automatically be changed to the opposite if there's not enough
 *                space.
 * @param container Optional element to test against overlaps (default is the body element). Only useful when
 *                  canFlip is true.
 *
 * @returns Left and top values in the coordinate system of the parent of the reference element.
 */
// istanbul ignore next
export const computeContentPosition = (placement: ComponentPlacement, content: HTMLElement, reference: DOMRect,
    offset: number, canFlip: boolean, container: HTMLElement = document.body): { left: number; top: number; } => {
    let { left, top } = computePositionForPlacement(placement, content, reference, offset);
    const { width, height } = content.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();

    const right = left + width;
    const bottom = top + height;

    if (canFlip) {
        // Automatically flip or shift the popup to avoid container overlap.
        // The closures return true if the popup was flipped, which requires to update the placement class.
        const checkTop = (newPlacement: ComponentPlacement): boolean => {
            if (top < 0) {
                const { top: tc } = computePositionForPlacement(newPlacement, content, reference, offset);
                if (tc + height > containerBounds.bottom) {
                    // Would move the popup too far down, so move it to the top of the container.
                    top = 0;
                } else {
                    top = tc;

                    return true;
                }
            }

            return false;
        };

        const checkRight = (newPlacement: ComponentPlacement): boolean => {
            if (right > containerBounds.right) {
                const { left: lc } = computePositionForPlacement(newPlacement, content, reference, offset);
                if (lc < 0) {
                    // Would move the popup too far left, so move it to the right edge of the container.
                    left = containerBounds.right - width;
                } else {
                    left = lc;

                    return true;
                }
            }

            return false;
        };

        const checkBottom = (newPlacement: ComponentPlacement): boolean => {
            if (bottom > containerBounds.bottom) {
                const { top: tc } = computePositionForPlacement(newPlacement, content, reference, offset);
                if (tc < 0) {
                    top = containerBounds.bottom - height;
                } else {
                    top = tc;

                    return true;
                }
            }

            return false;
        };

        const checkLeft = (newPlacement: ComponentPlacement): boolean => {
            if (left < 0) {
                const { left: lc } = computePositionForPlacement(newPlacement, content, reference, offset);
                if (lc + width > containerBounds.right) {
                    left = containerBounds.right - width;
                } else {
                    left = lc;

                    return true;
                }
            }

            return false;
        };

        /**
         * Updates the popup's placement class depending on the previous flip check.
         *
         * @param flipH The popup was horizontally flipped.
         * @param flipV The popup was vertically flipped.
         * @param flippedBoth The new placement if both directions were flipped.
         * @param flippedH Ditto for horizontal only.
         * @param flippedV Ditto for vertical only.
         */
        const handleFlip = (flipH: boolean, flipV: boolean, flippedBoth: ComponentPlacement | null,
            flippedH: ComponentPlacement | null, flippedV: ComponentPlacement | null): void => {
            if (flipH || flipV) {
                let newClass = "";
                if (flipH && flipV) {
                    newClass = flippedBoth!;
                } else {
                    if (flipH) {
                        newClass = flippedH!;

                    } else {
                        newClass = flippedV!;
                    }
                }
                content.classList.remove(placement);
                content.classList.add(newClass);
            }

        };

        switch (placement) {
            case ComponentPlacement.TopLeft: {
                handleFlip(
                    checkRight(ComponentPlacement.TopRight),
                    checkTop(ComponentPlacement.BottomLeft),
                    ComponentPlacement.BottomRight,
                    ComponentPlacement.TopRight,
                    ComponentPlacement.BottomLeft,
                );

                break;
            }

            case ComponentPlacement.TopCenter: {
                handleFlip(
                    false,
                    checkTop(ComponentPlacement.BottomCenter),
                    null,
                    null,
                    ComponentPlacement.BottomCenter,
                );

                break;
            }

            case ComponentPlacement.TopRight: {
                handleFlip(
                    checkLeft(ComponentPlacement.TopLeft),
                    checkTop(ComponentPlacement.BottomRight),
                    ComponentPlacement.BottomLeft,
                    ComponentPlacement.TopLeft,
                    ComponentPlacement.BottomRight,
                );

                break;
            }

            case ComponentPlacement.RightTop: {
                handleFlip(
                    checkRight(ComponentPlacement.LeftTop),
                    checkBottom(ComponentPlacement.RightBottom),
                    ComponentPlacement.LeftBottom,
                    ComponentPlacement.LeftTop,
                    ComponentPlacement.RightBottom,
                );

                break;
            }

            case ComponentPlacement.RightCenter: {
                handleFlip(
                    checkRight(ComponentPlacement.LeftCenter),
                    false,
                    null,
                    ComponentPlacement.LeftCenter,
                    null,
                );

                break;
            }

            case ComponentPlacement.RightBottom: {
                handleFlip(
                    checkRight(ComponentPlacement.LeftBottom),
                    checkTop(ComponentPlacement.RightTop),
                    ComponentPlacement.LeftTop,
                    ComponentPlacement.LeftBottom,
                    ComponentPlacement.RightTop,
                );

                break;
            }

            case ComponentPlacement.BottomLeft: {
                handleFlip(
                    checkRight(ComponentPlacement.BottomRight),
                    checkBottom(ComponentPlacement.TopLeft),
                    ComponentPlacement.TopRight,
                    ComponentPlacement.BottomRight,
                    ComponentPlacement.TopLeft,
                );

                break;
            }

            case ComponentPlacement.BottomCenter: {
                handleFlip(
                    false,
                    checkBottom(ComponentPlacement.TopCenter),
                    null,
                    null,
                    ComponentPlacement.TopCenter,
                );

                break;
            }

            case ComponentPlacement.BottomRight: {
                handleFlip(
                    checkLeft(ComponentPlacement.BottomLeft),
                    checkBottom(ComponentPlacement.TopRight),
                    ComponentPlacement.TopLeft,
                    ComponentPlacement.BottomLeft,
                    ComponentPlacement.TopRight,
                );

                break;
            }

            case ComponentPlacement.LeftTop: {
                handleFlip(
                    checkLeft(ComponentPlacement.RightTop),
                    checkBottom(ComponentPlacement.LeftBottom),
                    ComponentPlacement.RightBottom,
                    ComponentPlacement.RightTop,
                    ComponentPlacement.LeftBottom,
                );

                break;
            }

            case ComponentPlacement.LeftCenter: {
                handleFlip(
                    checkLeft(ComponentPlacement.RightCenter),
                    false,
                    null,
                    ComponentPlacement.RightCenter,
                    null);

                break;
            }

            case ComponentPlacement.LeftBottom: {
                handleFlip(
                    checkLeft(ComponentPlacement.RightBottom),
                    checkTop(ComponentPlacement.LeftTop),
                    ComponentPlacement.RightTop,
                    ComponentPlacement.RightBottom,
                    ComponentPlacement.LeftTop,
                );

                break;
            }

            default: {
                break;
            }
        }
    }

    return { left, top };
};

/**
 * Checks if the given element is clipped by any of its parent elements.
 *
 * @param element The element to check.
 *
 * @param checkVertical If true, the function checks for vertical clipping.
 * @param checkHorizontal If true, the function checks for horizontal clipping.
 * @returns True if the element is clipped, false otherwise.
 */
// istanbul ignore next
export const isElementClipped = (element: HTMLElement, checkVertical: boolean, checkHorizontal: boolean): boolean => {
    const elementRect = element.getBoundingClientRect();

    let parent = element.parentElement;
    while (parent) {
        const parentRect = parent.getBoundingClientRect();

        if (checkVertical && (elementRect.top < parentRect.top || elementRect.bottom > parentRect.bottom)) {
            return true;
        }

        if (checkHorizontal && (elementRect.left < parentRect.left || elementRect.right > parentRect.right)) {
            return true;
        }

        parent = parent.parentElement;
    }

    return false;
};

/**
 * Computes the target coordinates for the content element for a given placement.
 *
 * @param placement The position where to place the given content relative to the reference element.
 * @param content The element for which the position is to be computed.
 * @param reference The area relative to which the content must be placed.
 * @param offset An additional distance between content and reference elements.
 *
 * @returns Left and top values in the coordinate system of the parent of the reference element.
 */
const computePositionForPlacement = (placement: ComponentPlacement, content: HTMLElement, reference: DOMRect,
    offset: number): { left: number; top: number; } => {

    const contentBounds = content.getBoundingClientRect();

    let left = 0;
    let top = 0;

    switch (placement) {
        case ComponentPlacement.TopLeft: {
            left = reference.left;
            top = reference.top - contentBounds.height - offset;

            break;
        }

        case ComponentPlacement.TopCenter: {
            left = ((reference.left + reference.right) / 2) - (contentBounds.width / 2);
            top = reference.top - contentBounds.height - offset;
            break;
        }

        case ComponentPlacement.TopRight: {
            left = reference.right - contentBounds.width;
            top = reference.top - contentBounds.height - offset;
            break;
        }

        case ComponentPlacement.RightTop: {
            top = reference.top;
            left = reference.left + reference.width + offset;
            break;
        }

        case ComponentPlacement.RightCenter: {
            top = ((reference.top + reference.bottom) / 2) - (contentBounds.height / 2);
            left = reference.left + reference.width + offset;
            break;
        }

        case ComponentPlacement.RightBottom: {
            top = reference.top + reference.height - contentBounds.height;
            left = reference.left + reference.width + offset;
            break;
        }

        case ComponentPlacement.BottomLeft: {
            left = reference.left;
            top = reference.top + reference.height + offset;
            break;
        }

        case ComponentPlacement.BottomCenter: {
            left = ((reference.left + reference.right) / 2) - (contentBounds.width / 2);
            top = reference.top + reference.height + offset;
            break;
        }

        case ComponentPlacement.BottomRight: {
            left = reference.right - contentBounds.width;
            top = reference.top + reference.height + offset;
            break;
        }

        case ComponentPlacement.LeftTop: {
            top = reference.top;
            left = reference.left - contentBounds.width - offset;
            break;
        }

        case ComponentPlacement.LeftCenter: {
            top = ((reference.top + reference.bottom) / 2) - (contentBounds.height / 2);
            left = reference.left - contentBounds.width - offset;
            break;
        }

        case ComponentPlacement.LeftBottom: {
            top = reference.top + reference.height - contentBounds.height;
            left = reference.left - contentBounds.width - offset;
            break;
        }

        default: {
            break;
        }
    }

    return { left, top };
};
