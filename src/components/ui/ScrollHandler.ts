/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

export class ScrollHandler {
    private scrollbarWidth = 0;

    public constructor(private wrapper: HTMLElement | null, private thumbWidth: number, private touch: boolean) {
        const scrollbar = wrapper?.getElementsByClassName("custom-scrollbar")[0];
        this.scrollbarWidth = scrollbar?.clientWidth ?? 0;
    }

    public startThumbDrag(startX: number): void {
        if (!this.wrapper?.scrollWidth || !this.scrollbarWidth) {
            return;
        }

        const scrollableDistance = this.wrapper.scrollWidth - this.wrapper.clientWidth;
        const scrollbarScrollableDistance = this.scrollbarWidth - this.thumbWidth;

        const getX = this.touch ?
            (moveEvent: TouchEvent) => {
                return moveEvent.touches[0].clientX;
            } :
            (moveEvent: MouseEvent) => {
                return moveEvent.clientX;
            };

        const moveEventName = this.touch ? "touchmove" : "mousemove";
        const endEventName = this.touch ? "touchend" : "mouseup";

        const touchmove = (moveEvent: (TouchEvent & MouseEvent)) => {
            const newX = getX(moveEvent);
            const moveRatio = (newX - startX) / scrollbarScrollableDistance;
            this.scroll(moveRatio * scrollableDistance);
            startX = newX;
        };

        const removeListeners = () => {
            window.removeEventListener(moveEventName, touchmove as EventListener);
            window.removeEventListener(endEventName, removeListeners);
            window.removeEventListener("blur", removeListeners);
        };

        window.addEventListener(moveEventName, touchmove as EventListener);
        window.addEventListener(endEventName, removeListeners);
        window.addEventListener("blur", removeListeners);
    }

    public scrollFromTrackClick(startX: number) {
        if (!this.wrapper?.scrollWidth || !this.scrollbarWidth) {
            return;
        }

        const tapRatio = startX / this.scrollbarWidth;
        const wrapperWidth = this.wrapper.clientWidth;
        this.scroll((this.wrapper.scrollWidth * tapRatio) - (wrapperWidth / 2) - this.wrapper.scrollLeft);
    };

    private scroll = (distance: number) => {
        if (this.wrapper) {
            this.wrapper.scrollLeft += distance;
            //this.wrapper.dispatchEvent(new Event("scroll")); Seems to be useless.
        }
    };
}
