/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "tabulator-tables/dist/css/tabulator_simple.min.css";
import "./TreeGrid.css";

import { ComponentChild, createRef } from "preact";

import {
    CellComponent, ColumnComponent, ColumnDefinition, DataTreeModule, EditModule, FilterModule, FormatModule,
    FrozenRowsModule, InteractionModule, MenuModule, Options, ReactiveDataModule, ResizeColumnsModule,
    ResizeRowsModule, ResizeTableModule, RowComponent, SelectRowModule, SortModule, Tabulator, TooltipModule,
    type RowLookup, type RowRangeLookup,
} from "tabulator-tables";

import { SelectionType } from "./ui-types.js";
import { UIComponent, type ICommonUIProperties } from "./UIComponent.js";

export enum SetDataAction {
    /** Like Set, but doesn't do any additional handling like scrolling, filtering, sorting and so on. */
    Replace,

    /** Requires an index field in each row and updates only existing data (for matching indexes) */
    Update,

    /** Adds new records to existing data. */
    Add,

    /** Full update of the grid content. */
    Set,
}

interface ITreeGridMenuEntry {
    label?: string | ((component: RowComponent) => string);
    disabled?: boolean;
    separator?: boolean;

    menu?: ITreeGridMenuEntry[]; // For sub menus.

    action?: (e: Event, column: ColumnComponent) => void;
}

/** Options to fine tune the behavior/look of the tree beyond the component properties. */
export interface ITreeGridOptions {
    /** The field name in the tree data, which uniquely identifies a record/row (default: "id") */
    index?: string;

    /** The field name in the tree data, which contains child node data (default: children). */
    childKey?: string;

    /**
     * The field name of the column to use for the outline.
     * If specified it enables the display of a tree in that column.
     */
    treeColumn?: string;

    /** The number of pixels child nodes should be indented */
    treeChildIndent?: number;

    /** Determines how columns are initially laid out (default: none). */
    layout?: "fitData" | "fitDataFill" | "fitDataStretch" | "fitDataTable" | "fitColumns";

    /**
     * If true then columns are laid out again when new data arrives (default: true).
     * Especially for cells with auto wrapping content this is essential, to correctly compute the row heights.
     */
    layoutColumnsOnNewData?: boolean;

    /** If false, no header is shown (default: true). */
    showHeader?: boolean;

    /** If true horizontal and/or vertical grid lines are shown. */
    verticalGridLines?: boolean;
    horizontalGridLines?: boolean;

    /** If true, odd rows get a slightly lighter background. */
    alternatingRowBackgrounds?: boolean;

    selectionType?: SelectionType;

    /** Used to expand specific levels in the tree on first display. */
    expandedLevels?: boolean[];

    /** If true then the user can vertically resize rows using the mouse. */
    resizableRows?: boolean;

    /** If true then the grid content is scrolled to the first selected item if the selection is modified. */
    autoScrollOnSelect?: boolean;

    /** Enforce the rowHeight to the given number in pixel */
    rowHeight?: number;

    /** Ensures the first selected row is visible */
    scrollToFirstSelected?: boolean;
}

interface ITreeGridProperties<TRow extends object> extends ICommonUIProperties {
    /**
     * The height for the grid. Can be given as number of pixels or a CSS property.
     * If not specified, the grid will act according to its CSS rules.
     */
    height?: string | number;

    /** The index of the row to which the table should scroll initially. */
    topRowIndex?: number;

    /**
     * For convenience these fields allow to specify initial (or static) data.
     * Most of the time you want to use `setColumns` and `setData` instead.
     */
    columns?: ColumnDefinition[];
    tableData?: TRow[];

    /**
     * A list of rows that should be selected initially. If a list of strings is given then the strings are
     * interpreted as ids (they use the index field in the data for identification). If a list of numbers is given
     * then the numbers are interpreted as row indices. Indices are one-based!
     * Note that the specified selection mode might limit that list (no selection or single selection).
     *
     * Important: The selection is only applied if initial data is set and only for the top level items.
     */
    selectedRows?: string[] | number[] | RowComponent[];
    options?: ITreeGridOptions;

