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
import { Menu } from "../components/ui/framework/Menu/Menu.js";
import type { IMenuItem } from "../components/ui/framework/Menu/MenuItem.js";
import { SetDataAction, TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import {
    SbDmEntityType, type ISbDmScore, type ISbDmScoreFolder, type ScoreBookDataModel
} from "../core/ScoreBookDataModel.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { PermIndicator } from "./PermIndicator.js";
import { requisitions } from "../supplement/Requisitions.js";

export interface IScoreLibraryProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    onAction?: (action: string, dataModelEntry?: ISbDmScoreFolder | ISbDmScore,
        parent?: ISbDmScoreFolder) => Promise<boolean>;
}

interface IScoreLibraryState {
    /** The URL of an audio or video file. */
    url?: string;

    currentSettings: IUISettings;
}

/**
 * A component to manage a tree of scored from the server.
 * The user can select one score to load it into the player/editor.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    private scoreTableRef = createRef<TreeGrid>();

    public constructor(props: IScoreLibraryProperties) {
        super(props);
        this.state = {
            currentSettings: AppStorage.loadUISettings() ?? {}
        };
    }

    public override componentDidMount(): void {
        requisitions.register("settingsChanged", this.handleSettingsChanged);
        requisitions.register("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.register("permChanged", this.handlePermChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("settingsChanged", this.handleSettingsChanged);
        requisitions.unregister("scoreBookLoaded", this.handleScoreBookLoaded);
        requisitions.unregister("permChanged", this.handlePermChanged);
    }

    public render(): ComponentChild {
        const { dataModel } = this.props;

        const scoreTreeColumns: ColumnDefinition[] = [{
            title: "",
            field: "name",
            resizable: false,
            hozAlign: "left",
            formatter: this.scoreTreeCellFormatter,
            cellDblClick: this.handleScoreTreeDblClick,
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
        const { currentSettings } = this.state;
        const { dataModel } = this.props;

        const row = cell.getRow();
        const data = cell.getData() as ISbDmScoreFolder | ISbDmScore;

        const host = document.createElement("div");
        host.className = "scoreTreeEntry";
        host.dataset.entryType = String(data.type);
        host.dataset.entryId = String(data.id);

        let icon: ComponentChild;
        const menuItems: IMenuItem[] = [];

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

                menuItems.push(
                    { id: "import", label: "Import Score", icon: Codicon.CloudDownload },
                    { id: "addFolder", label: "Add New Sub Folder", icon: Codicon.NewFolder },
                    { id: "edit", label: "Rename Folder", icon: Codicon.Edit },
                    { id: "separator1", label: "-" },
                    { id: "remove", label: "Remove Folder", icon: Codicon.Trash },
                );
            } else {
                iconSrc = Codicon.Music;
                iconClass = "score";

                menuItems.push(
                    { id: "load", label: "Load Score" },
                    { id: "separator2", label: "-" },
                    { id: "remove", label: "Remove Score", icon: Codicon.Trash },
                );
            }

            icon = <Icon src={iconSrc} className={iconClass + " scoreTreeIcon"} />;
        };

        const isAdmin = dataModel.user?.isAdmin ?? false;
        const { perm } = data;
        const canManage = isAdmin || (perm?.isOwner === true);
        const showIndicator = (currentSettings.showPermMatrix ?? true) && perm != null;
        const canWrite = perm?.canWrite === true;
        const isWorld = perm?.isWorld === true;

        if (canManage) {
            menuItems.push(
                { id: "separator3", label: "-" },
            );
            menuItems.push(
                { id: "managePerm", label: "Group Access", icon: Codicon.Key },
            );
        }

        const content = <>
            {icon}
            <Label caption={data.name} />
            {showIndicator && (
                <PermIndicator
                    canWrite={canWrite}
                    isWorld={isWorld}
                    canManage={canManage}
                    onManage={canManage ? () => {
                        this.handleMenuItemClick("managePerm", data);
                    } : undefined}
                />
            )}
            <Container className="actionBox" orientation={Orientation.LeftToRight}>
                <Menu
                    icon={Codicon.KebabVertical}
                    items={menuItems}
                    onItemClick={(id) => {
                        // Capture data in a closure so each cell's menu uses the correct entry.
                        this.handleMenuItemClick(id, data);
                    }}
                />
            </Container>
        </>;

        render(content, host);

        return host;
    };

    private handleMenuItemClick = (id: string, entry: ISbDmScoreFolder | ISbDmScore): void => {
        const { onAction, dataModel } = this.props;

        // For "import" and "addFolder", the clicked folder is the parent, not the data.
        const needsParent = id === "import" || id === "addFolder";
        const actionData = needsParent ? undefined : entry;
        const actionParent: ISbDmScoreFolder | undefined = needsParent
            && entry.type === SbDmEntityType.ScoreFolder
            ? entry : undefined;

        if (id === "managePerm") {
            const tree = this.scoreTableRef.current;

            tree?.deselectRow();

            const rows = tree?.searchAllRows("id", entry.id);

            if (rows && rows.length > 0) {
                tree?.selectRow(rows);
            }
        }

        void onAction?.(id, actionData, actionParent).then((handled) => {
            if (handled) {
                const updateRowsById = (targetId: number, targetData: ISbDmScoreFolder | ISbDmScore): void => {
                    const tree = this.scoreTableRef.current;
                    const rows = tree?.searchAllRows("id", targetId);
                    rows?.forEach((row) => {
                        void row.update(targetData);
                    });
                };

                switch (id) {
                    case "addFolder": {
                        if (actionParent) {
                            updateRowsById(actionParent.id, actionParent);
                        } else {
                            const scores = dataModel.scoreLib;
                            const tree = this.scoreTableRef.current;
                            void tree?.setData(scores, SetDataAction.Replace);
                        }

                        break;
                    }

                    case "import": {
                        if (actionParent) {
                            updateRowsById(actionParent.id, actionParent);
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
                        if (tree && actionData?.type === SbDmEntityType.ScoreFolder) {
                            updateRowsById(actionData.id, actionData);
                        }

                        break;
                    }

                    default:
                }
            }
        });
    };

    private handleActionClick = (e: MouseEvent | KeyboardEvent, action: string,
        data?: ISbDmScoreFolder | ISbDmScore, parent?: ISbDmScoreFolder): void => {
        const { onAction, dataModel } = this.props;

        e.stopPropagation();

        void onAction?.(action, data, parent).then((handled) => {
            if (handled) {
                const updateRowsById = (id: number, targetData: ISbDmScoreFolder | ISbDmScore): void => {
                    const tree = this.scoreTableRef.current;
                    const rows = tree?.searchAllRows("id", id);
                    rows?.forEach((row) => {
                        void row.update(targetData);
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

    private handleScoreTreeDblClick = (event: UIEvent, cell: CellComponent): void => {
        const entry = cell.getRow().getData() as ISbDmScoreFolder | ISbDmScore;

        if (entry.type === SbDmEntityType.Score) {
            this.handleActionClick(event as MouseEvent, "load", entry);
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

    private handleSettingsChanged = (settings: IUISettings): Promise<boolean> => {
        this.setState({ currentSettings: settings }, () => {
            const rows = this.scoreTableRef.current?.getRows();
            rows?.forEach((row) => {
                row.reformat();
            });
        });

        return Promise.resolve(true);
    };

    private handleScoreBookLoaded = (): Promise<boolean> => {
        const { dataModel } = this.props;
        const tree = this.scoreTableRef.current;
        void tree?.setData(dataModel.scoreLib, SetDataAction.Replace);

        return Promise.resolve(true);
    };

    private handlePermChanged = (entry: ISbDmScoreFolder | ISbDmScore): Promise<boolean> => {
        const tree = this.scoreTableRef.current;
        const rows = tree?.searchAllRows("id", entry.id);

        rows?.forEach((row) => {
            row.reformat();
        });

        return Promise.resolve(true);
    };

    private isScoreTreeRowExpanded = (row: RowComponent): boolean => {
        const entry = row.getData() as ISbDmScoreFolder;

        return entry.state.expanded;
    };

};
