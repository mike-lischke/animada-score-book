/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, render, type ComponentChild } from "preact";

import type { CellComponent, ColumnDefinition, RowComponent } from "tabulator-tables";
import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Loading, LoadingSize, LoadingStyle } from "../components/ui/framework/Loading.js";
import { SetDataAction, TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import { Arrangement } from "../core/Arrangement.js";
import {
    SbDmEntityType, type ISbDmScore, type ISbDmScoreFolder, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";
import { getSerialisedArrangementFromParams } from "../core/serialisation/url.js";

export interface IScoreLibraryProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    onAction?: (action: string, dataModelEntry?: ISbDmScoreFolder | ISbDmScore,
        parent?: ISbDmScoreFolder) => Promise<boolean>;
}

interface IScoreLibraryState {
    /** The URL of an audio or video file. */
    url?: string;

    currentScore?: ISbDmScore;
}

/**
 * A component to manage a tree of scored from the server.
 * The user can select one score to load it into the player/editor.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    private scoreTableRef = createRef<TreeGrid>();

    public constructor(props: IScoreLibraryProperties) {
        super(props);
        this.state = {};
    }

    public render(): ComponentChild {
        const { dataModel } = this.props;

        const scoreTreeColumns: ColumnDefinition[] = [{
            title: "",
            field: "name",
            resizable: false,
            hozAlign: "left",
            formatter: this.scoreTreeCellFormatter,
        }];

        const scoreTreeOptions: ITreeGridOptions = {
            treeColumn: "name",
            selectionType: SelectionType.Single,
            showHeader: false,
            layout: "fitColumns",
            horizontalGridLines: false,
            verticalGridLines: false,
            rowHeight: 36,
        };

        const scores = dataModel.scoreLib;

        return (
            <Container
                id="libraryPaneContent"
                orientation={Orientation.TopDown}
                style={{ flex: "1 1 auto" }}
            >
                <Container
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    style={{ marginBottom: "8px" }}
                >
                    <Icon src={Codicon.Library} style={{ fontSize: "40px", color: "var(--color-primary)" }} />
                    <Label heading={true} style={{ marginLeft: "16px" }}>Score Library</Label>
                    <Button
                        imageOnly={true}
                        style={{ marginLeft: "auto" }}
                        title="Add New Folder"
                        onClick={(e) => {
                            this.handleActionClick(e, "addFolder");
                        }}
                    >
                        <Icon src={Codicon.NewFolder} />
                    </Button>
                </Container>
                <Container
                    id="scoreTreeHost"
                    orientation={Orientation.TopDown}
                    style={{ flex: 1, height: "100%" }}
                >
                    <TreeGrid
                        ref={this.scoreTableRef}
                        options={scoreTreeOptions}
                        columns={scoreTreeColumns}
                        tableData={scores}

                        onRowSelected={this.handleScoreTreeRowSelected}
                        onRowExpanded={this.handleScoreTreeRowExpanded}
                        onRowCollapsed={this.handleScoreTreeRowCollapsed}
                        isRowExpanded={this.isScoreTreeRowExpanded}
                        onRowContext={this.handleScoreTreeRowContext}
                    />
                </Container>
            </Container>
        );
    }

    private scoreTreeCellFormatter = (cell: CellComponent): string | HTMLElement => {
        const row = cell.getRow();
        const data = cell.getData() as ISbDmScoreFolder | ISbDmScore;

        const host = document.createElement("div");
        host.className = "scoreTreeEntry";

        let actionBox;
        let icon: ComponentChild;

        if (data.state.loading) {
            icon = <Loading
                loadingStyle={LoadingStyle.Dots}
                size={LoadingSize.Medium}
                style={{ marginRight: "5px" }}
            />;
        } else {
            let iconClass = "";
            let iconSrc: Codicon;
            if (data.type === SbDmEntityType.ScoreFolder) {
                // Use the row's expanded state to determine the icon. Our internal state is not updated yet.
                iconSrc = row.isTreeExpanded() ? Codicon.FolderOpened : Codicon.Folder;

                const importScoreButton = <Button
                    id="importScoreButton"
                    className="actionButton"
                    data-tooltip="Import Banandrum Score into Folder"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "import", undefined, data);
                    }}
                >
                    <Icon src={Codicon.CloudDownload} data-tooltip="inherit" />
                </Button>;

                const addFolderButton = <Button
                    id="addFolderButton"
                    className="actionButton"
                    data-tooltip="Add New Sub Folder"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "addFolder", undefined, data);
                    }}
                >
                    <Icon src={Codicon.NewFolder} data-tooltip="inherit" />
                </Button>;

                const editButton = <Button
                    id="editButton"
                    className="actionButton"
                    data-tooltip="Rename Folder"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "edit", data);
                    }}
                >
                    <Icon src={Codicon.Edit} data-tooltip="inherit" />
                </Button>;

                const removeFolderButton = <Button
                    id="removeFolderButton"
                    className="actionButton"
                    data-tooltip="Remove Folder"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "remove", data);
                    }}
                >
                    <Icon src={Codicon.Trash} data-tooltip="inherit" />
                </Button>;

                actionBox = <Container className="actionBox" orientation={Orientation.LeftToRight}>
                    {importScoreButton}
                    {addFolderButton}
                    {editButton}
                    {removeFolderButton}
                </Container>;

            } else {
                iconSrc = Codicon.Music;
                iconClass = "score";

                const playButton = <Button
                    className="playButton actionButton"
                    data-tooltip="Load Score"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "load", data);
                    }}
                >
                    <Icon src={Codicon.Play} data-tooltip="inherit" />
                </Button>;

                const removeButton = <Button
                    className="removeButton actionButton"
                    data-tooltip="Remove Score"
                    imageOnly
                    onClick={(e) => {
                        this.handleActionClick(e, "remove", data);
                    }}
                >
                    <Icon src={Codicon.Trash} data-tooltip="inherit" />
                </Button>;

                actionBox = <Container className="actionBox" orientation={Orientation.LeftToRight}>
                    {playButton}
                    {removeButton}
                </Container>;
            }

            icon = <Icon src={iconSrc} className={iconClass + " scoreTreeIcon"} />;
        }

        const content = <>
            {icon}
            <Label caption={data.name} />
            {actionBox}
        </>;

        render(content, host);

        return host;
    };

    private handleActionClick = (e: MouseEvent | KeyboardEvent, action: string,
        data?: ISbDmScoreFolder | ISbDmScore, parent?: ISbDmScoreFolder): void => {
        const { onAction, dataModel } = this.props;

        e.stopPropagation();
        void onAction?.(action, data, parent).then((handled) => {
            if (handled) {
                const updateRowsById = (id: number, data: ISbDmScoreFolder | ISbDmScore): void => {
                    const tree = this.scoreTableRef.current;
                    const rows = tree?.searchAllRows("id", id);
                    rows?.forEach((row) => {
                        void row.update(data);
                    });
                };

                switch (action) {
                    case "addFolder": {
                        if (parent) {
                            updateRowsById(parent.id, parent);
                        } else {
                            const scores = dataModel.scoreLib;
                            const tree = this.scoreTableRef.current;
                            void tree?.setData(scores, SetDataAction.Replace);
                        }

                        break;
                    }

                    case "import": {
                        if (parent) {
                            updateRowsById(parent.id, parent);
                        }

                        break;
                    }

                    case "remove": {
                        const tree = this.scoreTableRef.current;
                        const scores = dataModel.scoreLib;
                        void tree?.setData(scores, SetDataAction.Replace);

                        this.setState({ currentScore: undefined });
                        break;
                    }

                    case "edit": {
                        const tree = this.scoreTableRef.current;
                        if (tree && data?.type === SbDmEntityType.ScoreFolder) {
                            updateRowsById(data.id, data);
                        }

                        break;
                    }

                    default:
                }
            }
        });

    };

    private handleScoreTreeRowSelected = (row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder | ISbDmScore;
        if (entry.type === SbDmEntityType.Score) {
            const params = new URLSearchParams(entry.content);
            const serialisedArrangement = getSerialisedArrangementFromParams(params);
            if (serialisedArrangement) {
                const { dataModel } = this.props;

                const instruments = dataModel.instruments;
                const arrangement = Arrangement.fromSerialized(serialisedArrangement, instruments);
                arrangement.title = entry.name;
                this.setState({ currentScore: entry });

                return;
            }
        }

        this.setState({ currentScore: undefined });
    };

    private handleScoreTreeRowExpanded = (row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder;
        entry.state.expanded = true;
        if (entry.state.expandedOnce) {
            return;
        }

        const timer = setTimeout(() => {
            entry.state.loading = true;
            row.reformat();
        }, 500);
        void entry.refresh?.().then(() => {
            clearTimeout(timer);
            entry.state.expandedOnce = true;
            entry.state.loading = false;

            // Force the table row to refresh.
            void row.update(entry);
            row.reformat();
        });
    };

    private handleScoreTreeRowCollapsed = (row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder;
        entry.state.expanded = false;
    };

    private handleScoreTreeRowContext = (event: Event, row: RowComponent): void => {
        //const entry = row.getData() as IScoreNode;
    };

    private isScoreTreeRowExpanded = (row: RowComponent): boolean => {
        const entry = row.getData() as ISbDmScoreFolder;

        return entry.state.expanded;
    };

};