    /** Menu entries for Tabulator provided menu. Do not confuse that with the `onRowContext` member. */
    rowContextMenu?: ITreeGridMenuEntry[];

    /**
     * The number of rows to freeze at the top.
     * Note: it is not possible to update this property after the grid has been created.
     */
    frozenRows?: number;

    onRowExpanded?: (row: RowComponent, level: number) => void;
    onRowCollapsed?: (row: RowComponent, level: number) => void;

    /** Return the initial expansion state of the given row. */
    isRowExpanded?: (row: RowComponent, level: number) => boolean;

    onFormatRow?: (row: RowComponent) => void;

    /** Triggered when a row context is required. It allows to show an own menu implementation. */
    onRowContext?: (event: UIEvent, row: RowComponent) => void;

    /** Ditto for single cells. */
    onCellContext?: (event: UIEvent, cell: CellComponent) => void;

    onCellClick?: (event: UIEvent, cell: CellComponent) => void;

    onRowClick?: (event: UIEvent, row: RowComponent) => void;
    onRowSelected?: (row: RowComponent) => void;
    onRowDeselected?: (row: RowComponent) => void;

    /**
     * Triggered whenever the grid is vertically scrolled. `rowIndex` represents the index of the row at top of the
     * grid at this moment.
     */
    onVerticalScroll?: (rowIndex: number) => void;

    onColumnResized?: (column: ColumnComponent) => void;
}

/**
 * This component shows data in dynamic lists with or without a tree column, or can show only a tree.
 * It differs in the way data is added from other controls. Data (columns, rows) can be passed in as properties and
 * can also be added on demand using the methods `setColumns` and `setRows`.
 */
export class TreeGrid<TRow extends object = {}> extends UIComponent<ITreeGridProperties<TRow>> {

    /** A counter to manage redraw blocks (public for testing). */
    public updateLockCount = 0;

    private hostRef = createRef<HTMLDivElement>();
    private tabulator?: Tabulator;
    private tableReady = false;
    private timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Used when we need to wait for a double click, to decide whether to expand or collapse a row.
    private toggleTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // True when the grid is in edit mode.
    private isEditing = false;

    // The component is being unmounted. Don't add any more data.
    private cancelled = false;

    static {
        Tabulator.registerModule([DataTreeModule, SelectRowModule, ReactiveDataModule, MenuModule, ResizeTableModule,
            ResizeColumnsModule, FormatModule, InteractionModule, EditModule, FilterModule, SortModule,
            ResizeRowsModule, FrozenRowsModule, TooltipModule]);
    }

    public override getSnapshotBeforeUpdate(): Record<string, unknown> {
        return {
            currentTop: (this.tabulator?.rowManager as Record<string, unknown>).scrollTop ?? 0,
        };
    }

