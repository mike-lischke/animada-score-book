/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, render, type ComponentChild } from "preact";

import type { CellComponent, ColumnDefinition, RowComponent } from "tabulator-tables";

import { Button } from "../components/ui/framework/Button.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Image, PredefinedImage } from "../components/ui/framework/Image.js";
import { Label } from "../components/ui/framework/Label.js";
import { Loading, LoadingSize, LoadingStyle } from "../components/ui/framework/Loading.js";
import { RadialMenu } from "../components/ui/framework/RadialMenu.js";
import { SetDataAction, TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import {
    SbDmEntityType, type ISbDmScore, type ISbDmScoreFolder, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";

export interface IScoreLibraryProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    onAction?: (action: string, dataModelEntry?: ISbDmScoreFolder | ISbDmScore,
        parent?: ISbDmScoreFolder) => Promise<boolean>;
}

interface IScoreLibraryState {
    /** The URL of an audio or video file. */
    url?: string;
}

/**
 * A component to manage a tree of scored from the server.
 * The user can select one score to load it into the player/editor.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    private scoreTableRef = createRef<TreeGrid>();
    private radialMenuRef = createRef<RadialMenu>();

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

                        onRowClick={this.handleScoreTreeRowClick}
                        onRowExpanded={this.handleScoreTreeRowExpanded}
                        onRowCollapsed={this.handleScoreTreeRowCollapsed}
                        isRowExpanded={this.isScoreTreeRowExpanded}
                        onRowContext={this.handleScoreTreeRowContext}
                    />
                </Container>
                <RadialMenu ref={this.radialMenuRef} />
            </Container>
        );
    }

    private scoreTreeCellFormatter = (cell: CellComponent): string | HTMLElement => {
        const row = cell.getRow();
        const data = cell.getData() as ISbDmScoreFolder | ISbDmScore;

        const host = document.createElement("div");
        host.className = "scoreTreeEntry";

        let icon: ComponentChild;
        const dropdownItems: IDropdownItem[] = [];

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

                dropdownItems.push(
                    {
                        label: "Import Score",
                        icon: <Icon src={Codicon.CloudDownload} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "import", undefined, data);
                        },
                    },
                    {
                        label: "Add New Sub Folder",
                        icon: <Icon src={Codicon.NewFolder} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "addFolder", undefined, data);
                        },
                    },
                    {
                        label: "Rename Folder",
                        icon: <Icon src={Codicon.Edit} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "edit", data);
                        },
                    },
                    {
                        label: "Remove Folder",
                        icon: <Icon src={Codicon.Trash} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "remove", data);
                        },
                    },
                );
            } else {
                iconSrc = Codicon.Music;
                iconClass = "score";

                dropdownItems.push(
                    {
                        label: "Load Score",
                        icon: <Image src={PredefinedImage.PlayImage} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "load", data);
                        },
                    },
                    {
                        label: "Remove Score",
                        icon: <Icon src={Codicon.Trash} />,
                        onClick: (e) => {
                            this.handleActionClick(e, "remove", data);
                        },
                    }
                );
            }

            icon = <Icon src={iconSrc} className={iconClass + " scoreTreeIcon"} />;
        };

        const content = <>
            {icon}
            <Label caption={data.name} />
            <Container className="actionBox" orientation={Orientation.LeftToRight}>
                <Dropdown
                    icon={<Icon src={Codicon.KebabVertical} />}
                    items={dropdownItems}
                />
            </Container>
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

    private handleScoreTreeRowClick = (event: UIEvent, row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder | ISbDmScore;
        if (entry.type === SbDmEntityType.Score) {
            if (event instanceof MouseEvent && event.detail >= 2) {
                this.handleActionClick(event, "load", entry);

                return;
            }
        }
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
            entry.state.loading = false;

            if (!entry.state.expanded) {
                // refresh() reset the expanded flag on failure — collapse the row visually.
                row.treeCollapse();

                return;
            }

            entry.state.expandedOnce = true;

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
