import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary.jsx";
import { ASSET_RECOVERY_ATTEMPT_KEY, STARTUP_RENDER_RECOVERY_ATTEMPT_KEY } from "./assetLoadRecovery.js";

vi.mock("./assetLoadRecovery.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        refreshApplicationAssets: vi.fn().mockResolvedValue(undefined),
        reloadCurrentPage: vi.fn(),
    };
});

import { refreshApplicationAssets, reloadCurrentPage } from "./assetLoadRecovery.js";

function FailingView({ message }) {
    throw new Error(message);
}

describe("AppErrorBoundary", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        window.history.replaceState({}, "", "/dashboard");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("automatically retries a stale lazy-loaded view once", async () => {
        render(
            <AppErrorBoundary>
                <FailingView message="Failed to fetch dynamically imported module" />
            </AppErrorBoundary>
        );

        expect(screen.getByRole("heading", { name: "Actualizando la aplicación" })).toBeInTheDocument();
        expect(screen.getByText(/Estamos actualizando la aplicación/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Actualizando aplicación…" })).toBeDisabled();
        expect(window.sessionStorage.getItem(ASSET_RECOVERY_ATTEMPT_KEY)).toBe("1");
        expect(refreshApplicationAssets).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(reloadCurrentPage).toHaveBeenCalledTimes(1));
    });

    it("automatically retries when a stale module is missing the requested export", async () => {
        render(
            <AppErrorBoundary>
                <FailingView message="The requested module './index.js' does not provide an export named 'default'" />
            </AppErrorBoundary>
        );

        expect(screen.getByText(/Estamos actualizando la aplicación/)).toBeInTheDocument();
        expect(refreshApplicationAssets).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(reloadCurrentPage).toHaveBeenCalledTimes(1));
    });

    it("automatically retries an unexpected error during the initial admin view load", async () => {
        window.history.replaceState({}, "", "/admin");
        vi.spyOn(window.performance, "now").mockReturnValue(1000);
        vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ startTime: 0 }]);

        render(
            <AppErrorBoundary>
                <FailingView message="Unexpected initial render error" />
            </AppErrorBoundary>
        );

        expect(screen.getByRole("heading", { name: "Recuperando la vista" })).toBeInTheDocument();
        expect(screen.getByText(/reintentando la carga una sola vez/)).toBeInTheDocument();
        expect(window.sessionStorage.getItem(STARTUP_RENDER_RECOVERY_ATTEMPT_KEY)).toBe("1");
        expect(refreshApplicationAssets).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(reloadCurrentPage).toHaveBeenCalledTimes(1));
    });

    it("does not automatically reload after the user edits a form", () => {
        window.history.replaceState({}, "", "/codes");
        vi.spyOn(window.performance, "now").mockReturnValue(1000);
        vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ startTime: 0 }]);

        function FailAfterInteraction() {
            const [failed, setFailed] = useState(false);
            if (failed) throw new Error("Unexpected render error after interaction");
            return (
                <>
                    <input aria-label="Draft" />
                    <button onClick={() => setFailed(true)}>Open view</button>
                </>
            );
        }

        render(
            <AppErrorBoundary>
                <FailAfterInteraction />
            </AppErrorBoundary>
        );
        fireEvent.input(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "unsaved text" } });
        fireEvent.click(screen.getByRole("button", { name: "Open view" }));

        expect(screen.getByText(/Ocurrió un error inesperado/)).toBeInTheDocument();
        expect(refreshApplicationAssets).not.toHaveBeenCalled();
        expect(reloadCurrentPage).not.toHaveBeenCalled();
    });

    it("shows a clear manual retry after the automatic attempt has already been used", async () => {
        window.sessionStorage.setItem(ASSET_RECOVERY_ATTEMPT_KEY, "1");

        render(
            <AppErrorBoundary>
                <FailingView message="Loading chunk 42 failed" />
            </AppErrorBoundary>
        );

        expect(screen.getByText(/después del intento automático/)).toBeInTheDocument();
        const retryButton = screen.getByRole("button", { name: "Intentar de nuevo" });
        expect(refreshApplicationAssets).not.toHaveBeenCalled();

        fireEvent.click(retryButton);

        expect(refreshApplicationAssets).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(reloadCurrentPage).toHaveBeenCalledTimes(1));
    });

    it("does not auto-reload for non-asset errors", () => {
        vi.spyOn(window.performance, "now").mockReturnValue(20_000);
        vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ startTime: 0 }]);

        render(
            <AppErrorBoundary>
                <FailingView message="Unexpected application error" />
            </AppErrorBoundary>
        );

        expect(screen.getByText(/Ocurrió un error inesperado/)).toBeInTheDocument();
        expect(refreshApplicationAssets).not.toHaveBeenCalled();
        expect(reloadCurrentPage).not.toHaveBeenCalled();
    });
});
