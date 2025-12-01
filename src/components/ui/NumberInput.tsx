/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import type { ISubscribable } from "../../core/types/general.js";
import { ComponentBase, type IComponentProperties, type IComponentState } from "./ComponentBase/ComponentBase.js";

export interface INumberInputProps extends IComponentProperties {
    getValue: () => string;
    setValue: (newValue: string) => void;
    subscribable: ISubscribable;
}

interface INumberInputState extends IComponentState {
    visibleValue: string;
}

export class NumberInput extends ComponentBase<INumberInputProps, INumberInputState> {

    public constructor(props: INumberInputProps) {
        super(props);

        this.state = {
            visibleValue: this.props.getValue()
        };
    }

    public override componentDidMount(): void {
        const { subscribable } = this.props;

        subscribable.subscribe(this.handleChange);
    }

    public override componentWillUnmount(): void {
        const { subscribable } = this.props;

        subscribable.unsubscribe(this.handleChange);
    }

    public render(): ComponentChild {
        const { visibleValue } = this.state;

        return (
            <input
                className="short"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(event) => {
                    this.attemptSetVisibleValue((event.target as HTMLInputElement).value);
                }}
                value={visibleValue}
                onBlur={() => {
                    this.attemptSet();
                }}
                onKeyPress={(event) => {
                    if (event.key === "Enter") {
                        this.attemptSet();
                    }
                }}
            />
        );
    }

    // To update the input as you type, but not update the model
    private attemptSetVisibleValue(inputValue: string) {
        if (inputValue.length === 0) {
            this.setState({ visibleValue: "" });

            return;
        }

        if (!inputValue.charAt(inputValue.length - 1).match(/[0-9]/)) {
            this.attemptSetVisibleValue(inputValue.substring(0, inputValue.length - 1));

            return;
        }

        this.setState({ visibleValue: inputValue });
    }

    // Try to set the model value, which may fail due to validation
    private attemptSet() {
        const { getValue, setValue } = this.props;
        const { visibleValue } = this.state;

        if (visibleValue === getValue()) {
            return;
        }

        try {
            setValue(visibleValue);
        } catch {
            this.setState({ visibleValue: getValue() });
        }
    }

    private handleChange = () => {
        const { getValue } = this.props;

        this.setState({ visibleValue: getValue() });
    };
}
