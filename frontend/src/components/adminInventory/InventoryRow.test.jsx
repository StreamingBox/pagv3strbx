import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InventoryRow from "./InventoryRow.jsx";

vi.mock("framer-motion", () => ({
    motion: { tr: "tr" },
    AnimatePresence: ({ children }) => children,
}));

describe("InventoryRow profile summary", () => {
    it("shows the latest row per profile and keeps older rows behind history", () => {
        const account = {
            id: 1,
            platform_name: "Netflix",
            email: "account@example.test",
            status: "assigned",
            expires_at: "2026-12-31",
        };
        const profiles = [
            { id: 1, identity_id: 10, profile_number: 1, state: "replaced", updated_at: "2026-01-01T00:00:00Z" },
            { id: 2, identity_id: 10, profile_number: 1, state: "occupied", updated_at: "2026-02-01T00:00:00Z" },
            { id: 3, identity_id: 20, profile_number: 2, state: "available", updated_at: "2026-02-01T00:00:00Z" },
        ];

        render(
            <table>
                <tbody>
                    <InventoryRow
                        it={account}
                        detail={{ account, profiles, replacements: [], subscriptions: [], timeline: [] }}
                        detailLoading={false}
                        detailError=""
                        idx={0}
                        saving={false}
                        onOpenDetail={vi.fn()}
                        onUpdate={vi.fn()}
                        onEdit={vi.fn()}
                        onSell={vi.fn()}
                        onSupport={vi.fn()}
                    />
                </tbody>
            </table>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Credenciales" }));

        expect(screen.getByText("Perfiles más recientes")).toBeInTheDocument();
        expect(screen.getAllByText("Perfil 1")).toHaveLength(1);
        expect(screen.getByText(/fila consultada es una versión anterior/)).toBeInTheDocument();
        const history = document.getElementById("inventory-profile-history-1");
        expect(history).toHaveAttribute("hidden");
        expect(history).toBeEmptyDOMElement();

        fireEvent.click(screen.getByRole("button", { name: /Historial anterior \(1\)/ }));

        expect(screen.getAllByText("Perfil 1")).toHaveLength(2);
        expect(history).not.toHaveAttribute("hidden");
        expect(screen.getByText("Versiones anteriores").parentElement).toBeVisible();
    });
});
