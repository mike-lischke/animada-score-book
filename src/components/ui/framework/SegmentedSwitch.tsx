/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "./Button.js";
import { Container } from "./Container.js";
import { ChildAlignment, Orientation } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

/** One choice of a segmented switch. */
export interface ISegmentOption<T> {
    value: T;
    label: string;

    /** The segment's tooltip, naming what the choice does and its shortcut. */
    title: string;
}

export interface ISegmentedSwitchProperties<T> extends ICommonUIProperties {
    /** The choices, in the order they are shown. */
    options: ReadonlyArray<ISegmentOption<T>>;

    /** The value of the selected choice. */
    value: T;

    /** Invoked with the value of the clicked choice. */
    onChange: (value: T) => void;
}

/**
 * A row of choices of which exactly one is selected. A pill slides under the selected choice; the others sit
 * flat on the track with a dimmed dot.
 */
export class SegmentedSwitch<T extends string | number = string> extends UIComponent<ISegmentedSwitchProperties<T>> {
    private readonly trackRef = createRef<HTMLDivElement | null>();
    private readonly thumbRef = createRef<HTMLDivElement | null>();
    private readonly segmentRefs: Array<preact.RefObject<HTMLButtonElement | null>> = [];
    private resizeObserver?: ResizeObserver;

    public override componentDidMount(): void {
        this.placeThumb(false);
        this.observeLayout();
    }

    public override componentDidUpdate(prevProps: ISegmentedSwitchProperties<T>): void {
        const { options, value } = this.props;
        if (prevProps.value !== value || prevProps.options !== options) {
            this.placeThumb();
        }
    }

    public override componentWillUnmount(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
    }

    public render(): ComponentChild {
        const { options, value } = this.props;

        const className = this.generateFinalClassName(["segmented-switch"]);
        const segments = options.map((option, index) => {
            const isSelected = option.value === value;
            const segmentClassName = isSelected
                ? "segmented-switch-segment is-selected"
                : "segmented-switch-segment";
            const segmentRef = this.segmentRefs[index] ??= createRef<HTMLButtonElement | null>();

            return (
                <Button
                    key={String(option.value)}
                    innerRef={segmentRef}
                    className={segmentClassName}
                    aria-pressed={isSelected}
                    title={option.title}
                    onClick={(event) => {
                        this.handleSelect(event, option.value);
                    }}
                >
                    <span className="segmented-switch-dot" />
                    <span className="segmented-switch-label">{option.label}</span>
                </Button>
            );
        });

        return (
            <Container
                className={className}
                innerRef={this.trackRef}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                {...this.dataAttributes}
            >
                <div className="segmented-switch-thumb" ref={this.thumbRef} aria-hidden="true" />
                {segments}
            </Container>
        );
    }

    /** Watches the switch's size, so the thumb follows when the labels are laid out again. */
    private observeLayout(): void {
        const track = this.trackRef.current;
        if (typeof ResizeObserver === "undefined" || track === null) {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.placeThumb(false);
        });
        this.resizeObserver.observe(track);
    }

    /**
     * @param animate True to let the thumb slide from its previous place.
     */
    private placeThumb(animate = true): void {
        const { options, value } = this.props;
        const thumb = this.thumbRef.current;
        const index = options.findIndex((option) => {
            return option.value === value;
        });
        const segment = index >= 0 ? this.segmentRefs[index]?.current : undefined;
        if (thumb === null || !segment) {
            return;
        }

        if (!animate) {
            thumb.style.transition = "none";
        }

        thumb.style.left = `${segment.offsetLeft}px`;
        thumb.style.width = `${segment.offsetWidth}px`;
        thumb.classList.add("is-placed");

        if (!animate) {
            // Restore the slide once the browser has taken the new place.
            requestAnimationFrame(() => {
                thumb.style.transition = "";
            });
        }
    }

    private handleSelect(event: MouseEvent | KeyboardEvent, value: T): void {
        const { onChange } = this.props;
        event.stopPropagation();
        onChange(value);
    }
}
