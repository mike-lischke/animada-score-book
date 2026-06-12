/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef } from "preact";

import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface CollapsingTopContainerProperties extends ICommonUIProperties {
    top: preact.ComponentChildren;
    collapsedTop: preact.ComponentChildren;
    bottom: preact.ComponentChildren;
    forceExpanded?: boolean;
}

export class CollapsingTopContainer extends UIComponent<CollapsingTopContainerProperties> {
    private rootRef = createRef<HTMLDivElement>();
    private topRef = createRef<HTMLDivElement>();
    private collapsedTopRef = createRef<HTMLDivElement>();
    private bottomRef = createRef<HTMLDivElement>();

    private resizeObserver?: ResizeObserver;
    private rafId?: number;

    private topHeight = 0;
    private collapsedTopHeight = 0;

    public override componentDidMount(): void {
        this.measureLayout();
        this.applyStaticLayout();
        this.applyScrollState();

        const topEl = this.topRef.current;
        const collapsedTopEl = this.collapsedTopRef.current;

        if (typeof ResizeObserver !== "undefined" && topEl && collapsedTopEl) {
            this.resizeObserver = new ResizeObserver(() => {
                this.measureLayout();
                this.applyStaticLayout();
                this.applyScrollState();
            });

            this.resizeObserver.observe(topEl);
            this.resizeObserver.observe(collapsedTopEl);
        }
    }

    public override componentDidUpdate(): void {
        this.applyStaticLayout();
        this.applyScrollState();
    }

    public override componentWillUnmount(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.rafId !== undefined) {
            cancelAnimationFrame(this.rafId);
            this.rafId = undefined;
        }
    }

    public render({ top, collapsedTop, bottom, className }: CollapsingTopContainerProperties) {
        const collapsedClassName = this.generateFinalClassName([
            "rounded-md",
            "shadow-md",
            "border",
            "border-base-200/70",
        ]);

        return (
            <div
                id="collapsing-top-container"
                ref={this.rootRef}
                className={className}
                style={{
                    position: "relative",
                    height: "100dvh",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                }}
            >
                <div
                    id="bottom"
                    style={{ flex: "1 1 auto" }}
                    ref={this.bottomRef}
                    onScroll={this.handleBottomScroll}
                >
                    {bottom}
                </div>

                <div
                    id="expanded-top"
                    ref={this.topRef}
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        right: 0,
                        willChange: "opacity",
                        opacity: "1",
                    }}
                >
                    {top}
                </div>

                <div
                    id="collapsedHeaderContent"
                    className={collapsedClassName}
                    ref={this.collapsedTopRef}
                    style={{
                        visibility: "hidden",
                        pointerEvents: "none",
                        position: "absolute",
                        left: 0,
                        top: 0,
                        right: 0,
                        opacity: "0",
                    }}
                >
                    {collapsedTop}
                </div>
            </div>
        );
    }

    private measureLayout(): void {
        const topEl = this.topRef.current;
        const collapsedTopEl = this.collapsedTopRef.current;

        if (!topEl || !collapsedTopEl) {
            return;
        }

        this.topHeight = topEl.getBoundingClientRect().height;
        this.collapsedTopHeight = collapsedTopEl.getBoundingClientRect().height;
    }

    private applyStaticLayout(): void {
        const bottomEl = this.bottomRef.current;
        if (!bottomEl) {
            return;
        }

        bottomEl.style.paddingTop = `${this.topHeight}px`;
    }

    private handleBottomScroll = (): void => {
        if (this.rafId !== undefined) {
            return;
        }

        this.rafId = requestAnimationFrame(() => {
            this.rafId = undefined;
            this.applyScrollState();
        });
    };

    private applyScrollState(): void {
        const { forceExpanded } = this.props;

        const topEl = this.topRef.current;
        const collapsedTopEl = this.collapsedTopRef.current;
        const bottomEl = this.bottomRef.current;

        if (!topEl || !collapsedTopEl || !bottomEl) {
            return;
        }

        const scrollTop = Math.max(0, forceExpanded ? 0 : bottomEl.scrollTop);

        // Switch from large to collapsed header at the exact scroll position where the top edge of
        // the content aligns with the bottom edge of the collapsed header.
        // Before this point the large header stays fully visible; no gradual fade.
        const switchAt = Math.max(0, this.topHeight - this.collapsedTopHeight);
        const isCollapsed = scrollTop >= switchAt;

        topEl.style.opacity = isCollapsed ? "0" : "1";
        topEl.inert = isCollapsed;
        topEl.style.pointerEvents = isCollapsed ? "none" : "auto";
        topEl.style.visibility = isCollapsed ? "hidden" : "visible";

        collapsedTopEl.style.opacity = isCollapsed ? "1" : "0";
        collapsedTopEl.style.visibility = isCollapsed ? "visible" : "hidden";
        collapsedTopEl.inert = !isCollapsed;
        collapsedTopEl.style.pointerEvents = isCollapsed ? "auto" : "none";
    }
}
