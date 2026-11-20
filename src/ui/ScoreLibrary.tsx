/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, render, type ComponentChild } from "preact";

import type { CellComponent, ColumnDefinition } from "tabulator-tables";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Menu } from "../components/ui/framework/Menu/Menu.js";
import type { IMenuItem } from "../components/ui/framework/Menu/MenuItem.js";
import { TagInput, type ITagCompletion } from "../components/ui/framework/TagInput.js";
import { TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { NameText } from "../core/NameText.js";
import {
    ScoreBookChangeReason, type ISbDmScore, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";
import { TagCombination } from "../core/TagCombination.js";
import { ScoreListSortOrder } from "../core/types/general.js";
import { globalTagOwnerCaption, type ITagCombination } from "../core/types/tags.js";
import { TagBadges } from "./TagBadges.js";
import { PermIndicator } from "./PermIndicator.js";
import { requisitions } from "../supplement/Requisitions.js";
import { NotificationCenter } from "../components/ui/NotificationCenter/NotificationCenter.js";

/** The sort choices of the score overview: the stored order, the menu label and the caption of the selector. */
const sortChoices = new Map<ScoreListSortOrder, { label: string; caption: string; }>([
    [ScoreListSortOrder.NameAscending, { label: "Name A–Z", caption: "A–Z" }],
    [ScoreListSortOrder.NameDescending, { label: "Name Z–A", caption: "Z–A" }],
]);

/**
 * @param scores The scores to order; the array itself stays as it is.
 * @param sortOrder The order to apply.
 *
 * @returns A new array with the scores in that order, compared like the name column collates.
 */
const arrangeScores = (scores: readonly ISbDmScore[], sortOrder: ScoreListSortOrder): ISbDmScore[] => {
    const arranged = [...scores];

    arranged.sort((left, right) => {
        const result = NameText.compare(left.name, right.name);

        return sortOrder === ScoreListSortOrder.NameDescending ? -result : result;
    });

    return arranged;
};

export interface IScoreLibraryProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;

    /**
     * Runs a score action; the app owns the dialogs and the data model.
     *
     * @param action One of load, copyUrl, remove, managePerm, import and new.
     * @param score The score the action applies to, or undefined when it needs none.
     * @param tagIds For a new score, the tags of the active AND group that the score starts with.
     */
    onAction?: (action: string, score?: ISbDmScore, tagIds?: number[]) => Promise<boolean>;
}

interface IScoreLibraryState {
    currentSettings: IUISettings;
    sortOrder: ScoreListSortOrder;

    /** The tag combination the selector edits and the list was queried with. */
    combination: ITagCombination;

    /** The scores of the current combination, in the order the overview shows them. */
    scores: ISbDmScore[];
}

/**
 * The overview of the scores: a flat list of everything the current tag combination matches, with a selector that
 * builds that combination. A double click loads a score into the player/editor.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    private scoreTableRef = createRef<TreeGrid | null>();

    public constructor(props: IScoreLibraryProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const sortOrder = settings.scoreListSortOrder ?? ScoreListSortOrder.NameAscending;

        this.state = {
            currentSettings: settings,
            sortOrder,
            combination: TagCombination.empty,
            scores: arrangeScores(props.dataModel.scores, sortOrder),
        };
    }

    public override componentDidMount(): void {
        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("permChanged", this.handlePermChanged);
        requisitions.register("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.register("tagsChanged", this.handleTagsChanged);
        requisitions.register("scoreTagsChanged", this.handleScoreTagsChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("permChanged", this.handlePermChanged);
        requisitions.unregister("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.unregister("tagsChanged", this.handleTagsChanged);
        requisitions.unregister("scoreTagsChanged", this.handleScoreTagsChanged);
    }

    public render(): ComponentChild {
        const header = this.renderHeader();
        const selector = this.renderSelector();
        const sortSelector = this.renderSortSelector();
        const list = this.renderList();
        const favourites = this.renderFavourites();

        return (
            <Container id="libraryPaneContent" orientation={Orientation.TopDown}>
                {header}
                {selector}
                {sortSelector}
                {list}
                {favourites}
            </Container>
        );
    }

    private renderHeader(): ComponentChild {
        const actions = (
            <Container className="score-library-header-actions" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button id="scoreListNewScore" imageOnly title="New Score" onClick={this.handleNewScoreClick}>
                    <Icon src={UIIcon.NewScore} />
                </Button>
                <Button id="scoreListImportScore" imageOnly title="Import Score" onClick={this.handleImportClick}>
                    <Icon src={UIIcon.CloudDownload} />
                </Button>
            </Container>
        );

        return (
            <Container className="score-library-header" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Library} className="score-library-icon" />
                <Label heading={true}>Score Library</Label>
                {actions}
            </Container>
        );
    }

    private renderSelector(): ComponentChild {
        const { dataModel } = this.props;

        const selector = (
            <TagInput
                id="scoreListTagSelector"
                className="score-library-tag-selector"
                tags={TagBadges.resolve(this.activeGroup(), dataModel.tags)}
                completions={this.tagCompletions()}
                removable
                allowNew={false}
                onAdd={this.handleTagAdd}
                onRemove={this.handleTagRemove}
            />
        );

        // Disabled controls: the tag-combination navigation and the drag handle.
        return (
            <Container className="score-library-selector" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Button id="scoreListHistoryBack" imageOnly disabled title="Back to the previous tag combination">
                    <Icon src={UIIcon.ArrowLeft} />
                </Button>
                <Button id="scoreListHistoryForward" imageOnly disabled title="Forward to the next tag combination">
                    <Icon src={UIIcon.ArrowRight} />
                </Button>
                <span className="score-library-drag-handle" title="Drag handle for the current tag combination">
                    <Icon src={UIIcon.Menu} />
                </span>
                {selector}
            </Container>
        );
    }

    private renderSortSelector(): ComponentChild {
        const { sortOrder } = this.state;
        const choice = sortChoices.get(sortOrder);

        const items: IDropdownItem[] = [...sortChoices].map(([order, option]) => {
            return {
                label: option.label,
                onClick: () => {
                    this.handleSortOrderChange(order);
                },
            };
        });

        return (
            <Container className="score-library-sort" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Dropdown
                    id="scoreListSortOrder"
                    icon={<Icon src={UIIcon.ListOrdered} />}
                    caption={choice?.caption}
                    title="Sort order"
                    items={items}
                    selectedItem={choice?.label}
                    closeOnSelect
                />
            </Container>
        );
    }

    private renderList(): ComponentChild {
        const { scores } = this.state;

        let content: ComponentChild;
        if (scores.length === 0) {
            content = this.renderEmptyState();
        } else {
            content = this.renderTable();
        }

        return (
            <Container id="scoreTreeHost" orientation={Orientation.TopDown}>
                {content}
            </Container>
        );
    }

    private renderEmptyState(): ComponentChild {
        const { combination } = this.state;

        let caption = "No score matches the selected tags.";
        if (TagCombination.isEmpty(combination)) {
            caption = "The library holds no scores yet.";
        }

        return <Label className="score-list-empty" caption={caption} wrap />;
    }

    private renderTable(): ComponentChild {
        const { scores } = this.state;

        const scoreColumns: ColumnDefinition[] = [{
            title: "",
            field: "name",
            resizable: false,
            hozAlign: "left",
            formatter: this.scoreCellFormatter,
            cellDblClick: this.handleScoreDblClick,
        }];

        const scoreOptions: ITreeGridOptions = {
            treeColumn: "name",
            selectionType: SelectionType.Single,
            showHeader: false,
            layout: "fitColumns",
            horizontalGridLines: false,
            verticalGridLines: false,
        };

        return <TreeGrid ref={this.scoreTableRef} options={scoreOptions} columns={scoreColumns} tableData={scores} />;
    }

    /**
     * @returns The lower area of the drawer, below the score list.
     */
    private renderFavourites(): ComponentChild {
        return (
            <Container id="scoreListFavourites" className="score-library-favourites"
                orientation={Orientation.LeftToRight} crossAlignment={ChildAlignment.Center}>
                <Label caption="No favourite tag combinations yet." wrap />
            </Container>
        );
    }

    private scoreCellFormatter = (cell: CellComponent): string | HTMLElement => {
        const { currentSettings } = this.state;
        const { dataModel } = this.props;

        const data = cell.getData() as ISbDmScore;

        const host = document.createElement("div");
        host.className = "score-tree-entry";
        host.dataset.entryType = String(data.type);
        host.dataset.entryId = String(data.id);
        host.dataset.scoreId = String(data.id);

        const menuItems: IMenuItem[] = [
            { id: "load", label: "Load Score" },
            { id: "copyUrl", label: "Copy Score URL", icon: UIIcon.Link },
            { id: "separator2", label: "-" },
            { id: "remove", label: "Remove Score", icon: UIIcon.Trash },
        ];

        const isAdmin = dataModel.user?.isAdmin ?? false;
        const { perm } = data;
        const canManage = isAdmin || (perm?.isOwner === true);
        const showIndicator = (currentSettings.showPermMatrix ?? true) && perm != null;
        const canWrite = perm?.canWrite === true;
        const isWorld = perm?.isWorld === true;

        if (canManage) {
            menuItems.push(
                { id: "separator3", label: "-" },
                { id: "managePerm", label: "Group Access", icon: UIIcon.Key },
            );
        }

        let indicator: ComponentChild = undefined;
        if (showIndicator) {
            indicator = (
                <PermIndicator
                    canWrite={canWrite}
                    isWorld={isWorld}
                    canManage={canManage}
                    onManage={canManage ? () => {
                        this.selectRow(data.id);
                        void this.runAction("managePerm", data);
                    } : undefined}
                />
            );
        }

        const tags = TagBadges.resolve(data.tagIds, dataModel.tags);
        let tagRow: ComponentChild = undefined;
        if (tags.length > 0) {
            tagRow = <TagInput className="score-entry-tags" tags={tags} readOnly />;
        }

        const mainRow = (
            <Container className="score-entry-main" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Music} className="score scoreTreeIcon" />
                <Label caption={data.name} />
                {indicator}
                <Container className="action-box" orientation={Orientation.LeftToRight}>
                    <Menu
                        icon={UIIcon.KebabVertical}
                        items={menuItems}
                        onItemClick={(id) => {
                            this.handleMenuItemClick(id, data);
                        }}
                    />
                </Container>
            </Container>
        );

        const content = (
            <Container className="score-entry" orientation={Orientation.TopDown}>
                {mainRow}
                {tagRow}
            </Container>
        );

        render(content, host);

        return host;
    };

    private handleMenuItemClick = (id: string, entry: ISbDmScore): void => {
        if (id === "managePerm") {
            this.selectRow(entry.id);
        }

        if (id === "copyUrl") {
            const url = `${window.location.origin}${import.meta.env.BASE_URL}?score=${entry.id}`;
            void navigator.clipboard.writeText(url);
            void NotificationCenter.showInfo("Score URL copied to clipboard.");

            return;
        }

        void this.runAction(id, entry);
    };

    private handleScoreDblClick = (event: UIEvent, cell: CellComponent): void => {
        const entry = cell.getData() as ISbDmScore;

        void this.runAction("load", entry);
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        this.setState({ currentSettings: settings }, () => {
            this.reformatRows();
        });

        return Promise.resolve(true);
    };

    private handleScoreBookLoaded = (reason: ScoreBookChangeReason): Promise<boolean> => {
        // Loading a score or renaming one leaves the list as it is; only a different set of scores is replaced.
        if (reason === ScoreBookChangeReason.EntryDeleted
            || reason === ScoreBookChangeReason.LibraryRefreshed) {
            this.setState({ scores: this.orderedScores() });
        }

        return Promise.resolve(true);
    };

    private handleScoreEntryUpdated = (): Promise<boolean> => {
        // A rename can move the score somewhere else in the order, so the whole list is arranged again.
        this.setState({ scores: this.orderedScores() });

        return Promise.resolve(true);
    };

    private handlePermChanged = (): Promise<boolean> => {
        this.setState({ scores: this.orderedScores() });

        return Promise.resolve(true);
    };

    private handleScoreTagsChanged = (): Promise<boolean> => {
        this.setState({ scores: this.orderedScores() });

        return Promise.resolve(true);
    };

    private handleTagsChanged = (): Promise<boolean> => {
        const { dataModel } = this.props;
        const { combination } = this.state;

        // A deleted tag drops out of the filter; the rest of the combination keeps the list it had.
        const usableIds = new Set(dataModel.tags.map((tag) => {
            return tag.id;
        }));
        const restricted = TagCombination.restrict(combination, usableIds);

        if (!TagCombination.equals(restricted, combination)) {
            void this.applyCombination(restricted);

            return Promise.resolve(true);
        }

        this.setState({ scores: this.orderedScores() });

        return Promise.resolve(true);
    };

    private handleNewScoreClick = (): void => {
        void this.runAction("new", undefined, this.assignableTagIds());
    };

    private handleImportClick = (): void => {
        void this.runAction("import");
    };

    private handleTagAdd = (completion: ITagCompletion): void => {
        const { tagId } = completion;
        if (tagId === undefined) {
            return;
        }

        void this.applyCombination({ groups: [[...this.activeGroup(), tagId]] });
    };

    private handleTagRemove = (tagId: number): void => {
        const group = this.activeGroup().filter((id) => {
            return id !== tagId;
        });

        void this.applyCombination({ groups: [group] });
    };

    private handleSortOrderChange = (sortOrder: ScoreListSortOrder): void => {
        const { dataModel } = this.props;

        AppStorage.saveSetting("scoreListSortOrder", sortOrder);
        this.setState({ sortOrder, scores: arrangeScores(dataModel.scores, sortOrder) });
    };

    /**
     * @returns The tag ids of the active AND group that the user may put on a score.
     */
    private assignableTagIds(): number[] {
        const { dataModel } = this.props;
        const active = new Set(this.activeGroup());

        return dataModel.tags.filter((tag) => {
            return active.has(tag.id) && tag.assignable;
        }).map((tag) => {
            return tag.id;
        });
    }

    /**
     * @returns The tag ids of the active AND group, which the selector edits.
     */
    private activeGroup(): number[] {
        const { combination } = this.state;

        return combination.groups[0] ?? [];
    }

    /**
     * @returns The completions the selector offers: every usable tag, with its owner so same-named tags can be told
     * apart.
     */
    private tagCompletions(): ITagCompletion[] {
        const { dataModel } = this.props;

        return dataModel.tags.map((tag) => {
            return {
                caption: tag.name,
                tagId: tag.id,
                owner: tag.groupName ?? globalTagOwnerCaption,
            };
        });
    }

    /**
     * @returns The scores of the current list in the order the user picked.
     */
    private orderedScores(): ISbDmScore[] {
        const { dataModel } = this.props;
        const { sortOrder } = this.state;

        return arrangeScores(dataModel.scores, sortOrder);
    }

    /**
     * Applies a combination: the selector shows it and the list is rebuilt from the backend.
     *
     * @param combination The combination to apply.
     */
    private async applyCombination(combination: ITagCombination): Promise<void> {
        const { dataModel } = this.props;

        const normalized = TagCombination.normalize(combination);

        this.setState({ combination: normalized });
        await dataModel.queryScores(normalized);
    }

    /**
     * @param action The action to run.
     * @param score The score it applies to, if it needs one.
     * @param tagIds For a new score, the tags it starts with.
     *
     * @returns Whether the app handled the action.
     */
    private async runAction(action: string, score?: ISbDmScore, tagIds?: number[]): Promise<boolean> {
        const { onAction } = this.props;

        return await onAction?.(action, score, tagIds) ?? false;
    }

    private selectRow(scoreId: number): void {
        const tree = this.scoreTableRef.current;

        tree?.deselectRow();

        const rows = tree?.searchAllRows("id", scoreId);
        if (rows && rows.length > 0) {
            tree?.selectRow(rows);
        }
    }

    private reformatRows(): void {
        const rows = this.scoreTableRef.current?.getRows();

        rows?.forEach((row) => {
            row.reformat();
        });
    }
}
