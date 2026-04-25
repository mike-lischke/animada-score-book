/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { convertPropValue } from "../../../../core/utils.js";
import { Button } from "../Button.js";
import { Codicon } from "../Codicon.js";
import { Container } from "../Container.js";
import { Icon } from "../Icon.js";
import { Label } from "../Label.js";
import { Orientation, TabPosition } from "../ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { CachedTabPage } from "./CachedTabPage.js";

/** The description for a tab page. */
export interface ITabviewPage {
    id: string;

    /** An image shown as the first entry on a tab, if assigned. */
    icon?: string | Codicon;

    /** A tab's title. */
    caption: string;

    /** Tooltip for the tab. */
    tooltip?: string;

    /** Additional content that should be added on the right side of a tab. */
    auxiliary?: ComponentChild;

    /** The content to show in the tabview body, when this tab is active. */
    content: ComponentChild;

    canClose?: boolean;
}

interface ITabviewProperties extends ICommonUIProperties {
    /** If specified this gets the reference to the outermost HTML element, hosting this component. */
    innerRef?: preact.RefObject<HTMLElement>;

    /** The tab page to make active initially. */
    selectedId?: string;

    /** Make all tabs equal size and fill the entire tabview size. */
    stretchTabs?: boolean;

    /** When true and there's only a single (or no) tab then the tab area is not shown. */
    hideSingleTab?: boolean;

    /** Set to false to disable tabs entirely. */
    showTabs?: boolean;

    // If set to 0 or undefined no border effect will be visible on an item, except for the selection marker.
    tabBorderWidth?: number;

    /** If set to 0 or undefined no separator line is shown between content and tabs. */
    contentSeparatorWidth?: number;

    canReorderTabs?: boolean;

    /** The pages to show. */
    /** The positions of the tabs around the content pane. */
    tabPosition?: TabPosition;

    pages: ITabviewPage[];

    /** Additional content that should be added on the right side of a tab area. */
    auxiliary?: ComponentChild;

    /** Triggered when the user selects a tab, even if it is the tab, which is already active. */
    onSelectTab?: (id: string) => void;

    canCloseTab?: (id: string) => Promise<boolean>;
}

interface ITabviewState {
    closeTabDisabled: boolean;
    closeOthersDisabled: boolean;
    closeRightDisabled: boolean;
    closeAllDisabled: boolean;
}

/**
 * A tabview is a collection of containers of which only one is rendered at a given time.
 * Which one is determined by the `active` property.
 * Usually a tabview is combined with a tab bar, to select an active tab.
 */
export class Tabview extends UIComponent<ITabviewProperties, ITabviewState> {

    public static override defaultProps = {
        tabPosition: TabPosition.Top,
        stretchTabs: true,
        hideSingleTab: false,
        showTabs: true,
    };

    private contentRef = createRef<HTMLDivElement>();
    private sliderRef = createRef<HTMLDivElement>();
    private tabAreaRef = createRef<HTMLDivElement>();

    private trackingSliderMove = false;
    private lastSliderPosition = 0;

    private resizeObserver?: ResizeObserver;

