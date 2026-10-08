/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, type ComponentChild } from "preact";

import releaseNotes from "../../../../release-notes.md?raw";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dialog } from "../framework/Dialog.js";
import { Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

/** Shows the release notes as a scrollable dialog. */
export class ReleaseNotesDialog extends UIComponent<ICommonUIProperties> {
    private dialogRef = createRef<Dialog | null>();

    public open(): void {
        this.dialogRef.current?.open();
    }

    public render(): ComponentChild {
        const lines = ReleaseNotesDialog.toTextLines(releaseNotes);
        const body: ComponentChild[] = lines.map((line, index) => {
            const key = `releaseNote${index}`;
            if (line.startsWith("## ")) {
                return <h2 key={key} className="releaseNotesHeading">{line.substring(3)}</h2>;
            }

            if (line.startsWith("# ")) {
                return <h1 key={key} className="releaseNotesTitle">{line.substring(2)}</h1>;
            }

            if (line.startsWith("- ")) {
                return <p key={key} className="releaseNotesItem">{line.substring(2)}</p>;
            }

            if (line.length === 0) {
                return <div key={key} className="releaseNotesSpacer" />;
            }

            return <p key={key} className="releaseNotesParagraph">{line}</p>;
        });

        return (
            <Dialog
                id="releaseNotesDialog"
                ref={this.dialogRef}
                caption="Release Notes"
                actions={[<Button value="close" caption="Close" />]}
            >
                <Container className="releaseNotesBody" orientation={Orientation.TopDown}>
                    {body}
                </Container>
            </Dialog>
        );
    }

    /**
     * Joins the markdown's hard-wrapped lines back into logical lines the dialog can style.
     *
     * @param markdown The raw markdown text.
     *
     * @returns The lines to render.
     */
    private static toTextLines(markdown: string): string[] {
        const lines: string[] = [];

        for (const rawLine of markdown.split("\n")) {
            const line = rawLine.trimEnd();
            const continuesPrevious = lines.length > 0 && lines[lines.length - 1].length > 0
                && rawLine.startsWith(" ") && rawLine.trim().length > 0;

            if (continuesPrevious) {
                lines[lines.length - 1] += ` ${line.trim()}`;
            } else {
                lines.push(line);
            }
        }

        // Drop the inline emphasis markers the plain-text rendering does not interpret.
        return lines.map((line) => {
            return line.replaceAll("**", "").replaceAll("`", "");
        });
    }
}
