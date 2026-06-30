/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

/**
 * Bit shifts for the 9-bit permission mask: OOOGGGWWW.
 */
const ownerShift = 6;
const groupShift = 3;
const worldShift = 0;

/**
 * Extracts the 3-bit permission value (0-7, rwx) for a given level.
 *
 * @param permBits The full 9-bit permission mask.
 * @param shift    The bit shift for the role.
 *
 * @returns A 3-bit value: bit 2 = read, bit 1 = write, bit 0 = execute.
 */
const getRolePerm = (permBits: number, shift: number): number => {
    return (permBits >> shift) & 0x7;
};

/**
 * A compact 3×2 dot matrix showing read/write permissions:
 *
 * ```
 *   R W
 * O ● ●   (Owner  row)
 * G ● ○   (Group  row)
 * W ● ○   (World  row)
 * ```
 *
 * Filled dot = permission granted, empty dot = not granted.
 * The layout mirrors the permissions dialog for consistency.
 *
 * @param props           The component props.
 * @param props.permBits  The raw 9-bit permission mask.
 * @param props.onClick   Optional click handler for opening the permission editor.
 *
 * @returns A 3×2 grid of dots.
 */
export const PermMatrix = (props: { permBits: number; onClick?: () => void; }): ComponentChild => {
    const { permBits, onClick } = props;

    const owner = getRolePerm(permBits, ownerShift);
    const group = getRolePerm(permBits, groupShift);
    const world = getRolePerm(permBits, worldShift);

    const dot = (level: number, bit: number): string => {
        return (level & bit) ? "permDot filled" : "permDot";
    };

    return (
        <span class="permMatrix" onClick={(e) => {
            e.stopPropagation();
            onClick?.();
        }} onMouseDown={(e) => {
            e.stopPropagation();
        }}>
            <span class="permRow">
                <span class={dot(owner, 4)} />
                <span class={dot(owner, 2)} />
            </span>
            <span class="permRow">
                <span class={dot(group, 4)} />
                <span class={dot(group, 2)} />
            </span>
            <span class="permRow">
                <span class={dot(world, 4)} />
                <span class={dot(world, 2)} />
            </span>
        </span>
    );
};
