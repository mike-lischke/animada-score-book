import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../src/components/ui/ErrorBoundary.js";
import { requisitions } from "../../src/supplement/Requisitions.js";

describe("ErrorBoundary", { concurrent: false }, () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        Reflect.deleteProperty(navigator, "clipboard");
    });

    const renderFailure = (message: string) => {
        vi.spyOn(console, "error").mockImplementation(() => {
            return undefined;
        });
        vi.spyOn(requisitions, "execute").mockResolvedValue(true);
        const Crash = () => {
            throw new Error(message);
        };

        return render(<ErrorBoundary><Crash /></ErrorBoundary>);
    };

    const installClipboard = (writeText: (text: string) => Promise<void>) => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
    };

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

    it("shows a branded error page with recovery and reporting guidance", () => {
        const result = renderFailure("Something broke");

        expect(result.getByRole("alert")).toBeDefined();
        expect(result.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong");
        expect(result.getByText("Animada Score Book")).toBeDefined();
        expect(result.container.querySelector('img[src="/logo.svg"]')).not.toBeNull();

        expect(result.getByRole("button", { name: "Retry" })).toBeDefined();
        expect(result.getByRole("button", { name: "Reload app" })).toBeDefined();
        expect(result.getByText("Reloading restarts the app and may discard unsaved changes.")).toBeDefined();

        const reportLink = result.getByRole("link", { name: "Report this problem on GitHub" });
        expect(reportLink.getAttribute("href"))
            .toBe("https://github.com/mike-lischke/animada-score-book/issues/new");
        expect(reportLink.getAttribute("target")).toBe("_blank");
        expect(reportLink.getAttribute("rel")).toBe("noreferrer noopener");
    });

    it("keeps technical details collapsed and copies them on request", async () => {
        const writeText = vi.fn((text: string) => {
            return Promise.resolve();
        });
        installClipboard(writeText);
        const result = renderFailure("session.printedTracks is not a function");

        const details = result.container.querySelector("details.error-boundary-details");
        expect(details).not.toBeNull();
        expect((details as HTMLDetailsElement).open).toBe(false);
        expect(result.getByText("Technical details")).toBeDefined();

        const detailsText = result.container.querySelector("pre.error-boundary-details-text")?.textContent ?? "";
        expect(detailsText).toContain("session.printedTracks is not a function");

        fireEvent.click(result.getByRole("button", { name: "Copy details" }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledOnce();
        });

        expect(writeText).toHaveBeenCalledWith(detailsText);
        expect(result.getByRole("status").textContent).toBe("Copied to clipboard");
        expect(result.getByRole("button", { name: "Copied" })).toBeDefined();
    });

    it("redacts credentials from the technical details", () => {
        const result = renderFailure(
            "Request failed: /api?action=login&token=secret-token&password=hunter2 Bearer abc.def.ghi",
        );

        const detailsText = result.container.querySelector("pre.error-boundary-details-text")?.textContent ?? "";
        expect(detailsText).toContain("token=[redacted]");
        expect(detailsText).toContain("password=[redacted]");
        expect(detailsText).toContain("Bearer [redacted]");
        expect(detailsText).not.toContain("secret-token");
        expect(detailsText).not.toContain("hunter2");
        expect(detailsText).not.toContain("abc.def.ghi");
    });
});