    public override componentDidMount(): void {
        const { tableData } = this.props;

        // istanbul ignore else
        if (this.hostRef.current) {
            // The tabulator options can contain data, passed in as properties.
            this.timeoutId = null;
            this.tabulator = new Tabulator(this.hostRef.current, this.tabulatorOptions);
            this.tabulator.on("tableBuilt", () => {
                const { topRowIndex, selectedRows, options } = this.props;

                // The tabulator field must be assigned. We are in one of its events.
                this.tabulator!.off("tableBuilt");

                if (tableData) {
                    if (selectedRows && selectedRows.length > 0) {
                        if (typeof selectedRows[0] === "number") {
                            if (this.tabulator!.getRows().length > 0) { // Can be 0 in tests.
                                const rows = (selectedRows as number[]).map((rowIndex) => {
                                    return this.tabulator!.getRowFromPosition(rowIndex);
                                });
                                this.tabulator!.selectRow(rows);
                                if (options?.scrollToFirstSelected) {
                                    void this.tabulator!.scrollToRow(rows[0], "top", false);
                                }
                            }
                        } else {
                            this.tabulator!.selectRow(selectedRows);
                            if (options?.scrollToFirstSelected) {
                                void this.tabulator!.scrollToRow(selectedRows[0], "top", false);
                            }
                        }
                    }

                    if (topRowIndex != null) {
                        const topRow = this.tabulator!.getRowFromPosition(topRowIndex);
                        void this.tabulator!.scrollToRow(topRow, "top", false);
                    }
                }

                this.tableReady = true;
            });

            this.tabulator.on("dataTreeRowExpanded", this.handleRowExpanded);
            this.tabulator.on("dataTreeRowCollapsed", this.handleRowCollapsed);
            this.tabulator.on("rowContext", this.handleRowContext);
            this.tabulator.on("cellClick", this.handleCellClick);
            this.tabulator.on("cellContext", this.handleCellContext);
            this.tabulator.on("rowSelected", this.handleRowSelected);
            this.tabulator.on("rowClick", this.handleRowClicked);
            this.tabulator.on("rowDeselected", this.handleRowDeselected);
            this.tabulator.on("columnResized", this.handleColumnResized);
            this.tabulator.on("scrollVertical", this.handleVerticalScroll);
            this.tabulator.on("scrollHorizontal", this.handleVerticalScroll);
            this.tabulator.on("cellEditing", this.handleCellEditing);
            this.tabulator.on("cellEdited", this.handleCellEdited);
            this.tabulator.on("cellEditCancelled", this.handleCellEditCancelled);
        }
    }

