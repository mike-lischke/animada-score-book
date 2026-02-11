/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import type { IDialogActions } from "./Dialog.js";
import { UIComponent, type ICommonUIProperties } from "../UIComponent.js";
import { Button } from "../Button.js";
import { Container } from "../Container.js";
import { Icon } from "../Icon.js";
import { ChildAlignment, Orientation } from "../ui-types.js";
import { Codicon } from "../Codicon.js";

interface IDialogContentProperties extends ICommonUIProperties {
    content?: ComponentChild;
    header?: ComponentChild;
    caption?: ComponentChild;
    actions?: IDialogActions;

    onCloseClick?: () => void;
}

/** This component is the separated-out content for a dialog, but can be rendered anywhere. */
export class DialogContent extends UIComponent<IDialogContentProperties> {
    private contentRef = createRef<HTMLDivElement>();
    private innerRef = createRef<HTMLDivElement>();

    private isDragging = false;
    private dragStartX = -1;
    private dragStartY = -1;
    private lastDeltaX = 0;
    private lastDeltaY = 0;

    public render(): ComponentChild {
        const { children, content, header, caption, actions } = this.props;
        const className = this.generateFinalClassName(["dialog", "visible"]);

        let dialogContent;
        if (children != null) {
            dialogContent = children;
        } else {
            dialogContent = (
                <>
                    {caption && <Container
                        className="title"
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                    >
                        {caption}
                        <Button id="closeButton"
                            imageOnly
                            onClick={this.handleCloseClick}
                        >
                            <Icon src={Codicon.Close} />
                        </Button>
                    </Container>
                    }
                    {header && <div className="header">{header}</div>}
                    {content && <div ref={this.contentRef} className="content">{content}</div>}
                    {actions &&
                        <div className="footer verticalCenterContent">
                            <Container
                                className="leftItems"
                                orientation={Orientation.LeftToRight}
                            >
                                {actions.begin}
                            </Container>
                            <Container
                                className="rightItems"
                                orientation={Orientation.RightToLeft}
                            >
                                {actions.end}
                            </Container>

                        </div>}
                </>
            );
        }

        return (
            <div
                ref={this.innerRef}
                className={className}
            >
                {dialogContent}
            </div>
        );
    }

    private handleCloseClick = () => {
        const { onCloseClick } = this.props;

        onCloseClick?.();
    };
}
