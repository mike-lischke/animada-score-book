/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import type { MessageType, TextAlignment } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export interface ILabelProperties extends ICommonUIProperties {
    /** The content of the label. Can alternatively be set via the children. This property takes precedence, though. */
    caption?: string;

    /** Determines the normal HTML alignment of the text content. Not used for `ansi`. */
    textAlignment?: TextAlignment;

    /** When set this formats the text into a emphasized block, which stands out in normal text flow. */
    quoted?: boolean;

    /**
     * When set to true then the text is rendered like a block of code (fixed width font with the theme code
     * text colors).
     */
    code?: boolean;

    /** When set renders the text with larger font and the caption color. */
    heading?: boolean;

    /** When set applies special colors to the text. This should be used only with plain text. */
    messageType?: MessageType;

    /** When set to true the text will wrap. */
    wrap?: boolean;

    /** An optional reference object to hold the ref to the generated HTML element. */
    innerRef?: preact.RefObject<HTMLLabelElement>;
}

export class Label extends UIComponent<ILabelProperties> {

    private labelRef: preact.RefObject<HTMLLabelElement>;

    public constructor(props: ILabelProperties) {
        super(props);

        this.state = {};
        this.labelRef = props.innerRef ?? createRef<HTMLLabelElement>();
    }

    public render(): ComponentChild {
        const {
            id, children, caption, textAlignment, quoted, code, heading, messageType: type, style, wrap,
            title
        } = this.props;

        const actualStyle = { ...style };
        if (textAlignment) {
            actualStyle.textAlign = textAlignment;
        }

        const content = caption ?? children;

        const className = this.generateFinalClassName([
            "label",
            this.classFromProperty(type, ["error", "warning", "info", "text", "response"]),
            this.classFromProperty(quoted, "quote"),
            this.classFromProperty(code, "code"),
            this.classFromProperty(heading, "heading"),
            this.classFromProperty(wrap, "wrap"),
        ]);

        return (
            <span
                id={id}
                ref={this.labelRef}
                className={className}
                style={actualStyle}
                title={title}
            >
                {content}
            </span>
        );
    }
}