    public override componentWillUnmount(): void {

        this.tableReady = false;
        this.cancelled = true;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    public override componentDidUpdate(prevProps: ITreeGridProperties<TRow>): void {

        if (this.tabulator && this.tableReady) {
            const { selectedRows, columns, tableData } = this.props;

            // When we are editing, we don't want to update the table.
            if (this.isEditing) {
                return;
            }

            if (prevProps.tableData !== tableData) {
                // The call to replaceData does not change the scroll position.
                void this.tabulator.replaceData(tableData).then(() => {
                    if (!this.cancelled) {
                        if (columns) {
                            // The call to setColumns does. Record the current position and restore it after the update.
                            // Also restore the column widths.
                            const rowManager = this.tabulator!.rowManager as Record<string, unknown>;
                            const columnManager = this.tabulator!.columnManager as Record<string, unknown>;
                            const rowElement = rowManager.element as HTMLElement;

                            const scrollTop = (rowManager.element as Record<string, unknown>).scrollTop as number;
                            const scrollLeft = rowElement.scrollLeft;

                            const previousColumnComponents = this.tabulator!.getColumns(true);
                            const widths = previousColumnComponents.map((component) => {
                                return component.getWidth();
                            });
                            this.tabulator?.setColumns(columns);

                            const newColumnComponents = this.tabulator!.getColumns(true);
                            if (previousColumnComponents.length === newColumnComponents.length) {
                                newColumnComponents.forEach((component, index) => {
                                    component.setWidth(widths[index]);
                                });
                            }

                            rowElement.scrollTop = scrollTop;

                            (rowManager.scrollHorizontal as ((pos: number) => void) | undefined)?.(scrollLeft);
                            (columnManager.scrollHorizontal as ((pos: number) => void) | undefined)?.(scrollLeft);
                        }

                        // Both columns and rows have been set. Now update the UI.
                        this.tabulator?.redraw();
                        if (selectedRows) {
                            this.tabulator?.selectRow(selectedRows);
                        }
                    }
                });
            } else if (selectedRows && !this.cancelled) {
                if (columns) {
                    // No data here, so no need to restore the scroll position.
                    this.tabulator.setColumns(columns);
                }

                this.tabulator.selectRow(selectedRows);
            }
        }
    }

    public render(): ComponentChild {
        const { id, options } = this.props;

        const className = this.generateFinalClassName([
            "treeGrid",
            this.classFromProperty(options?.horizontalGridLines, "horizontalGrid"),
            this.classFromProperty(options?.verticalGridLines, "verticalGrid"),
            this.classFromProperty(options?.alternatingRowBackgrounds, "alternatingRows"),
        ]);

        return (
            <div
                id={id}
                ref={this.hostRef}
                className={className}
            />
        );
    }

    public setColumns(columns: ColumnDefinition[]): void {
        if (!this.cancelled && this.tableReady && this.tabulator) {
            this.tabulator.setColumns(columns);
        }
    }

    public getColumns(): ColumnComponent[] | undefined {
        if (this.tableReady && this.tabulator) {
            return this.tabulator.getColumns();
        }
    }

    public async setData(data: unknown[], action: SetDataAction): Promise<void> {
        if (this.cancelled || !this.tableReady) {
            return;
        }

        switch (action) {
            case SetDataAction.Replace: {
                await this.tabulator?.replaceData(data as Array<{}>);

                break;
            }

            case SetDataAction.Update: {
                await this.tabulator?.updateData(data as Array<{}>);

                break;
            }

            case SetDataAction.Set: {
                await this.tabulator?.setData(data);

                break;
            }

            default: { // Add
                await this.tabulator?.addData(data as Array<{}>);

                break;
            }
        }
    }

    /**
     * @param rangeLookup Limit the rows that are returned based on a RowRangeLookup setting
     *
     * @returns all rows currently in the table, which match the given lookup value.
     */
    public getRows(rangeLookup?: RowRangeLookup): RowComponent[] {
        if (this.tableReady && this.tabulator) {
            return this.tabulator.getRows(rangeLookup);
        }

        return [];
    }

    /**
     * @returns a row that matches the given row selector.
     *
     * @param selector A value that identifies the row. It is compared to the index field in the data.
     */
    public getRow(selector: RowLookup): RowComponent | undefined {
        if (this.tableReady && this.tabulator) {
            return this.tabulator.getRow(selector);
        }
    }

    /** @returns the currently selected rows in the table. */
    public getSelectedRows(): RowComponent[] {
        if (this.tableReady && this.tabulator) {
            return this.tabulator.getSelectedRows();
        }

        return [];
    }

    public selectRows(rowIndices: number[]): void {
        if (this.tableReady && this.tabulator) {
            const rows = rowIndices.map((rowIndex) => {
                return this.tabulator!.getRowFromPosition(rowIndex);
            });
            this.tabulator.selectRow(rows);
        }
    }

    /**
     * This method is the recursive alternative to the Tabulator method `searchRows`, which only finds top level rows.
     * It only supports the `=` filter type currently.
     *
     * @param field The field in the data to search.
     * @param value The value to search for.
     *
     * @returns All rows that match the search criteria.
     */
    public searchAllRows(field: string, value: unknown): RowComponent[] {
        const matchedRows: RowComponent[] = [];

        const searchRows = (rows: RowComponent[]): void => {
            for (const row of rows) {
                if (row.getData()[field] === value) {
                    matchedRows.push(row);
                }

                if (row.getTreeChildren().length) {
                    searchRows(row.getTreeChildren());
                }
            }
        };

        searchRows(this.getRows());

        return matchedRows;
    }

    /**
     * @returns the row that matches the given index chain, which consists of zero-based values.
     *
     * @param index A list of indexes, each addressing a level in the tree.
     */
    public getRowFromIndex(index: number[]): RowComponent | undefined {
        if (this.tableReady && this.tabulator) {

            const rowFromIndex = (rows: RowComponent[]): RowComponent | undefined => {
                const current = index.shift();
                if (current === undefined) {
                    return undefined;
                }

                if (current < 0 || current > rows.length) {
                    return undefined;
                }

                if (index.length === 0) {
                    return rows[current];
                }

                return rowFromIndex(rows[current].getTreeChildren());
            };

            const rows = this.tabulator.getRows();

            return rowFromIndex(rows);
        }

        return undefined;
    }

    public selectRow(lookup?: RowLookup[] | true | string): void {
        if (this.tableReady && this.tabulator) {
            this.tabulator.selectRow(lookup);
        }
    }

    public deselectRow(lookup?: RowLookup): void {
        if (this.tableReady && this.tabulator) {
            this.tabulator.deselectRow(lookup);
        }
    }

    /**
     * Sets the grid to a special mode where no visual updates are done until `endUpdate()` was called.
     * Calls to `beginUpdate()` and `endUpdate()` must be balanced to avoid a complete redraw block.
     */
    public beginUpdate(): void {
        if (this.tableReady && this.tabulator) {
            ++this.updateLockCount;
            if (this.updateLockCount === 1) {
                this.tabulator.blockRedraw();
            }
        }
    }

    /**
     * Decreases the update counter. If that counter becomes 0, normal rendering is enabled again.
     * Calls to `beginUpdate()` and `endUpdate()` must be balanced to avoid a complete redraw block.
     */
    public endUpdate(): void {
        if (this.tableReady && this.tabulator) {
            if (this.updateLockCount > 0) {
                --this.updateLockCount;
                if (this.updateLockCount === 0) {
                    this.tabulator.restoreRedraw();
                }
            }
        }
    }

    public scrollToRow(item: number | RowLookup): Promise<void> {
        if (this.tableReady && this.tabulator) {
            if (typeof item === "number") {
                const row = this.tabulator.getRowFromPosition(item);

                return this.tabulator.scrollToRow(row, "top", true);
            } else {
                return this.tabulator.scrollToRow(item, "center", true);
            }
        }

        return Promise.resolve();
    }

    public scrollToBottom(): Promise<void> {
        if (this.tableReady && this.tabulator) {
            const rows = this.tabulator.getRows();

            if (rows.length > 0) {
                return this.tabulator.scrollToRow(rows[rows.length - 1], "top", true);
            }
        }

        return Promise.resolve();
    }

    public async addRow(row: {}): Promise<void> {
        if (this.tableReady && this.tabulator) {
            await this.tabulator.addRow(row);
        }

        return Promise.resolve();
    }

    /**
     * Transforms the component properties into a tabulator options object.
     *
     * @returns The tabulator options.
     */
    private get tabulatorOptions(): Options {
        const {
            height = "100%", columns = [], tableData, options, rowContextMenu, frozenRows = 0, isRowExpanded,
            onFormatRow,
        } = this.props;

        let selectableRows: number | boolean | "highlight";
        switch (options?.selectionType) {
            case SelectionType.Highlight: {
                selectableRows = "highlight";
                break;
            }

            case SelectionType.Single: {
                selectableRows = 1;
                break;
            }

            case SelectionType.Multi: {
                selectableRows = true;
                break;
            }

            default: {
                selectableRows = false;
                break;
            }
        }

        // SVG elements work well as expand/collapse icons. However, Tabulator expects an HTML element.
        const expander = this.createChevronSvg() as unknown as HTMLElement;
        const result: Options = {
            index: options?.index ?? "id",
            columns,
            data: tableData,
            frozenRows,

            dataTree: options?.treeColumn != null,
            dataTreeChildIndent: options?.treeChildIndent ?? 8,
            dataTreeChildField: options?.childKey ?? "children",
            dataTreeElementColumn: options?.treeColumn,
            dataTreeExpandElement: expander,
            dataTreeCollapseElement: expander,
            dataTreeBranchElement: false,
            dataTreeStartExpanded: options?.expandedLevels ?? false,

            rowFormatter: onFormatRow,

            headerVisible: options?.showHeader ?? true,
            selectableRows,
            selectableRowsRangeMode: "click",
            editTriggerEvent: "dblclick",
            reactiveData: false, // Very slow when enabled.

            rowContextMenu,

            autoResize: true,
            renderVertical: "virtual",

            layoutColumnsOnNewData: options?.layoutColumnsOnNewData ?? true,
            resizableRows: options?.resizableRows,
            rowHeight: options?.rowHeight,

            // We have to set a fixed height to enable the virtual DOM in Tabulator. However this is a severe
            // limitation in flex box layouts, which need extra counter measures.
            height,
        };

        // Tabulator is not consistent when dealing with missing callback functions. In some situations it tests for
        // null before accessing a callback, and sometimes it does not and creates an exception when null is assigned.
        if (isRowExpanded) {
            result.dataTreeStartExpanded = isRowExpanded;
        }

        if (options?.layout) {
            result.layout = options.layout;
        }

        return result;
    }

    private handleRowExpanded = (row: RowComponent, level: number): void => {
        const { onRowExpanded } = this.props;
        row.getElement().classList.add("expanded");

        onRowExpanded?.(row, level);
    };

    private handleRowCollapsed = (row: RowComponent, level: number): void => {
        const { onRowCollapsed } = this.props;

        row.getElement().classList.remove("expanded");

        onRowCollapsed?.(row, level);
    };

    private handleRowContext = (event: UIEvent, row: RowComponent): void => {
        const { onRowContext } = this.props;

        onRowContext?.(event, row);
    };

    private handleCellClick = (event: UIEvent, cell: CellComponent): void => {
        const { onCellClick } = this.props;

        onCellClick?.(event, cell);
    };

    private handleCellContext = (event: UIEvent, cell: CellComponent): void => {
        const { onCellContext } = this.props;

        onCellContext?.(event, cell);
    };

    private handleRowClicked = (event: UIEvent, row: RowComponent): void => {
        const { options, columns, onRowClick } = this.props;

        onRowClick?.(event, row);

        if (!event.defaultPrevented && options?.treeColumn) {
            if (this.toggleTimeoutId) {
                clearTimeout(this.toggleTimeoutId);
                this.toggleTimeoutId = null;

                return;
            }

            if (columns && columns.length > 0 && columns[0].cellDblClick !== undefined) {
                // Toggle the selected row if this is actually a tree (after a delay to see if a double click follows).
                this.toggleTimeoutId = setTimeout(() => {
                    this.toggleTimeoutId = null;
                    if (!event.defaultPrevented) { // Allow click handlers to prevent the toggle.
                        row.treeToggle();
                    }
                }, 200);
            } else {
                row.treeToggle();
            }
        }
    };

    private handleRowSelected = (row: RowComponent): void => {
        const { options } = this.props;

        if (options?.autoScrollOnSelect) {
            const selected = this.tabulator?.getSelectedRows() ?? [];
            if (selected.length > 0) {
                void this.tabulator?.scrollToRow(selected[0], "center", false);
            }
        }

        const { onRowSelected } = this.props;

        onRowSelected?.(row);
    };

    private handleRowDeselected = (row: RowComponent): void => {
        const { onRowDeselected } = this.props;

        onRowDeselected?.(row);
    };

    private handleColumnResized = (column: ColumnComponent): void => {
        const { onColumnResized } = this.props;

        onColumnResized?.(column);
    };

    /**
     * Called when the vertical position of the grid changes.
     *
     * @param _top The new vertical position in pixels. However, that is not very useful, because this value
     *             cannot be applied to the grid directly.
     */
    private handleVerticalScroll = (_top: number): void => {
        const { onVerticalScroll } = this.props;

        const rows = this.tabulator!.getRows("visible");
        if (rows.length > 0) {
            const topRow = rows[0];

            onVerticalScroll?.(topRow.getPosition() as number);
        }
    };

    private handleCellEditing = () => {
        this.isEditing = true;
    };

    private handleCellEdited = () => {
        this.isEditing = false;
    };

    private handleCellEditCancelled = () => {
        this.isEditing = false;
    };

    private createChevronSvg(): SVGElement {
        const xmlns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(xmlns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.classList.add("treeToggle");

        const poly = document.createElementNS(xmlns, "polyline");
        poly.setAttribute("points", "9,6 15,12 9,18");
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "currentColor");
        poly.setAttribute("stroke-width", "2.5");
        poly.setAttribute("stroke-linecap", "round");
        poly.setAttribute("stroke-linejoin", "round");

        svg.appendChild(poly);

        return svg;
    }
}
