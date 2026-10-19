import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { createRef } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrackControls, type ITrackControlsProperties } from "../../src/components/ui/Arrangement/TrackControls.js";
import { ScoreBookDataModel } from "../../src/core/ScoreBookDataModel.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { createInstrument } from "../unit-test-helpers.js";
import { TrackViewMode } from "../../src/core/types/general.js";

describe("TrackControls", { concurrent: false }, () => {
    let renderResult: RenderResult | undefined;
    let selectionManager: SelectionManager | undefined;

    const renderControls = (overrides: Partial<ITrackControlsProperties> = {}): Element => {
        const dataModel = new ScoreBookDataModel();
        const arrangement = dataModel.startNewArrangement([
            createInstrument("short", 0), createInstrument("long instrument name", 1),
        ]);
        selectionManager = new SelectionManager(dataModel);

        renderResult = render(<TrackControls tracks={arrangement.tracks} selectionManager={selectionManager}
            mixerExpanded={false} trackViewMode={TrackViewMode.Grid} {...overrides} />);

        return renderResult.container;
    };

    afterEach(() => {
        renderResult?.unmount();
        selectionManager?.dispose();
        cleanup();
        renderResult = undefined;
        selectionManager = undefined;
    });

    it("renders with the minimum props", () => {
        expect(renderControls()).toMatchSnapshot();
    });

    it("renders with all props set", () => {
        const container = renderControls({
            className: "zen-track-labels",
            mixerExpanded: true,
            trackViewMode: TrackViewMode.Staff,
            labelsOnly: true,
            innerRef: createRef<HTMLDivElement>(),
            rowGeometries: new Map(),
        });

        expect(container).toMatchSnapshot();
    });

    it("renders instrument names without mixer controls in labels-only mode", () => {
        const container = renderControls({ labelsOnly: true, mixerExpanded: true });
        const labels = [...container.querySelectorAll(".track-instrument-label")];

        expect(labels.map((label) => {
            return label.textContent;
        })).toEqual([
            "Instrument short", "Instrument long instrument name",
        ]);
        expect(labels.map((label) => {
            return label.getAttribute("title");
        })).toEqual([
            "Instrument short", "Instrument long instrument name",
        ]);
        expect(container.querySelectorAll(".track-label-row")).toHaveLength(2);
        expect(container.querySelector(".track-controls-list.expanded")).toBeNull();
        expect(container.querySelector(".track-volume-slider")).toBeNull();
        expect(container.querySelector(".trackInstrumentIcon")).toBeNull();
    });

    it("keeps the shared staff geometry on each label row", () => {
        const dataModel = new ScoreBookDataModel();
        const arrangement = dataModel.startNewArrangement([createInstrument("0", 0)]);
        const track = arrangement.tracks[0];
        const container = renderControls({
            tracks: arrangement.tracks,
            labelsOnly: true,
            rowGeometries: new Map([[track.id, { heightPx: 120, centrePx: 10, staffLineOffsetPx: 70 }]]),
        });
        const row = container.querySelector<HTMLElement>(".track-label-row")!;

        expect(row.style.getPropertyValue("--track-row-height")).toBe("120px");
        expect(row.style.getPropertyValue("--staff-centre")).toBe("10px");
    });

    it("heads the mixer with a dot and an icon alone", () => {
        const container = renderControls();
        const toggle = container.querySelector<HTMLElement>("#trackControlsToggle")!;

        expect(toggle.getAttribute("title")).toBe("Expand mixer");
        expect(toggle.textContent.trim()).toBe("");
        expect([...toggle.children].map((child) => {
            return child.classList.contains("actionControlSwitchDot") ? "dot" : "icon";
        })).toEqual(["dot", "icon"]);
    });

    it("toggles the mixer through its header switch", () => {
        const onToggleMixer = vi.fn();
        const container = renderControls({ onToggleMixer });

        fireEvent.click(container.querySelector("#trackControlsToggle")!);

        expect(onToggleMixer).toHaveBeenCalledOnce();
    });
});
