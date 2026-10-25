import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../src/components/ui/ErrorBoundary.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("ErrorBoundary", { concurrent: false }, () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("renders healthy children", () => {
        const result = render(<ErrorBoundary><span>Healthy content</span></ErrorBoundary>);

        expect(result.getByText("Healthy content")).toBeDefined();
        expect(result.queryByRole("alert")).toBeNull();
    });

    it.each(["session.printedTracks is not a function", ""])(
        "stops retrying a failed subtree until requested, including error message '%s'", (message) => {
            vi.spyOn(console, "error").mockImplementation(() => {
                return undefined;
            });
            const execute = vi.spyOn(requisitions, "execute").mockResolvedValue(true);
            let shouldFail = true;
            const Child = vi.fn(() => {
                if (shouldFail) {
                    throw new Error(message);
                }

                return <span>Recovered content</span>;
            });
            const result = render(<ErrorBoundary><Child /></ErrorBoundary>);
            const attempts = Child.mock.calls.length;

            expect(result.getByRole("alert")).toBeDefined();
            expect(execute).toHaveBeenCalledExactlyOnceWith("showError", message);

            result.rerender(<ErrorBoundary><Child /></ErrorBoundary>);

            expect(Child).toHaveBeenCalledTimes(attempts);
            expect(execute).toHaveBeenCalledTimes(1);

            fireEvent.click(result.getByRole("button", { name: "Retry" }));

            expect(Child).toHaveBeenCalledTimes(attempts * 2);
            expect(execute).toHaveBeenCalledTimes(2);
            expect(result.getByRole("alert")).toBeDefined();

            shouldFail = false;
            fireEvent.click(result.getByRole("button", { name: "Retry" }));

            expect(result.getByText("Recovered content")).toBeDefined();
            expect(result.queryByRole("alert")).toBeNull();
        },
    );
});
