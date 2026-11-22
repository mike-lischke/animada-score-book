/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { TagInput, type ITag, type ITagCompletion } from "../components/ui/framework/TagInput.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { NameText } from "../core/NameText.js";
import {
    ScoreBookChangeReason, type ISbDmScore, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";
import { TagCombination } from "../core/TagCombination.js";
import { ScoreListSortOrder } from "../core/types/general.js";
import { globalTagOwnerCaption, SystemTagKind, type ITagCombination } from "../core/types/tags.js";
import { ScoreCard } from "./ScoreCard.js";
import { TagBadges } from "./TagBadges.js";
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

interface IScoreLibraryState {
    currentSettings: IUISettings;
    sortOrder: ScoreListSortOrder;

    /** The tag combination the selector edits and the list was queried with. */
    combination: ITagCombination;

    /** The scores of the current combination, in the order the overview shows them. */
    scores: ISbDmScore[];

    /** The scores whose lineup is open. The ids survive list updates as long as the score stays in it. */
    expandedScoreIds: Set<number>;
}

/**
 * The overview of the scores: the scores of the current tag combination as cards, with a selector that builds that
 * combination. Opening a card's title loads the score into the player/editor. The overview shows in a modal dialog,
 * which the app opens and closes through the `open` property.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    private dialogRef = createRef<Dialog | null>();

    public constructor(props: IScoreLibraryProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const sortOrder = settings.scoreListSortOrder ?? ScoreListSortOrder.NameAscending;

        this.state = {
            currentSettings: settings,
            sortOrder,
            combination: TagCombination.empty,
            scores: arrangeScores(props.dataModel.scores, sortOrder),
            expandedScoreIds: new Set(),
        };
    }

    public override componentDidMount(): void {
        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("permChanged", this.handlePermChanged);
        requisitions.register("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.register("tagsChanged", this.handleTagsChanged);
        requisitions.register("scoreTagsChanged", this.handleScoreTagsChanged);
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
        }
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("permChanged", this.handlePermChanged);
        requisitions.unregister("scoreEntryUpdated", this.handleScoreEntryUpdated);
        requisitions.unregister("tagsChanged", this.handleTagsChanged);
        requisitions.unregister("scoreTagsChanged", this.handleScoreTagsChanged);
        requisitions.unregister("authChanged", this.handleAuthChanged);
    }

    public render(): ComponentChild {
        const header = this.renderHeader();
        const selector = this.renderSelector();
        const sortSelector = this.renderSortSelector();
        const list = this.renderList();
        const favourites = this.renderFavourites();

        return (
            <Dialog
                id="scoreLibraryDialog"
                ref={this.dialogRef}
                className="score-library-dialog"
                ariaLabel="Score Library"
                closeOnBackdropClick={true}
                onClose={this.handleDialogClose}
            >
                <Container id="libraryPaneContent" orientation={Orientation.TopDown}>
                    {header}
                    {selector}
                    {sortSelector}
                    {list}
                    {favourites}
                </Container>
            </Dialog>
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
                <Button id="scoreListClose" imageOnly title="Close Score Library" onClick={this.handleCloseClick}>
                    <Icon src={UIIcon.Close} />
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
            content = this.renderCards();
        }

        return (
            <Container id="scoreCardsHost" className="score-card-list" orientation={Orientation.TopDown}>
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

    private renderCards(): ComponentChild {
        const { dataModel } = this.props;
        const { scores, currentSettings, expandedScoreIds } = this.state;
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
                    expanded={expandedScoreIds.has(score.id)}
                    isAdmin={isAdmin}
                    showPermission={showPermission}
                    onToggleLineup={this.handleToggleLineup}
                    onOpen={this.handleOpenScore}
                    onAction={this.handleCardAction}
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
        const { combination } = this.state;

        // Write access, readable scores and the usable catalogue all belong to the session, so the list is queried
        // again when another account takes over.
        void this.applyCombination(combination);

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
        const { combination } = this.state;

        // A tag change can move a score in or out of the current filter, so the list is queried again.
        void this.applyCombination(combination);

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

    private handleCloseClick = (): void => {
        this.dialogRef.current?.close(true);
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
            // An instrument tag follows the tracks the new score starts with, so it is never assigned by hand.
            return active.has(tag.id) && tag.assignable && tag.systemKind !== SystemTagKind.Instrument;
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
}
