/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { TagInput, type ITag, type ITagCompletion } from "../components/ui/framework/TagInput.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";

/** One AND group of the filter, with the badges the selector shows for it. */
export interface IFilterGroup {
    /** The badges of the tags in this group; empty for a group that holds no condition yet. */
    tags: ITag[];

    /** Tag ids this group names that the catalogue no longer holds, which are reported instead of dropped. */
    unavailableNames: string[];
}

export interface ITagFilterBarProperties extends ICommonUIProperties {
    /** The AND groups the filter holds, each with its badges. The rows are OR-ed. */
    groups: IFilterGroup[];

    /** The completions every group offers: the usable tags, with their owner so same-named tags stay apart. */
    completions: ITagCompletion[];

    /** How many scores the caller may see with this filter; undefined while the list is not known. */
    scoreCount?: number;

    /**
     * Whether the list is still being loaded. Only then does the summary say so; a failed request or an unusable
     * filter is explained by the list itself, and a count would be made up.
     */
    countLoading?: boolean;

    /** Whether the filter holds any condition, which decides whether Reset does anything. */
    hasFilter: boolean;

    onAddTag: (groupIndex: number, tagId: number) => void;
    onRemoveTag: (groupIndex: number, tagId: number) => void;
    onAddGroup: (groupIndex: number) => void;
    onRemoveGroup: (groupIndex: number) => void;
    onReset: () => void;
}

/**
 * The manual tag filter of the score collection: one row per AND group, and the rows are OR-ed. Each row is a tag
 * field of its own, with a button that appends a further row below it and one that removes the row. A filter always
 * keeps one row, so there is always a field to type into.
 */
export class TagFilterBar extends UIComponent<ITagFilterBarProperties> {
    public render(): ComponentChild {
        const summary = this.renderSummary();
        const groups = this.renderGroups();

        return (
            <Container className="score-filter" orientation={Orientation.TopDown}>
                {summary}
                {groups}
            </Container>
        );
    }

    private renderSummary(): ComponentChild {
        const { groups, scoreCount, countLoading, hasFilter, onReset } = this.props;

        // Without a known list a count would be made up, so only a running query is named; failed and unusable
        // filters are explained by the list below.
        let count: ComponentChild = undefined;
        if (scoreCount !== undefined) {
            const caption = scoreCount === 1 ? "1 score" : `${scoreCount} scores`;
            count = <Label className="score-filter-count" caption={caption} />;
        } else if (countLoading) {
            count = <Label className="score-filter-count" caption="Loading…" />;
        }

        const active = groups.some((group) => {
            return group.tags.length > 0 || group.unavailableNames.length > 0;
        });

        let reset: ComponentChild = undefined;
        if (hasFilter || active) {
            reset = (
                <Button id="scoreFilterReset" className="score-filter-reset" plain={true} title="Reset the filter"
                    onClick={onReset}>
                    <Icon src={UIIcon.ClearAll} />
                    <span>Reset</span>
                </Button>
            );
        }

        return (
            <Container className="score-filter-summary" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Filter} className="score-filter-icon" />
                {count}
                {reset}
            </Container>
        );
    }

    private renderGroups(): ComponentChild {
        const { groups } = this.props;

        // A filter keeps one row even while it is empty, so there is always a field to type into.
        const rows = groups.length > 0 ? groups : [{ tags: [], unavailableNames: [] }];

        return rows.map((group, index) => {
            return this.renderGroup(index, group, rows.length);
        });
    }

    private renderGroup(index: number, group: IFilterGroup, rowCount: number): ComponentChild {
        const { completions, onAddTag, onRemoveTag, onAddGroup, onRemoveGroup } = this.props;
        const id = index === 0 ? "scoreFilterGroup" : `scoreFilterGroup-${index}`;

        let missing: ComponentChild = undefined;
        if (group.unavailableNames.length > 0) {
            const caption = `Not available: ${group.unavailableNames.join(", ")}`;
            missing = <Label className="score-filter-missing" caption={caption} wrap={true} />;
        }

        const selector = (
            <TagInput
                key={id}
                id={id}
                className="score-filter-tags"
                tags={group.tags}
                completions={completions}
                removable
                allowNew={false}
                picker
                onAdd={(completion) => {
                    if (completion.tagId !== undefined) {
                        onAddTag(index, completion.tagId);
                    }
                }}
                onRemove={(tagId) => {
                    onRemoveTag(index, tagId);
                }}
            />
        );

        // The last remaining row stays: without a row there would be nothing to pick a tag in.
        const canRemove = rowCount > 1;

        return (
            <Container key={id} className="score-filter-row" orientation={Orientation.TopDown}>
                <Container className="score-filter-line" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    {selector}
                    <Container className="score-filter-row-actions" orientation={Orientation.LeftToRight}>
                        <Button className="score-filter-group-add" imageOnly disabled={group.tags.length === 0}
                            title="Add a further tag group"
                            onClick={() => {
                                onAddGroup(index);
                            }}>
                            <Icon src={UIIcon.Add} />
                        </Button>
                        <Button className="score-filter-group-remove" imageOnly disabled={!canRemove}
                            title="Remove this filter" onClick={() => {
                                onRemoveGroup(index);
                            }}>
                            <Icon src={UIIcon.HorizontalRule} />
                        </Button>
                    </Container>
                </Container>
                {missing}
            </Container>
        );
    }
}
