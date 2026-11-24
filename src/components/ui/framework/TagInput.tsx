/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import cx from "classnames";
import { createRef, type ComponentChild, type CSSProperties } from "preact";

import { NameText } from "../../../core/NameText.js";
import { TagPalette } from "../../../core/TagPalette.js";
import { Button } from "./Button.js";
import { Container } from "./Container.js";
import { Icon } from "./Icon.js";
import { Popup } from "./Popup.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "./UIComponent.js";
import { UIIcon } from "./UIIcon.js";
import { ChildAlignment, ChildWrap } from "./ui-types.js";

/** A tag as the input displays it. */
export interface ITag {
    id: number;
    caption: string;

    /** The index of the tag's colour in {@link TagPalette}. Without a colour index the badge keeps its plain look. */
    colorIndex?: number;

    /**
     * A locked tag shows no close button, because the caller knows it cannot be taken off the entity: an instrument
     * tag follows the tracks of the score, and `Demo Score` needs an administrator.
     */
    locked?: boolean;
}

/** An entry of the completion list, and what committing the input hands to `onAdd`. */
export interface ITagCompletion {
    /** The name the completion offers. */
    caption: string;

    /** The tag the completion stands for, so committing it selects that tag instead of creating one. */
    tagId?: number;

    /** Who owns the tag, a group name or the caption of the global scope. Shown when the name is not unique. */
    owner?: string;
}

export interface ITagInputProperties extends ICommonUIProperties {
    /** The tags currently displayed. */
    tags: ITag[];

    /** Whether tags can be removed with a close button. Locked tags never get one. */
    removable?: boolean;

    /** Renders a plain wrapped tag list, without input field, close buttons and colour pickers. */
    readOnly?: boolean;

    /**
     * Whether the badges wrap onto further lines. Defaults to wrapping.
     */
    wrap?: ChildWrap;

    /**
     * Whether unknown text creates a tag. When false only a completion can be committed, so that a filter cannot
     * invent tags and a user without an owner scope cannot create any. Defaults to false.
     */
    allowNew?: boolean;

    /**
     * Offers every tag of the completion list as a pill, as soon as the field takes the focus. A filter uses this so
     * a condition can be picked without typing anything.
     */
    picker?: boolean;

    /** The tags the input offers while typing. */
    completions?: ITagCompletion[];

    /**
     * Called with the committed completion, or with a completion that carries only a caption when `allowNew` turns
     * the typed text into a new tag.
     */
    onAdd?: (completion: ITagCompletion) => void;

    /** Called when a tag is removed. */
    onRemove?: (id: number) => void;

    /** Called when the palette picker of a badge picks another colour index. */
    onBadgeColourChange?: (id: number, colorIndex: number) => void;
}

interface ITagInputState {
    inputValue: string;
    activeCompletionIndex: number;

    /** Whether the pill list of every tag is open, which a click into the field opens. */
    pickerOpen: boolean;
}

/**
 * Renders a set of tags as badges. In its editable shape it adds an input field that commits tags from a completion
 * list or, if allowed, from the typed text, plus a close button and a colour picker per tag.
 */
export class TagInput extends UIComponent<ITagInputProperties, ITagInputState> {
    /** How many completions the input offers at once. */
    private static readonly maxCompletions = 5;

    private inputRef = createRef<HTMLInputElement | null>();
    private containerRef = createRef<HTMLDivElement | null>();
    private pickerRef = createRef<Popup | null>();

    /** Whether the picker popup was asked to open, which its own state reports only a render later. */
    private pickerShown = false;

    public constructor(props: ITagInputProperties) {
        super(props);

        this.state = {
            inputValue: "",
            activeCompletionIndex: -1,
            pickerOpen: false,
        };
    }

    public override componentDidUpdate(): void {
        this.syncPicker();
    }

    public render(): ComponentChild {
        const { tags, readOnly, id, style, wrap = ChildWrap.Wrap } = this.props;
        const className = this.generateFinalClassName(["tag-input"]);

        const tagRows = tags.map((tag) => {
            return this.renderTag(tag);
        });

        let entry: ComponentChild = undefined;
        if (!readOnly) {
            entry = this.renderEntry();
        }

        const picker = this.renderPicker();

        return (
            <Container
                id={id}
                innerRef={this.containerRef}
                className={className}
                mainAlignment={ChildAlignment.Start}
                crossAlignment={ChildAlignment.Center}
                wrap={wrap}
                gap="4px"
                style={style}
            >
                {tagRows}
                {entry}
                {picker}
            </Container>
        );
    }

