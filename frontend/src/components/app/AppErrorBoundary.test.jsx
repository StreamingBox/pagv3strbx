import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary.jsx";
import { ASSET_RECOVERY_ATTEMPT_KEY } from "./assetLoadRecovery.js";

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

        expect(screen.getByRole("heading", { name: "No se pudo cargar esta vista" })).toBeInTheDocument();
        expect(screen.getByText(/Estamos actualizando la aplicación/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Actualizando aplicación…" })).toBeDisabled();
        expect(window.sessionStorage.getItem(ASSET_RECOVERY_ATTEMPT_KEY)).toBe("1");
        expect(refreshApplicationAssets).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(reloadCurrentPage).toHaveBeenCalledTimes(1));
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
