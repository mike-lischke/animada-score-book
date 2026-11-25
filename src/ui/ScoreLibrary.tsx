/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { ProgressIndicator } from "../components/ui/framework/ProgressIndicator.js";
import type { ITag, ITagCompletion } from "../components/ui/framework/TagInput.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import type { ISetListInfo } from "../core/DatabaseTypes.js";
import { NameText } from "../core/NameText.js";
import {
    ScoreBookChangeReason, ScoreQueryResult, type ISbDmScore, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";
import { TagCombination } from "../core/TagCombination.js";
import { ScoreListSortOrder } from "../core/types/general.js";
import { globalTagOwnerCaption, SystemTagKind, type ITagCombination } from "../core/types/tags.js";
import { ScoreCard } from "./ScoreCard.js";
import { SetListBar } from "./SetListBar.js";
import { SetListDialog } from "./SetListDialog.js";
import { TagBadges } from "./TagBadges.js";
import { TagFilterBar, type IFilterGroup } from "./TagFilterBar.js";
import { requisitions } from "../supplement/Requisitions.js";
import { NotificationCenter } from "../components/ui/NotificationCenter/NotificationCenter.js";

/** The sort choices of the score overview, with an icon and a tooltip for each order. */
const sortChoices = new Map<ScoreListSortOrder, { label: string; icon: UIIcon; }>([
    [ScoreListSortOrder.NameAscending, { label: "Name A–Z", icon: UIIcon.SortAlphabeticalAscending }],
    [ScoreListSortOrder.NameDescending, { label: "Name Z–A", icon: UIIcon.SortAlphabeticalDescending }],
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

    /** Whether the library shows as a modal dialog. The component itself stays mounted while it is closed. */
    open: boolean;

    /** Called when the user closes the dialog (Escape, backdrop click or the close button). */
    onClose?: () => void;

    /**
     * Runs a score action; the app owns the dialogs and the data model.
     *
     * @param action One of load, copyUrl, remove, managePerm, import and new.
     * @param score The score the action applies to, or undefined when it needs none.
     * @param tagIds For a new score, the tags of the active AND group that the score starts with.
     */
    onAction?: (action: string, score?: ISbDmScore, tagIds?: number[]) => Promise<boolean>;
}

/** What the collection is currently showing. */
enum ScoreListState {
    /** A query is running. */
    Loading,

    /** The cards of the current filter. */
    Ready,

    /** The filter names tags the caller cannot use, so no list is shown instead of a wider one. */
    InvalidFilter,

    /** The last query could not be answered. */
    Failed,

    /** The selected set list was deleted or left the caller's reach while it was active. */
    SetListUnavailable,
}

interface IScoreLibraryState {
    currentSettings: IUISettings;
    sortOrder: ScoreListSortOrder;

    /**
     * The AND groups of the manual tag filter, as the user edits them. It is kept apart from anything a set list
     * contributes later, so selecting a set list never overwrites what the user picked here. An empty trailing group
     * is a row the user just added and has not filled yet.
     */
    manualFilter: number[][];

    listState: ScoreListState;

    /** The filter tag ids the backend could not use, reported with the invalid filter. */
    ignoredTagIds: number[];

    /** The scores of the current filter, in the order the overview shows them. */
    scores: ISbDmScore[];

    /** The scores whose lineup is open. The ids survive list updates as long as the score stays in it. */
    expandedScoreIds: Set<number>;

    /** The card whose tags are being edited, if any. Tags stay read-only until a card's edit mode is switched on. */
    editingScoreId?: number;

    /** The set lists the caller may select, as the data model last read them. */
    setLists: readonly ISetListInfo[];

    /** The selected set list, or undefined for All Scores. */
    activeSetListId?: number;

    /** Whether the set-list editor is open. */
    setListDialogOpen: boolean;

    /** A note about the set-list selection, for example that the selected list disappeared. */
    setListNotice?: string;
}

/**
 * The overview of the scores: the scores of the manual tag filter as cards, with a filter bar that builds that
 * filter. Opening a card's title loads the score into the player/editor. The overview shows in a modal dialog, which
 * the app opens and closes through the `open` property.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    /** How long a query may run before the list says it is loading, so a quick answer does not flash a spinner. */
    private static readonly loadingDelay = 500;

    private dialogRef = createRef<Dialog | null>();

    /** Counts the filter requests, so an answer to an older one cannot replace what a newer one showed. */
    private filterRequest = 0;

    /** The pending delay after which the list names a running query, if it has not answered by then. */
    private loadingTimer?: ReturnType<typeof setTimeout>;

    public constructor(props: IScoreLibraryProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const sortOrder = settings.scoreListSortOrder ?? ScoreListSortOrder.NameAscending;

        this.state = {
            currentSettings: settings,
            sortOrder,
            manualFilter: [],
            listState: ScoreListState.Ready,
            ignoredTagIds: [],
            scores: arrangeScores(props.dataModel.scores, sortOrder),
            expandedScoreIds: new Set(),
            editingScoreId: undefined,
            setLists: [...props.dataModel.setLists],
            setListDialogOpen: false,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("permChanged", this.handlePermChanged);
        requisitions.register("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.register("tagsChanged", this.handleTagsChanged);
        requisitions.register("scoreTagsChanged", this.handleScoreTagsChanged);
        requisitions.register("setListsChanged", this.handleSetListsChanged);
        requisitions.register("authChanged", this.handleAuthChanged);

        if (this.props.open) {
            this.dialogRef.current?.open();
        }
    }

    public override componentDidUpdate(previousProperties: IScoreLibraryProperties): void {
        const { open } = this.props;

        if (open === previousProperties.open) {
            return;
        }

        if (open) {
            this.dialogRef.current?.open();
        } else {
            this.dialogRef.current?.close(true);

            // A closed library leaves no card in edit mode, so reopening it starts with read-only tags.
            this.setState({ editingScoreId: undefined });
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("permChanged", this.handlePermChanged);
        requisitions.unregister("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.unregister("tagsChanged", this.handleTagsChanged);
        requisitions.unregister("scoreTagsChanged", this.handleScoreTagsChanged);
        requisitions.unregister("setListsChanged", this.handleSetListsChanged);
        requisitions.unregister("authChanged", this.handleAuthChanged);

        this.stopLoadingTimer();
    }

    public render(): ComponentChild {
        const header = this.renderHeader();
        const filter = this.renderFilter();
        const setListBar = this.renderSetListBar();
        const sortSelector = this.state.activeSetListId === undefined
            ? this.renderSortSelector()
            : this.renderSavedOrderNote();
        const list = this.renderList();
        const favourites = this.renderFavourites();
        const setListDialog = this.renderSetListDialog();

        return (
            <>
                <Dialog
                    id="scoreLibraryDialog"
                    ref={this.dialogRef}
                    className="score-library-dialog"
                    ariaLabel="Scores and Repertoires"
                    closeOnBackdropClick={true}
                    onClose={this.handleDialogClose}
                >
                    <Container id="libraryPaneContent" orientation={Orientation.TopDown}>
                        {header}
                        {filter}
                        {setListBar}
                        {sortSelector}
                        {list}
                        {favourites}
                    </Container>
                </Dialog>
                {setListDialog}
            </>
        );
    }

    private renderSetListBar(): ComponentChild {
        const { dataModel } = this.props;
        const { setLists, activeSetListId, setListNotice } = this.state;
        const canManage = dataModel.tagOwnerScopes.length > 0 || setLists.length > 0;

        let notice: ComponentChild = undefined;
        if (setListNotice !== undefined) {
            notice = <Label id="setListNotice" className="set-list-notice" caption={setListNotice} wrap={true} />;
        }

        return (
            <Container className="set-list-section" orientation={Orientation.TopDown}>
                <SetListBar
                    lists={setLists}
                    activeId={activeSetListId}
                    allScoresCount={dataModel.readableScoreCount}
                    canManage={canManage}
                    onSelect={this.handleSetListSelect}
                    onManage={this.handleManageSetLists}
                />
                {notice}
            </Container>
        );
    }

    private renderSavedOrderNote(): ComponentChild {
        return (
            <Container className="score-library-sort" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Label caption="Order: saved order of the set list" />
            </Container>
        );
    }

    private renderSetListDialog(): ComponentChild {
        const { dataModel } = this.props;
        const { setLists, activeSetListId, setListDialogOpen } = this.state;

        return (
            <SetListDialog
                dataModel={dataModel}
                lists={setLists}
                activeId={activeSetListId}
                open={setListDialogOpen}
                onClose={this.handleSetListDialogClose}
                onSelect={this.handleSetListSelect}
            />
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
                <Label heading={true}>Scores and Repertoires</Label>
                {actions}
            </Container>
        );
    }

    private renderFilter(): ComponentChild {
        const { listState, scores } = this.state;

        const groups = this.filterGroups();
        const hasFilter = this.effectiveCombination().groups.length > 0;

        return (
            <TagFilterBar
                groups={groups}
                completions={this.tagCompletions()}
                scoreCount={listState === ScoreListState.Ready ? scores.length : undefined}
                countLoading={listState === ScoreListState.Loading}
                hasFilter={hasFilter}
                onAddTag={this.handleFilterTagAdd}
                onRemoveTag={this.handleFilterTagRemove}
                onAddGroup={this.handleFilterGroupAdd}
                onRemoveGroup={this.handleFilterGroupRemove}
                onReset={this.handleFilterReset}
            />
        );
    }

    /**
     * @returns The filter rows as the bar shows them, each with its badges and the names of the ids the catalogue no
     * longer holds. A missing id keeps its place, so the filter is reported instead of quietly narrowed.
     */
    private filterGroups(): IFilterGroup[] {
        const { dataModel } = this.props;
        const { manualFilter } = this.state;

        return manualFilter.map((group) => {
            const tags = TagBadges.resolve(group, dataModel.tags);

            return {
                tags,
                unavailableNames: group.filter((tagId) => {
                    return !dataModel.tags.some((tag) => {
                        return tag.id === tagId;
                    });
                }).map((tagId) => {
                    return `#${tagId}`;
                }),
            };
        });
    }

    private renderSortSelector(): ComponentChild {
        const { sortOrder } = this.state;

        const buttons = [...sortChoices].map(([order, option]) => {
            const selected = order === sortOrder;

            return (
                <Button key={order} className="du-join-item du-btn-square du-btn-sm" isDefault={selected}
                    aria-pressed={selected} title={option.label}
                    onClick={() => {
                        this.handleSortOrderChange(order);
                    }}>
                    <Icon src={option.icon} />
                </Button>
            );
        });

        return (
            <Container className="score-library-sort" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Label caption="Sort:" />
                <Container id="scoreListSortOrder" className="du-join"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    {buttons}
                </Container>
            </Container>
        );
    }

    private renderList(): ComponentChild {
        const { listState } = this.state;

        let content: ComponentChild;
        switch (listState) {
            case ScoreListState.Loading: {
                content = this.renderLoadingState();

                break;
            }

            case ScoreListState.Failed: {
                content = this.renderFailedState();

                break;
            }

            case ScoreListState.InvalidFilter: {
                content = this.renderInvalidFilterState();

                break;
            }

            case ScoreListState.Ready: {
                content = this.state.scores.length === 0 ? this.renderEmptyState() : this.renderCards();

                break;
            }
        }

        return (
            <Container id="scoreCardsHost" className="score-card-list" orientation={Orientation.TopDown}>
                {content}
            </Container>
        );
    }

    private renderLoadingState(): ComponentChild {
        return (
            <Container id="scoreListLoading" className="score-list-loading" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <ProgressIndicator />
                <Label caption="Loading the scores…" />
            </Container>
        );
    }

    private renderFailedState(): ComponentChild {
        return (
            <Container id="scoreListFailed" className="score-list-problem" orientation={Orientation.TopDown}>
                <Label caption="The scores could not be loaded." wrap={true} />
                <Button id="scoreListRetry" className="score-filter-reset" plain={true} title="Load the scores again"
                    onClick={this.handleFilterRetry}>
                    <Icon src={UIIcon.Refresh} />
                    <span>Try again</span>
                </Button>
            </Container>
        );
    }

    private renderInvalidFilterState(): ComponentChild {
        const { dataModel } = this.props;
        const { ignoredTagIds } = this.state;
        const names = ignoredTagIds.map((tagId) => {
            const tag = dataModel.tags.find((candidate) => {
                return candidate.id === tagId;
            });

            // An id without a known tag is named as such: the tag may have been deleted or left the caller's scope.
            return tag?.name ?? `#${tagId}`;
        });

        let caption = "The filter names tags that are not available.";
        if (names.length > 0) {
            caption = `The filter names tags that are not available: ${names.join(", ")}.`;
        }

        return (
            <Container id="scoreListInvalidFilter" className="score-list-problem" orientation={Orientation.TopDown}>
                <Label caption={caption} wrap={true} />
                <Label caption="Remove them or reset the filter to see the scores again." wrap={true} />
                <Button id="scoreListResetInvalid" className="score-filter-reset" plain={true}
                    title="Remove the unavailable tags" onClick={this.handleFilterReset}>
                    <Icon src={UIIcon.ClearAll} />
                    <span>Reset filter</span>
                </Button>
            </Container>
        );
    }

    private renderEmptyState(): ComponentChild {
        const { activeSetListId } = this.state;
        const hasFilter = !TagCombination.isEmpty(this.effectiveCombination());

        let caption = "No score matches the selected tags.";
        if (activeSetListId !== undefined) {
            caption = hasFilter
                ? "No score in this set list matches the selected tags."
                : "This set list holds no scores you can read.";
        } else if (!hasFilter) {
            caption = "The library holds no scores yet.";
        }

        return <Label className="score-list-empty" caption={caption} wrap />;
    }

    private renderCards(): ComponentChild {
        const { dataModel } = this.props;
        const { scores, currentSettings, expandedScoreIds, editingScoreId } = this.state;
        const isAdmin = dataModel.user?.isAdmin ?? false;
        const showPermission = currentSettings.showPermMatrix ?? true;
        const canEditTags = this.canEditTags();

        return scores.map((score, index) => {
            return (
                <ScoreCard
                    key={score.id}
                    score={score}
                    position={index + 1}
                    instruments={dataModel.instruments}
                    tagChips={this.tagChips(score)}
                    tagCompletions={this.assignableCompletions(score)}
                    canEditTags={canEditTags}
                    editing={editingScoreId === score.id}
                    expanded={expandedScoreIds.has(score.id)}
                    isAdmin={isAdmin}
                    showPermission={showPermission}
                    onToggleLineup={this.handleToggleLineup}
                    onOpen={this.handleOpenScore}
                    onAction={this.handleCardAction}
                    onToggleEdit={this.handleToggleCardEdit}
                    onTagAdd={this.handleCardTagAdd}
                    onTagRemove={this.handleCardTagRemove}
                />
            );
        });
    }

    /**
     * @param score The score whose chips are built.
     *
     * @returns The user tags of the score the active account may see. A tag of a scope the caller does not manage
     * stays locked, because the tag belongs to its scope, not to the score.
     */
    private tagChips(score: ISbDmScore): ITag[] {
        const { dataModel } = this.props;
        const editable = new Map(dataModel.tags.map((tag) => {
            return [tag.id, tag.editable] as [number, boolean];
        }));

        return TagBadges.userTags(score.tagIds, dataModel.tags).map((chip) => {
            return editable.get(chip.id) === true ? chip : { ...chip, locked: true };
        });
    }

    /**
     * @param score The score whose card offers the completions.
     *
     * @returns The tags of the active account that may be put on that score: the ones of a scope the caller manages,
     * without instrument tags, which follow the score's tracks, and without the tags it already carries.
     */
    private assignableCompletions(score: ISbDmScore): ITagCompletion[] {
        const { dataModel } = this.props;
        const assigned = new Set(score.tagIds);

        return dataModel.tags.filter((tag) => {
            return tag.assignable && tag.systemKind !== SystemTagKind.Instrument && !assigned.has(tag.id);
        }).map((tag) => {
            return {
                caption: tag.name,
                tagId: tag.id,
                owner: tag.groupName ?? globalTagOwnerCaption,
            };
        });
    }

    /**
     * @returns Whether the active account manages at least one tag, which is what makes the card's tags editable.
     */
    private canEditTags(): boolean {
        const { dataModel } = this.props;

        return dataModel.tags.some((tag) => {
            return tag.assignable && tag.systemKind !== SystemTagKind.Instrument;
        });
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

    private handleToggleLineup = (score: ISbDmScore): void => {
        const next = new Set(this.state.expandedScoreIds);
        if (next.has(score.id)) {
            next.delete(score.id);
        } else {
            next.add(score.id);
        }

        this.setState({ expandedScoreIds: next });
    };

    private handleOpenScore = (score: ISbDmScore): void => {
        void this.runAction("load", score);
    };

    /**
     * Switches one card's tag editing on, or off again. Only one card is in edit mode at a time, so the coloured dot
     * always names the card whose tags can be changed right now.
     *
     * @param score The card whose edit mode is toggled.
     */
    private handleToggleCardEdit = (score: ISbDmScore): void => {
        const { editingScoreId } = this.state;

        this.setState({ editingScoreId: editingScoreId === score.id ? undefined : score.id });
    };

    private handleCardAction = (id: string, score: ISbDmScore): void => {
        if (id === "copyUrl") {
            const url = `${window.location.origin}${import.meta.env.BASE_URL}?score=${score.id}`;
            void navigator.clipboard.writeText(url);
            void NotificationCenter.showInfo("Score URL copied to clipboard.");

            return;
        }

        void this.runAction(id, score);
    };

    private handleCardTagAdd = (score: ISbDmScore, tagId: number): void => {
        const { dataModel } = this.props;

        void dataModel.assignTag(score.id, tagId);
    };

    private handleCardTagRemove = (score: ISbDmScore, tagId: number): void => {
        const { dataModel } = this.props;

        void dataModel.unassignTag(score.id, tagId);
    };

    private handleAuthChanged = (): Promise<boolean> => {
        // Write access, readable scores and the usable catalogue all belong to the session, so the list is queried
        // again when another account takes over. The filter stays; tags it may no longer use are reported.
        void this.applyFilter();

        return Promise.resolve(true);
    };

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        this.setState({ currentSettings: settings });

        return Promise.resolve(true);
    };

    private handleScoreBookLoaded = (reason: ScoreBookChangeReason): Promise<boolean> => {
        // Loading a score or renaming one leaves the list as it is; only a different set of scores is replaced.
        if (reason === ScoreBookChangeReason.EntryDeleted
            || reason === ScoreBookChangeReason.LibraryRefreshed) {
            const scores = this.orderedScores();
            const editingScoreId = this.state.editingScoreId;
            const stillVisible = scores.some((score) => {
                return score.id === editingScoreId;
            });

            this.setState({ scores, editingScoreId: stillVisible ? editingScoreId : undefined });
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
        // A tag change can move a score in or out of the current filter, so the list is queried again.
        void this.applyFilter();

        return Promise.resolve(true);
    };

    private handleSetListsChanged = (): Promise<boolean> => {
        const { dataModel } = this.props;
        const lists = dataModel.setLists;
        const activeId = this.state.activeSetListId;
        const stillVisible = activeId === undefined || lists.some((list) => {
            return list.id === activeId;
        });

        if (!stillVisible) {
            // The selected list was deleted or left the caller's reach; the notice is set by the query that found
            // out. Falling back to All Scores keeps the collection usable.
            this.setState({ setLists: lists, activeSetListId: undefined });
            void this.queryList(this.state.manualFilter, undefined);

            return Promise.resolve(true);
        }

        this.setState({ setLists: lists });

        return Promise.resolve(true);
    };

    private handleSetListSelect = (id?: number): void => {
        if (id === this.state.activeSetListId) {
            return;
        }

        this.setState({ activeSetListId: id, setListNotice: undefined });
        void this.queryList(this.state.manualFilter, id);
    };

    private handleManageSetLists = (): void => {
        this.setState({ setListDialogOpen: true });
    };

    private handleSetListDialogClose = (): void => {
        this.setState({ setListDialogOpen: false });
    };

    private handleTagsChanged = (): Promise<boolean> => {
        // A deleted tag stays in the filter and is reported: dropping it would answer a wider question than the user
        // asked. Everything else keeps the list it had.
        void this.applyFilter();

        return Promise.resolve(true);
    };

    private handleNewScoreClick = (): void => {
        void this.runAction("new", undefined, this.assignableTagIds());
    };

    private handleImportClick = (): void => {
        void this.runAction("import");
    };

    /**
     * Runs when the dialog closed itself, which Escape and a click beside it do. A close the app requested is
     * already known there, so only a self-close is reported.
     */
    private handleDialogClose = (): void => {
        const { open, onClose } = this.props;

        if (open) {
            onClose?.();
        }
    };

    private handleFilterTagAdd = (groupIndex: number, tagId: number): void => {
        const { manualFilter } = this.state;

        // The first row exists in the UI before the filter holds it, so a row may have to be created here.
        const groups: number[][] = manualFilter.map((group) => {
            return [...group];
        });
        while (groups.length <= groupIndex) {
            groups.push([]);
        }

        groups[groupIndex] = Array.from(new Set([...groups[groupIndex], tagId]));

        void this.setManualFilter(groups);
    };

    private handleFilterTagRemove = (groupIndex: number, tagId: number): void => {
        const { manualFilter } = this.state;
        const groups = manualFilter.map((group, index) => {
            return index === groupIndex ? group.filter((id) => {
                return id !== tagId;
            }) : group;
        });

        void this.setManualFilter(groups);
    };

    private handleFilterGroupAdd = (groupIndex: number): void => {
        const { manualFilter } = this.state;

        // The new row goes below the one whose button was pressed; it starts empty.
        const groups: number[][] = manualFilter.map((group) => {
            return [...group];
        });
        while (groups.length <= groupIndex) {
            groups.push([]);
        }

        groups.splice(groupIndex + 1, 0, []);

        void this.setManualFilter(groups);
    };

    private handleFilterGroupRemove = (groupIndex: number): void => {
        const { manualFilter } = this.state;

        // One row always stays, so there is always a field to pick a tag in.
        if (manualFilter.length <= 1) {
            return;
        }

        void this.setManualFilter(manualFilter.filter((group, index) => {
            return index !== groupIndex;
        }));
    };

    private handleFilterReset = (): void => {
        void this.setManualFilter([]);
    };

    private handleFilterRetry = (): void => {
        void this.applyFilter();
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
        const active = new Set(this.effectiveCombination().groups[0] ?? []);

        return dataModel.tags.filter((tag) => {
            // An instrument tag follows the tracks the new score starts with, so it is never assigned by hand.
            return active.has(tag.id) && tag.assignable && tag.systemKind !== SystemTagKind.Instrument;
        }).map((tag) => {
            return tag.id;
        });
    }

    /**
     * @param groups The AND groups a combination is built from; the manual filter by default.
     *
     * @returns The combination the collection queries with. The manual filter stands on its own here; a set list
     * adds a further AND restriction on top of it instead of replacing it.
     */
    private effectiveCombination(groups: number[][] = this.state.manualFilter): ITagCombination {
        return TagCombination.normalize({ groups });
    }

    /**
     * @param groups The AND groups the manual filter now holds.
     *
     * @returns The filter applied, once the list the filter produces is known.
     */
    private async setManualFilter(groups: number[][]): Promise<void> {
        this.setState({ manualFilter: groups });

        // The query is started with the groups at hand: a state update is applied later, so the filter the list is
        // built for would otherwise still be the previous one.
        await this.applyFilter(groups);
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
        const { sortOrder, activeSetListId } = this.state;

        // A set list carries its own saved order, which the backend already applied.
        if (activeSetListId !== undefined) {
            return [...dataModel.scores];
        }

        return arrangeScores(dataModel.scores, sortOrder);
    }

    /**
     * Queries the list for the current filter and set-list selection. A filter that names tags the catalogue does
     * not hold is reported without a query, so its wider answer never reaches the screen.
     *
     * @param groups The AND groups of the manual filter.
     * @param setListId The set list to restrict the list to, or undefined for all readable scores.
     */
    private async queryList(groups: number[][], setListId: number | undefined): Promise<void> {
        const { dataModel } = this.props;
        const request = ++this.filterRequest;
        const combination = this.effectiveCombination(groups);

        this.stopLoadingTimer();

        const unavailable = this.unavailableTagIds(combination);
        if (unavailable.length > 0) {
            this.setState({ listState: ScoreListState.InvalidFilter, ignoredTagIds: unavailable });

            return;
        }

        // The filter is usable again, so a report about unavailable tags would be stale while the query runs. The
        // list keeps showing what it had, and only a query that takes noticeably long is named as loading.
        if (this.state.listState === ScoreListState.InvalidFilter) {
            this.setState({ listState: ScoreListState.Ready, ignoredTagIds: [] });
        }

        this.loadingTimer = setTimeout(() => {
            this.loadingTimer = undefined;

            if (request === this.filterRequest) {
                this.setState({ listState: ScoreListState.Loading, ignoredTagIds: [] });
            }
        }, ScoreLibrary.loadingDelay);

        const outcome = setListId === undefined
            ? await dataModel.queryScores(combination)
            : await dataModel.queryScores(combination, setListId);

        // A newer filter was applied while this answer was on its way, and that filter is the one the user asked for.
        if (request !== this.filterRequest) {
            return;
        }

        this.stopLoadingTimer();

        switch (outcome.result) {
            case ScoreQueryResult.Applied: {
                this.setState({
                    listState: ScoreListState.Ready,
                    ignoredTagIds: [],
                    scores: this.orderedScores(),
                });

                break;
            }

            case ScoreQueryResult.InvalidFilter: {
                this.setState({
                    listState: ScoreListState.InvalidFilter,
                    ignoredTagIds: outcome.ignoredTagIds,
                });

                break;
            }

            case ScoreQueryResult.SetListUnavailable: {
                // The list was deleted or left the caller's reach. All scores are shown again, with a note that
                // names what happened instead of silently widening the list.
                this.setState({
                    activeSetListId: undefined,
                    setListNotice: "The selected set list is no longer available. All scores are shown again.",
                });

                void this.queryList(groups, undefined);

                break;
            }

            case ScoreQueryResult.Failed: {
                this.setState({ listState: ScoreListState.Failed, ignoredTagIds: [] });

                break;
            }

            case ScoreQueryResult.Superseded: {
                // A newer filter is already on its way, and its answer is the one that counts.
                break;
            }
        }
    }

    /**
     * Queries the list for the manual filter and the current set-list selection.
     *
     * @param groups The AND groups of the manual filter; the current filter by default.
     */
    private async applyFilter(groups: number[][] = this.state.manualFilter): Promise<void> {
        await this.queryList(groups, this.state.activeSetListId);
    }

    /** Cancels a pending delay that would announce a running query, which an answer makes pointless. */
    private stopLoadingTimer(): void {
        if (this.loadingTimer !== undefined) {
            clearTimeout(this.loadingTimer);
            this.loadingTimer = undefined;
        }
    }

    /**
     * @param combination The combination to inspect.
     *
     * @returns The ids it names that the usable catalogue does not hold.
     */
    private unavailableTagIds(combination: ITagCombination): number[] {
        const { dataModel } = this.props;
        const usable = new Set(dataModel.tags.map((tag) => {
            return tag.id;
        }));

        return combination.groups.flat().filter((tagId) => {
            return !usable.has(tagId);
        });
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
}
