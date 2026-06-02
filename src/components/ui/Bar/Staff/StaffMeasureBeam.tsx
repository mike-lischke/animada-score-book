/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "../../framework/UIComponent.js";

export interface IStaffMeasureBeamProps extends ICommonUIProperties {
    measureNumber: number;

    /** Label explicitly assigned to this measure. Takes precedence over inheritedLabel. */
    ownLabel?: string;

    /**
     * The most-recent label from an earlier measure, shown at reduced opacity when no ownLabel is set.
     * Undefined for bar 1 when no label has been assigned yet.
     */
    inheritedLabel?: string;
}

/**
 * Renders the header strip above the staff track rows of a single measure: a boxed measure number
 * on the left, followed by a section label. When no explicit label is set for this measure the
 * inherited label from the previous labelled measure is shown at reduced opacity.
 */
export class StaffMeasureBeam extends UIComponent<IStaffMeasureBeamProps> {
    public override render(): ComponentChild {
        const { measureNumber, ownLabel, inheritedLabel } = this.props;

        const label = ownLabel ?? inheritedLabel;
        const isInherited = ownLabel === undefined && inheritedLabel !== undefined;

        const className = this.generateFinalClassName(["staff-measure-beam"]);

        return (
            <div className={className}>
                <div className="staff-measure-number">{measureNumber}</div>
                {label !== undefined
                    ? (
                        <div className={`staff-measure-label${isInherited ? " inherited" : ""}`}>
                            {label}
                        </div>
                    )
                    : null}
            </div>
        );
    }
}
