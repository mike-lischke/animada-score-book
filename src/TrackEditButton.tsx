/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Button } from "./components/ui/framework/Button.js";
import { Codicon } from "./components/ui/framework/Codicon.js";
import { Icon } from "./components/ui/framework/Icon.js";
import { UIComponent, type ICommonUIProperties } from "./components/ui/framework/UIComponent.js";

export interface ITrackEditButtonProperties extends ICommonUIProperties {
    caption?: string;
}

export class TrackEditButton extends UIComponent<ITrackEditButtonProperties> {

    public render() {
        const { id, caption } = this.props;

        const className = this.generateFinalClassName(["trackEditButton"]);

        return (
            <Button
                id={id}
                className={className}
                caption={caption}
                title="Click to start a new track editor session"
                onClick={this.handleClick}
            >

                <div className="trackEditButton inner">
                    <Icon src={Codicon.Add} />
                </div>
            </Button>
        );
    }

    private handleClick = (e: MouseEvent | KeyboardEvent): void => {
        const { onClick } = this.props;

        onClick?.(e);
    };
}