    public constructor(props: ITabviewProperties) {
        super(props);

        // istanbul ignore next
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.handleResize);
        }

        if (props.canReorderTabs) {
            // TODO: implement drag and drop support for tabs.
        }

        this.state = {
            closeTabDisabled: false,
            closeOthersDisabled: false,
            closeRightDisabled: false,
            closeAllDisabled: false,
        };
    }

    public static getSelectedPageId(remainingPageIds: string[], previouslySelected: string | undefined,
        closingIds: string[], defaultSelection: string): string {

        if (!remainingPageIds.length && defaultSelection) {
            return defaultSelection;
        }

        if (previouslySelected && !closingIds.includes(previouslySelected)) {
            return previouslySelected;
        }

        return remainingPageIds[remainingPageIds.length - 1];
    }

    public override componentDidMount(): void {
        this.resizeObserver?.observe(this.contentRef.current as Element);
    }

    public override componentDidUpdate(prevProps: ITabviewProperties, prevState: ITabviewState): void {
        super.componentDidUpdate(prevProps, prevState);

        this.scrollActiveItemIntoView();
        this.handleResize();
    }

    public render(): ComponentChild {
        const {
            id, tabPosition, stretchTabs, hideSingleTab, pages, tabBorderWidth, style, contentSeparatorWidth,
            selectedId, showTabs, canReorderTabs, auxiliary,
        } = this.props;

        const className = this.generateFinalClassName([
            "tabview",
            tabPosition,
        ]);

        const tabs = pages.map((page: ITabviewPage) => {
            let buttonClassName = "tabItem" + (page.auxiliary ? " hasAuxiliary" : "");
            if (page.id === selectedId) {
                buttonClassName += " selected";
            }

            return (
                <Button
                    data-tooltip={page.tooltip}
                    id={page.id}
                    key={page.id}
                    tabIndex={-1}
                    className={buttonClassName}
                    focusOnClick={false}
                    draggable={canReorderTabs}
                    onClick={this.selectTab}
                >
                    {page.icon && <Icon src={page.icon} data-tooltip="inherit" />}
                    {page.caption && <Label data-tooltip="inherit">{page.caption}</Label>}
                    {page.auxiliary && <span id="auxiliary">{page.auxiliary}</span>}
                </Button>
            );
        });

        const content: ComponentChild[] = [];
        pages.forEach((page) => {
            const active = page.id === selectedId;
            content.push(
                <CachedTabPage
                    key={page.id}
                    id={page.id}
                    active={active}
                    content={page.content}
                />
            );
        });

        let orientation: Orientation;
        let tabOrientation: Orientation;
        switch (tabPosition) {
            case TabPosition.Top: {
                orientation = Orientation.TopDown;
                tabOrientation = Orientation.LeftToRight;
                break;
            }

            case TabPosition.Right: {
                orientation = Orientation.RightToLeft;
                tabOrientation = Orientation.TopDown;
                break;
            }

            case TabPosition.Bottom: {
                orientation = Orientation.BottomUp;
                tabOrientation = Orientation.LeftToRight;
                break;
            }

            default: {
                orientation = Orientation.LeftToRight;
                tabOrientation = Orientation.TopDown;
                break;
            }
        }

        const newStyle = {
            ...style,
            "--tabItem-border-width": convertPropValue(tabBorderWidth ?? 0),
            "--content-separator-width": convertPropValue(contentSeparatorWidth ?? 0),
        };

        const tabAreaClassName = "tabArea" + (stretchTabs ? " stretched" : "");

        return (
            <Container
                id={id}
                orientation={orientation}
                className={className}
                style={newStyle}
            >
                {
                    (showTabs && (!hideSingleTab || tabs.length > 1)) && (
                        <Container
                            orientation={tabOrientation}
                            className="tabAreaContainer"
                        >
                            <div className="scrollable"
                                onWheel={this.handleWheel}
                            >
                                <Container
                                    innerRef={this.tabAreaRef}
                                    className={tabAreaClassName}
                                    orientation={tabOrientation}
                                >
                                    {tabs}
                                </Container>
                                <div className="scrollbar">
                                    <div
                                        className="slider"
                                        ref={this.sliderRef}
                                        onPointerDown={this.handleSliderDown}
                                        onPointerMove={this.handleSliderMove}
                                        onPointerUp={this.handleSliderUp}
                                    />
                                </div>
                            </div>
                            {auxiliary && <span className="auxiliary">{auxiliary}</span>}
                        </Container>
                    )
                }
                <Container
                    innerRef={this.contentRef}
                    orientation={Orientation.TopDown}
                    className="tabContent"
                >
                    {content}
                </Container>
            </Container>
        );
    }

    private selectTab = (event: MouseEvent | KeyboardEvent): void => {
        const { onSelectTab } = this.props;

        const id = (event.currentTarget as HTMLElement).id;

        onSelectTab?.(id);
    };

    /**
     * Update the slider position when when the tab width changes.
     */
    private handleResize = (): void => {
        if (this.sliderRef.current && this.tabAreaRef.current) {
            const scrollWidth = this.tabAreaRef.current.scrollWidth;
            const clientWidth = this.tabAreaRef.current.clientWidth;

            if (scrollWidth > clientWidth) {
                const sliderWidth = clientWidth * clientWidth / scrollWidth;
                this.sliderRef.current.style.width = `${sliderWidth}px`;
                this.sliderRef.current.style.display = "block";
            } else {
                this.sliderRef.current.style.display = "none";
            }
        }
    };

    /**
     * Start tracking the slider movement on left mouse down and capture the mouse pointer.
     *
     * @param e The mouse event.
     */
    private handleSliderDown = (e: PointerEvent): void => {
        if (e.buttons === 1) {
            this.trackingSliderMove = true;
            this.lastSliderPosition = e.clientX;
            this.sliderRef.current?.setPointerCapture(e.pointerId);
        }
    };

    /**
     * In slider tracking mode update both the slider position and the tab are scroll position on pointer move.
     *
     * @param e The pointer event.
     */
    private handleSliderMove = (e: PointerEvent): void => {
        if (this.trackingSliderMove && this.sliderRef.current && this.tabAreaRef.current) {
            const clientWidth = this.tabAreaRef.current.clientWidth;
            const sliderWidth = this.sliderRef.current.clientWidth;
            const sliderLeftMax = clientWidth - sliderWidth;
            const delta = e.clientX - this.lastSliderPosition;
            let sliderLeft = this.sliderRef.current.offsetLeft + delta;
            if (sliderLeft < 0) {
                sliderLeft = 0;
            }
            if (sliderLeft > sliderLeftMax) {
                sliderLeft = sliderLeftMax;
            }

            this.sliderRef.current.style.left = `${sliderLeft}px`;
            this.lastSliderPosition = e.clientX;

            const scrollLeftMax = this.tabAreaRef.current.scrollWidth - clientWidth;
            const newScrollLeft = scrollLeftMax * sliderLeft / sliderLeftMax;
            this.tabAreaRef.current.scrollLeft = newScrollLeft;
        }
    };

    /**
     * Stops slider tracking mode and releases the pointer capture.
     *
     * @param e The pointer event.
     */
    private handleSliderUp = (e: PointerEvent): void => {
        this.trackingSliderMove = false;
        this.sliderRef.current?.releasePointerCapture(e.pointerId);
    };

    /**
     * Auto scrolls the active tab item into view. Updates both the tab area and the slider position.
     */
    private scrollActiveItemIntoView = (): void => {
        const { selectedId } = this.props;

        if (this.tabAreaRef.current && selectedId) {
            const tabArea = this.tabAreaRef.current;
            const activeTab = document.getElementById(selectedId);
            if (activeTab) {
                const tabAreaRect = tabArea.getBoundingClientRect();
                const activeTabRect = activeTab.getBoundingClientRect();

                if (activeTabRect.left < tabAreaRect.left) {
                    tabArea.scrollLeft -= tabAreaRect.left - activeTabRect.left;
                } else if (activeTabRect.right > tabAreaRect.right) {
                    tabArea.scrollLeft += activeTabRect.right - tabAreaRect.right;
                }

                const sliderLeft = tabArea.scrollLeft * tabArea.clientWidth / tabArea.scrollWidth;
                this.sliderRef.current!.style.left = `${sliderLeft}px`;
            }
        }
    };

    private handleWheel = (e: WheelEvent): void => {
        if (this.tabAreaRef.current) {
            const tabArea = this.tabAreaRef.current;
            tabArea.scrollLeft += e.deltaX;

            const sliderLeft = tabArea.scrollLeft * tabArea.clientWidth / tabArea.scrollWidth;
            this.sliderRef.current!.style.left = `${sliderLeft}px`;
        }
    };

}
