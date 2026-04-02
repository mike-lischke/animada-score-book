/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { WaveformPlayer } from "../components/ui/composites/WaveformPlayer.js";
import { Container } from "../components/ui/framework/Container.js";
import { Label } from "../components/ui/framework/Label.js";
import { Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import type { ISbDmInstrument, ISbDmInstrumentImage } from "../core/ScoreBookDataModel.js";

export interface IInstrumentEditorProps extends ICommonUIProperties {
    instrument: ISbDmInstrument;
}

/** A component to edit instrument definitions. */
export class InstrumentEditor extends UIComponent<IInstrumentEditorProps> {

    public override render() {
        const { instrument } = this.props;
        const className = this.generateFinalClassName(["instrument-editor"]);

        return (
            <Container
                className={className}
                orientation={Orientation.LeftToRight}
            >
                <Label className="instrument-name" caption={instrument.displayName} />
                <Container
                    className="instrument-waveform-panel"
                    orientation={Orientation.TopDown}
                >
                    <WaveformPlayer />
                </Container>

            </Container>
        );
    }

    private async uploadInstrumentImage(instrumentId: number, file: File): Promise<ISbDmInstrumentImage> {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/upload-instrument-image.php?instrumentId=${instrumentId}`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json() as ISbDmInstrumentImage;

        return data;
    }

}
