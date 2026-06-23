/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { Codicon } from "./Codicon.js";
import { Container } from "./Container.js";
import { ChildAlignment, ChildWrap } from "./ui-types.js";

export interface ITag {
    id: number;
    caption: string;

    /** Optional hex color for the badge background (e.g. "#a1b2c3"). */
    color?: string;
}

interface ITagInputProperties extends ICommonUIProperties {
    /** The tags currently displayed. */
    tags: ITag[];

    /** Whether tags can be removed by clicking an X button. */
    removable?: boolean;

    /** Optional list of known captions for autocomplete. Filtered by current input. */
    completions?: string[];

    /** Called when the user types text and presses Enter (or clicks a completion). The owner should create a tag. */
    onAdd?: (caption: string) => void;

    /** Called when a tag is removed. */
    onRemove?: (id: number) => void;

    /** Called when a tag's color is changed via the inline color picker. */
    onBadgeColorChange?: (id: number, color: string) => void;
}

interface ITagInputState {
    inputValue: string;
    activeCompletionIndex: number;
}

/**
 * Renders a set of tags as badge/pill elements with an inline text input
 * for adding new tags by typing and pressing Enter.
 */
export class TagInput extends UIComponent<ITagInputProperties, ITagInputState> {
    private inputRef = createRef<HTMLInputElement>();

    public constructor(props: ITagInputProperties) {
        super(props);

        this.state = {
            inputValue: "",
            activeCompletionIndex: -1,
        };
    }

    public render(): ComponentChild {
        const { tags, removable, completions, id, style, onBadgeColorChange, onRemove } = this.props;
        const { inputValue, activeCompletionIndex } = this.state;
        const className = this.generateFinalClassName(["tagInput"]);

        const existingCaptions = new Set(tags.map((t) => {
            return t.caption;
        }));
        const matches = inputValue && completions
            ? completions.filter((c) => {
                return !existingCaptions.has(c)
                    && c.toLowerCase().startsWith(inputValue.toLowerCase())
                    && c !== inputValue;
            }).slice(0, 5)
            : [];

        return (
            <Container
                id={id}
                className={className}
                mainAlignment={ChildAlignment.Start}
                wrap={ChildWrap.Wrap}
                gap="4px"
                style={style}
            >
                {tags.map((tag) => {
                    const badgeStyle: Record<string, string> = {};
                    if (tag.color) {
                        badgeStyle.backgroundColor = tag.color;
                        badgeStyle.color = isLightColor(tag.color) ? "#1a1a2e" : "#ffffff";
                        badgeStyle.borderColor = tag.color;
                    }

                    const textColor = tag.color
                        ? (isLightColor(tag.color) ? "#1a1a2e" : "#ffffff")
                        : undefined;

                    return (
                        <span
                            key={tag.id}
                            className="du-badge gap-1"
                            style={{
                                ...badgeStyle,
                                position: "relative",
                            }}
                        >
                            {onBadgeColorChange && (
                                <input
                                    type="color"
                                    value={tag.color ?? "#808080"}
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        opacity: 0,
                                        cursor: "pointer",
                                    }}
                                    onChange={(e) => {
                                        onBadgeColorChange(tag.id, (e.target as HTMLInputElement).value);
                                    }}
                                />
                            )}
                            {tag.caption}
                            {removable && (
                                <Button
                                    imageOnly
                                    className="du-btn-ghost du-btn-xs tag-input-close-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove?.(tag.id);
                                    }}
                                >
                                    <Icon src={Codicon.Close} style={textColor ? { color: textColor } : undefined} />
                                </Button>
                            )}
                        </span>
                    );
                })}

                <div style={{ position: "relative", flex: "1", minWidth: "100px" }}>
                    <input
                        ref={this.inputRef}
                        className="du-input du-input-bordered du-input-xs"
                        style={{ width: "100%" }}
                        value={inputValue}
                        placeholder="Add…"
                        onInput={this.handleInput}
                        onKeyDown={this.handleKeyDown}
                    />
                    {matches.length > 0 && (
                        <ul
                            className="du-dropdown du-menu rounded-box bg-base-100 shadow-sm"
                            style={{
                                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                            }}
                        >
                            {matches.map((m, i) => {
                                return (
                                    <li
                                        key={m}
                                        className={i === activeCompletionIndex ? "du-active" : ""}
                                    >
                                        <a
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                this.commitInput(m);
                                            }}
                                        >
                                            {m}
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Container>
        );
    }

    private commitInput(value: string): void {
        const { onAdd } = this.props;

        onAdd?.(value);
        this.setState({ inputValue: "", activeCompletionIndex: -1 }, () => {
            this.inputRef.current?.focus();
        });
    }

    private handleInput = (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.setState({ inputValue: target.value, activeCompletionIndex: -1 });
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        const { inputValue, activeCompletionIndex } = this.state;
        const { completions, tags } = this.props;

        const existingCaptions = new Set(tags.map((t) => {
            return t.caption;
        }));
        const matches = inputValue && completions
            ? completions.filter((c) => {
                return !existingCaptions.has(c)
                    && c.toLowerCase().startsWith(inputValue.toLowerCase())
                    && c !== inputValue;
            })
            : [];

        if (e.key === "ArrowDown" && matches.length > 0) {
            e.preventDefault();
            const next = activeCompletionIndex + 1 >= matches.length ? 0 : activeCompletionIndex + 1;
            this.setState({ activeCompletionIndex: next });

            return;
        }

        if (e.key === "ArrowUp" && matches.length > 0) {
            e.preventDefault();
            const next = activeCompletionIndex - 1 < 0 ? matches.length - 1 : activeCompletionIndex - 1;
            this.setState({ activeCompletionIndex: next });

            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();

            if (activeCompletionIndex >= 0 && activeCompletionIndex < matches.length) {
                this.commitInput(matches[activeCompletionIndex]);

                return;
            }

            if (inputValue.trim()) {
                this.commitInput(inputValue.trim());
            }
        }
    };
}

/**
 * Determines whether a hex color is "light" (suitable for dark text)
 * using relative luminance.
 *
 * @param hex The hex color string (e.g. "#a1b2c3").
 * @returns True if the color is light enough for dark text.
 */
const isLightColor = (hex: string): boolean => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);

    return luminance > 0.5;
};
