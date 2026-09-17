/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { Icon } from "../components/ui/framework/Icon.js";

export interface IPermIndicatorProps {
    /** Whether the current user can write this entity. */
    canWrite: boolean;
    /** Whether this entity is assigned to the World group (publicly readable). */
    isWorld: boolean;
    /** Whether the current user is the owner (or admin) and can manage permissions. */
    canManage: boolean;
    /** Called when the indicator is clicked (to open the permission editor). */
    onManage?: () => void;
}

/**
 * A compact permission indicator for the score tree.
 *
 * Shows nothing when the user can edit the entry (normal state).
 * Only shows icons for exceptional states:
 * - A prohibition sign when the entry is read-only for the current user.
 * - A globe icon when the entry is publicly accessible (World group).
 *
 * If the user can manage permissions (owner/admin), the indicator is clickable.
 *
 * @param props The component props.
 *
 * @returns The indicator element.
 */
export const PermIndicator = (props: IPermIndicatorProps): ComponentChild => {
    const { canWrite, isWorld, canManage, onManage } = props;

    if (canWrite && !isWorld) {
        return null;
    }

    const handleClick = canManage && onManage ? (e: MouseEvent) => {
        e.stopPropagation();
        onManage();
    } : undefined;

    const handleMouseDown = (e: MouseEvent) => {
        e.stopPropagation();
    };

    const titleParts: string[] = [];

    if (!canWrite) {
        titleParts.push("Read-only");
    }

    if (isWorld) {
        titleParts.push("Public");
    }

    const title = titleParts.join(" · ");

    return (
        <span
            class="permIndicator"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            title={canManage ? "Group Access" : title}
        >
            {!canWrite && (
                <span class="permReadOnlyIcon" title="Read-only">
                    <Icon src={UIIcon.Edit} />
                </span>
            )}
            {isWorld && (
                <Icon src={UIIcon.Globe} className="permWorldIcon" title="Publicly accessible" />
            )}
        </span>
    );
};
