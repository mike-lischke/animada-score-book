/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { ComponentChild, createRef } from "preact";

import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { Codicon } from "./Codicon.js";

export interface ITag {
    id: number;
    caption: string;
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
        const { tags, removable, completions, id, style } = this.props;
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
            <div
                id={id}
                className={className}
                style={{
                    ...style,
                    display: "flex", flexWrap: "wrap", alignItems: "flex-start",
                    gap: "4px", position: "relative",
                }}
            >
                {tags.map((tag) => {
                    return (
                        <span key={tag.id} className="badge badge-lg gap-1">
                            {tag.caption}
                            {removable && (
                                <Button
                                    imageOnly
                                    className="du-btn-ghost du-btn-xs"
                                    onClick={() => {
                                        this.props.onRemove?.(tag.id);
                                    }}
                                >
                                    <Icon src={Codicon.Close} />
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
            </div>
        );
    }

    private commitInput(value: string): void {
        this.props.onAdd?.(value);
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
