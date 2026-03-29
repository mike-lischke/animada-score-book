/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Determines how text is rendered. The type corresponds to a specific CSS class.
 */
export enum MessageType {
    Error,
    Warning,
    Info,
    Text,
    Success,
}

/** Semantically the same as ContentAlignment, but needs different values. */
export enum TextAlignment {
    Start = "start",
    Center = "center",
    End = "end",
}

/** Content alignment on both the main axis and the cross axis. */
export enum ChildAlignment {
    Start = "flex-start",
    Center = "center",
    End = "flex-end",
    Stretch = "stretch",
    Baseline = "baseline",
    SpaceBetween = "space-between",
    SpaceAround = "space-around",
    SpaceEvenly = "space-evenly",
}

/** Determines how child elements are wrapped if they exceed the available space. */
export enum ChildWrap {
    NoWrap = "nowrap",
    Wrap = "wrap",
    WrapReverse = "wrap-reverse",
}

/**
 * Determines how child elements are laid out inside the container.
 */
export enum Orientation {
    TopDown = "column",
    BottomUp = "column-reverse",
    LeftToRight = "row",
    RightToLeft = "row-reverse",
}

export enum TabPosition {
    Top = "top",
    Right = "right",
    Bottom = "bottom",
    Left = "left",
}

export enum CloseMenuItem {
    CloseTab = "closeTab",
    CloseOthers = "closeOthers",
    CloseRight = "closeRight",
    CloseAll = "closeAll",
}

/** Item selection style in lists and similar. */
export enum SelectionType {
    /** Neither clickable, nor show any highlight on hover. */
    None,

    /** Not clickable, but show highlight on hover. */
    Highlight,

    /** Show highlight and allow to select at most one row. */
    Single,

    /** Show highlight and allow to select any number of rows. */
    Multi,
}