    private renderTag(tag: ITag): ComponentChild {
        const { readOnly, removable, onBadgeColourChange, onRemove } = this.props;

        // The colour is data, so it reaches the stylesheet as a variable instead of a handful of inline styles.
        const tagStyle: CSSProperties = {};
        const colourIndex = tag.colorIndex;
        if (colourIndex !== undefined) {
            tagStyle["--tag-color"] = TagPalette.colourAt(colourIndex).color;
        }

        const className = cx(
            "du-badge", "du-badge-soft", "tag-input-tag",
            colourIndex === undefined ? undefined : "tag-input-tag-colored",
        );

        let colourPicker: ComponentChild = undefined;
        if (!readOnly && onBadgeColourChange) {
            const colourOptions = TagPalette.colours.map((entry, index) => {
                return <option key={entry.name} value={index}>{entry.name}</option>;
            });

            colourPicker = (
                <select
                    className="tag-input-colour-picker"
                    title="Tag colour"
                    value={colourIndex}
                    onChange={(e) => {
                        onBadgeColourChange(tag.id, Number((e.target as HTMLSelectElement).value));
                    }}
                >
                    {colourOptions}
                </select>
            );
        }

        let closeButton: ComponentChild = undefined;
        if (!readOnly && removable && !tag.locked) {
            closeButton = (
                <Button
                    imageOnly
                    className="du-btn-ghost du-btn-xs tag-input-close-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove?.(tag.id);
                    }}
                >
                    <Icon src={UIIcon.Close} />
                </Button>
            );
        }

        return (
            <span key={tag.id} className={className} style={tagStyle}>
                {colourPicker}
                {tag.caption}
                {closeButton}
            </span>
        );
    }

    private renderEntry(): ComponentChild {
        const { inputValue } = this.state;

        const matches = this.matchingCompletions();
        const completionRows = matches.map((completion, index) => {
            return this.renderCompletion(completion, index);
        });

        let completionList: ComponentChild = undefined;
        if (completionRows.length > 0) {
            completionList = (
                <ul className="du-dropdown du-menu rounded-box bg-base-100 shadow-sm tag-input-completions">
                    {completionRows}
                </ul>
            );
        }

        return (
            <div className="tag-input-entry">
                <input
                    ref={this.inputRef}
                    className="du-input du-input-bordered du-input-xs tag-input-field"
                    value={inputValue}
                    placeholder="Add…"
                    onInput={this.handleInput}
                    onKeyDown={this.handleKeyDown}
                    onFocus={this.handleFocus}
                    onBlur={this.handleBlur}
                />
                {completionList}
            </div>
        );
    }

    /**
     * @returns The popup with the pill list of every tag the field can still take, or undefined without a picker.
     */
    private renderPicker(): ComponentChild {
        const { picker = false } = this.props;

        if (!picker) {
            return undefined;
        }

        const available = this.availableCompletions();
        const pills = available.map((completion) => {
            const key = `${completion.tagId ?? "new"}-${completion.caption}-${completion.owner ?? ""}`;

            // The owner only tells same-named tags apart, so it is shown only where it matters.
            let owner: ComponentChild = undefined;
            if (completion.owner && this.isAmbiguousName(completion)) {
                owner = <span className="tag-input-picker-owner">{completion.owner}</span>;
            }

            return (
                <button
                    key={key}
                    type="button"
                    className="tag-input-picker-pill"
                    title={completion.owner ? `${completion.caption} — ${completion.owner}` : completion.caption}
                    // Keep the focus in the field, so the picker stays open for the next tag.
                    onMouseDown={(e) => {
                        e.preventDefault();
                        this.commit(completion);
                    }}
                >
                    {completion.caption}
                    {owner}
                </button>
            );
        });

        // The pills lie in a popup below the field, so opening them does not push the layout around.
        return (
            <Popup
                ref={this.pickerRef}
                className="tag-input-picker-popup"
                placement={ComponentPlacement.BottomLeft}
                showArrow={true}
                offset={4}
                restoreFocusOnClose={false}
                boundsProvider={this.pickerBounds}
                onClose={this.handlePickerClose}
            >
                <div className="tag-input-picker" role="listbox" aria-label="Available tags">
                    {pills}
                </div>
            </Popup>
        );
    }

    private renderCompletion(completion: ITagCompletion, index: number): ComponentChild {
        const { activeCompletionIndex } = this.state;

        const className = cx(
            "tag-input-completion",
            this.classFromProperty(index === activeCompletionIndex, "du-active"),
        );

        let owner: ComponentChild = undefined;
        if (completion.owner && this.isAmbiguousName(completion)) {
            owner = <span className="tag-input-completion-owner">{completion.owner}</span>;
        }

        const key = `${completion.tagId ?? "new"}-${completion.caption}-${completion.owner ?? ""}`;

        return (
            <li key={key} className={className}>
                <a
                    onMouseDown={(e) => {
                        e.preventDefault();
                        this.commit(completion);
                    }}
                >
                    {completion.caption}
                    {owner}
                </a>
            </li>
        );
    }

    /**
     * @returns The completions that are not on the entity yet.
     */
    private availableCompletions(): ITagCompletion[] {
        const { completions = [], tags } = this.props;

        const assignedIds = new Set(tags.map((tag) => {
            return tag.id;
        }));
        const assignedCaptions = new Set(tags.map((tag) => {
            return tag.caption;
        }));

        return completions.filter((completion) => {
            if (completion.tagId !== undefined) {
                return !assignedIds.has(completion.tagId);
            }

            return !assignedCaptions.has(completion.caption);
        });
    }

    /**
     * @returns The completions whose name starts with the typed text.
     */
    private matchingCompletions(): ITagCompletion[] {
        const typed = NameText.normalize(this.state.inputValue);

        if (!typed) {
            return [];
        }

        const prefix = typed.toLowerCase();

        return this.availableCompletions().filter((completion) => {
            return completion.caption.toLowerCase().startsWith(prefix) && !NameText.equals(completion.caption, typed);
        }).slice(0, TagInput.maxCompletions);
    }

    /**
     * @param completion The completion to inspect.
     *
     * @returns Whether another tag carries the same name, which makes the owner worth showing next to it.
     */
    private isAmbiguousName(completion: ITagCompletion): boolean {
        const { completions = [], tags } = this.props;

        const offeredTwice = completions.some((other) => {
            return other !== completion && NameText.equals(other.caption, completion.caption);
        });

        return offeredTwice || tags.some((tag) => {
            return NameText.equals(tag.caption, completion.caption);
        });
    }

    private commit(completion: ITagCompletion): void {
        const { onAdd } = this.props;

        onAdd?.(completion);
        this.setState({ inputValue: "", activeCompletionIndex: -1 }, () => {
            this.inputRef.current?.focus();
        });
    }

    /** Opens the picker popup while the field wants it and there is a tag left to offer, and closes it otherwise. */
    private syncPicker(): void {
        const { pickerOpen } = this.state;
        const popup = this.pickerRef.current;
        const anchor = this.containerRef.current;

        if (!popup || !anchor) {
            return;
        }

        const show = pickerOpen && this.availableCompletions().length > 0;
        if (show) {
            if (!this.pickerShown) {
                this.pickerShown = true;
                popup.open(anchor);
            } else {
                popup.updatePosition(anchor);
            }
        } else if (this.pickerShown) {
            this.pickerShown = false;
            popup.close(true);
        }
    }

    private pickerBounds = (): DOMRect | undefined => {
        return this.inputRef.current?.getBoundingClientRect();
    };

    /** The popup closes on its own after a press beside it or Escape; the field then no longer wants it either. */
    private handlePickerClose = (): void => {
        const { pickerOpen } = this.state;

        this.pickerShown = false;
        if (pickerOpen) {
            this.setState({ pickerOpen: false });
        }
    };

    private handleFocus = (): void => {
        const { picker = false } = this.props;

        if (picker) {
            this.setState({ pickerOpen: true });
        }
    };

    private handleBlur = (): void => {
        const { pickerOpen } = this.state;

        if (pickerOpen) {
            this.setState({ pickerOpen: false });
        }
    };

    private handleInput = (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.setState({ inputValue: target.value, activeCompletionIndex: -1 });
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        const { allowNew } = this.props;
        const { inputValue, activeCompletionIndex, pickerOpen } = this.state;
        const matches = this.matchingCompletions();

        // Escape closes this entry, not the layer it sits in, while text, a completion list or the picker is open.
        if (e.key === "Escape" && (inputValue.length > 0 || activeCompletionIndex >= 0 || pickerOpen)) {
            e.preventDefault();
            e.stopPropagation();
            this.setState({ inputValue: "", activeCompletionIndex: -1, pickerOpen: false });

            return;
        }

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

        if (e.key !== "Enter") {
            return;
        }

        e.preventDefault();

        if (activeCompletionIndex >= 0 && activeCompletionIndex < matches.length) {
            this.commit(matches[activeCompletionIndex]);

            return;
        }

        const caption = NameText.normalize(inputValue);
        if (!caption) {
            return;
        }

        // Typed text that names exactly one existing tag selects that tag, whatever its case or accents.
        const exactMatches = this.availableCompletions().filter((completion) => {
            return NameText.equals(completion.caption, caption);
        });

        if (exactMatches.length === 1) {
            this.commit(exactMatches[0]);

            return;
        }

        // Several tags share the name, so only the owner in the completion list tells them apart.
        if (exactMatches.length > 1) {
            return;
        }

        if (allowNew) {
            this.commit({ caption });
        }
    };
}
