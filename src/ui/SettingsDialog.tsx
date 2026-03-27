/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { themeNames } from "../generated/theme-names.js";

import { Component, ComponentChild, createRef } from "preact";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Container } from "../components/ui/framework/Container.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { Button } from "../components/ui/framework/Button.js";

export interface ISettingsDialogProperties {
    onSettingsChanged?: (settings: IUISettings) => void;
}

interface ISettingsDialogState {
    settings: IUISettings;
    previousTheme: string;
}

export class SettingsDialog extends Component<ISettingsDialogProperties, ISettingsDialogState> {
    private dialogRef = createRef<Dialog>();

    public constructor(props: ISettingsDialogProperties) {
        super(props);

        const settings = AppStorage.loadUISettings() ?? {};
        const previousTheme = settings.theme ?? "Light+";

        this.state = {
            settings,
            previousTheme,
        };
    }

    public render(): ComponentChild {
        const { settings } = this.state;
        const currentTheme = settings.theme ?? "Light+";

        const darkThemes: string[] = [];
        const lightThemes: string[] = [];
        for (const [name, type] of Object.entries(themeNames)) {
            if (type === "dark") {
                darkThemes.push(name);
            } else if (type === "light") {
                lightThemes.push(name);
            }
        }

        const themeItems: IDropdownItem[] = [];

        lightThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    document.documentElement.setAttribute("data-theme", themeName);
                    settings.theme = themeName;
                    this.setState({ settings });
                },
            });
        });
        themeItems.push({ label: "──────────" }); // Separator
        darkThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    document.documentElement.setAttribute("data-theme", themeName);
                    settings.theme = themeName;
                    this.setState({ settings });
                },
            });
        });

        return (
            <Dialog
                ref={this.dialogRef}
                onClose={this.handleClose}
                actions={[
                    <Button id="settings-button-cancel" value="cancel" caption="Cancel" />,
                    <Button id="settings-button-save" value="save" caption="Save" />
                ]}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={Codicon.Gear} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Settings
                </Container>
                <p className="py-4">Here you can change the settings of the application.</p>
                <Dropdown
                    caption={`Current Theme: ${currentTheme}`}
                    items={themeItems}
                    selectedItem={currentTheme}
                />
            </Dialog>
        );
    }

    public open(): void {
        const settings = AppStorage.loadUISettings() ?? {};
        const previousTheme = settings.theme ?? "Light+";
        this.setState({ settings, previousTheme }, () => {
            this.dialogRef.current?.open();
        });
    }

    private handleClose = (returnValue: string): void => {
        const { onSettingsChanged } = this.props;
        const { settings, previousTheme } = this.state;

        if (returnValue === "cancel" || returnValue === "") {
            // Reset the theme to the original value if the user cancelled the dialog.
            document.documentElement.setAttribute("data-theme", previousTheme);
        } else {
            AppStorage.saveUISettings(settings);
            onSettingsChanged?.(settings);
        }
    };
}
