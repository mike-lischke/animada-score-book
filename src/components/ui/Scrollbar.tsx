/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, RefObject } from "preact";

import type { IPublisher } from "../../Core1/types/general.js";
import { ComponentBase, type IComponentProperties, type IComponentState } from "./ComponentBase/ComponentBase.js";
import { ScrollHandler } from "./ScrollHandler.js";

export interface IScrollbarProps extends IComponentProperties {
    wrapperRef: RefObject<HTMLDivElement | null>;
    contentWidthPublisher: IPublisher;
    onGrab?: () => void;
}

interface IScrollbarState extends IComponentState {
    thumbWidth: number;
    thumbLeft: number;
}

export class Scrollbar extends ComponentBase<IScrollbarProps, IScrollbarState> {
    private resizeObserver: ResizeObserver;

    public constructor(props: IScrollbarProps) {
        super(props);

        this.state = {
            thumbLeft: 0,
            thumbWidth: 0
        };

        this.resizeObserver = new ResizeObserver(this.updateAll);
    }

    public override componentDidMount(): void {
        const { wrapperRef, contentWidthPublisher } = this.props;

        wrapperRef.current?.addEventListener("scroll", this.updateThumbLeft);
        this.resizeObserver.observe(wrapperRef.current!);
        contentWidthPublisher.subscribe(this.updateAll);

        this.updateAll();
    }

    public override componentWillUnmount(): void {
        const { wrapperRef, contentWidthPublisher } = this.props;

        wrapperRef.current?.removeEventListener("scroll", this.updateThumbLeft);
        this.resizeObserver.disconnect();
        contentWidthPublisher.unsubscribe(this.updateAll);
    }

    public override render(): ComponentChild {
        const { wrapperRef, onGrab } = this.props;
        const { thumbWidth, thumbLeft } = this.state;

        return (
            <div className="custom-scrollbar" >
                <div className="track"
                    onMouseDown={(event) => {
                        this.handleTrackMousedown(event, wrapperRef.current, thumbWidth);
                    }}
                    onTouchStart={(event) => {
                        this.handleTrackTouchStart(event, wrapperRef.current, thumbWidth, onGrab);
                    }}
                />
                <div className="thumb"
                    style={{ width: `${thumbWidth} px}`, left: `${thumbLeft} px` }}
                    onMouseDown={(event) => {
                        this.handleThumbMouseDown(event, wrapperRef.current, thumbWidth);
                    }}
                    onTouchStart={(event) => {
                        this.handleThumbTouchStart(event, wrapperRef.current, thumbWidth, onGrab);
                    }}
                />
            </div>
        );
    }

    private updateThumbWidth = () => {
        const { wrapperRef } = this.props;

        this.setState({ thumbWidth: this.calculateThumbWidth(wrapperRef.current) });
    };

    private updateThumbLeft = () => {
        const { wrapperRef } = this.props;

        this.setState({ thumbLeft: this.calculateThumbLeft(wrapperRef.current) });
    };

    private updateAll = () => {
        this.updateThumbLeft();
        this.updateThumbWidth();
    };

    private calculateThumbWidth(wrapper: HTMLElement | null): number {
        if (!wrapper?.scrollWidth) {
            return 0;
        }

        // offsetWidth includes borders, clientWidth does not. Not important in this case anyway.
        const ratio = wrapper.offsetWidth / wrapper.scrollWidth; // Not accounting for track-meta but maybe that's fine?
        const scrollbar = wrapper.getElementsByClassName("custom-scrollbar")[0]; // Let's pass this directly if possible

        return ratio * scrollbar.clientWidth;
    }

    private calculateThumbLeft(wrapper: HTMLElement | null): number {
        if (!wrapper?.scrollWidth) {
            return 0;
        }

        const scrollLeft = wrapper.scrollLeft;
        const scrollbarWidth = wrapper.getElementsByClassName("custom-scrollbar")[0].clientWidth;

        return (scrollLeft * scrollbarWidth) / wrapper.scrollWidth;
    }

    private handleThumbTouchStart(event: TouchEvent, wrapper: HTMLElement | null, thumbWidth: number,
        onGrab?: () => void) {
        event.stopPropagation();
        if (event.touches.length > 1) {
            return;
        }

        new ScrollHandler(wrapper, thumbWidth, true).startThumbDrag(event.touches[0].clientX);
        if (onGrab) {
            onGrab();
        }
    }

    private handleThumbMouseDown(event: MouseEvent, wrapper: HTMLElement | null, thumbWidth: number) {
        new ScrollHandler(wrapper, thumbWidth, false).startThumbDrag(event.clientX);
    }

    private handleTrackMousedown(event: MouseEvent, wrapper: HTMLElement | null, thumbWidth: number) {
        const startX = event.offsetX;
        const scrollHandler = new ScrollHandler(wrapper, thumbWidth, false);
        scrollHandler.scrollFromTrackClick(startX);
        scrollHandler.startThumbDrag(startX);
    }

    private handleTrackTouchStart(event: TouchEvent, wrapper: HTMLElement | null, thumbWidth: number,
        onGrab?: () => void) {
        event.stopPropagation();
        if (event.touches.length > 1) {
            return;
        }
        const startX = event.touches[0].clientX;
        const scrollHandler = new ScrollHandler(wrapper, thumbWidth, true);
        scrollHandler.scrollFromTrackClick(startX);
        scrollHandler.startThumbDrag(startX);

        if (onGrab) {
            onGrab();
        }
    }
}
