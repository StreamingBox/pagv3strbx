import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/api.js";
import { loadXlsx } from "../utils/loadXlsx.js";
import AdminProviders from "./AdminProviders.jsx";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: 1, name: "Admin" }, setUser: vi.fn() }) }));
vi.mock("../components/admin/AdminSidebar.jsx", () => ({ default: () => <aside /> }));
vi.mock("../api/api.js", () => ({ apiFetch: vi.fn(), apiLogout: vi.fn() }));
vi.mock("../utils/loadXlsx.js", () => ({ loadXlsx: vi.fn() }));
vi.mock("animejs/scope", () => ({ createScope: () => ({ add: () => ({ revert: vi.fn() }) }) }));

const accounts = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, providerId: 1, providerName: "Proveedor A", platformId: 18,
    platformName: "Netflix Internacional", accountEmail: `account${index + 1}@example.com`,
    purchaseDate: "2026-09-01", expiresAt: index < 2 ? "2000-01-01" : "2099-01-01",
    cardRenewalDate: index === 11 ? "2000-01-02" : "2099-01-02", amount: 32723,
    currency: "COP", status: index === 0 ? "inactive" : "active",
    historyIds: [index + 1], historyTotal: 1, historySequence: 1,
    providerReportedAt: index === 11 ? "2026-09-30" : null,
}));

async function loadedPage() {
    render(<AdminProviders />);
    await screen.findByRole("button", { name: "Editar cuenta 12" });
    return screen.getByRole("button", { name: "Exportar todas" }).closest("section");
}

describe("saved provider account interface", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiFetch.mockImplementation(async (path) => ({
            ok: true,
            data: path === "/admin/providers" ? [{ id: 1, name: "Proveedor A", isActive: 1 }]
                : path === "/admin/provider-platforms" ? [{ id: 18, name: "Netflix Internacional" }]
                    : accounts,
        }));
    });

    it("keeps card renewal dates, reports, history and locale amounts visible", async () => {
        const section = await loadedPage();
        expect(within(section).getByRole("columnheader", { name: "Renovación tarjeta" })).toBeInTheDocument();
        expect(within(section).getByRole("columnheader", { name: "Histórico" })).toBeInTheDocument();
        expect(within(section).getByText("02/01/2000")).toBeInTheDocument();
        expect(within(section).getByText("Reportada")).toBeInTheDocument();
        expect(within(section).getAllByText("32.723 COP")).toHaveLength(10);
        expect(screen.getByText("Fecha renovación tarjeta")).toBeInTheDocument();
    });

    it("filters expired card renewals and reported accounts", async () => {
        const section = await loadedPage();
        fireEvent.change(screen.getByLabelText("Filtrar vencimientos de renovación de tarjeta"), { target: { value: "expired" } });
        fireEvent.change(screen.getByLabelText("Filtrar reportes al proveedor"), { target: { value: "reported" } });
        expect(within(section).getAllByRole("row")).toHaveLength(2);
        expect(within(section).getByText("account12@example.com")).toBeInTheDocument();
    });

    it("lists card renewal dates for active Netflix accounts only and filters by provider", async () => {
        const hboAccount = { ...accounts[1], id: 13, platformName: "HBO Max", accountEmail: "hbo@example.com" };
        const promoAccount = { ...accounts[2], id: 14, providerId: 2, providerName: "Proveedor B", platformName: "Promo", accountEmail: "netflix-promo@example.com", cardRenewalDate: "2026-10-10" };
        apiFetch.mockImplementation(async (path) => ({
            ok: true,
            data: path === "/admin/providers" ? [{ id: 1, name: "Proveedor A", isActive: 1 }, { id: 2, name: "Proveedor B", isActive: 1 }]
                : path === "/admin/provider-platforms" ? [{ id: 18, name: "Netflix Internacional" }]
                    : [...accounts, hboAccount, promoAccount],
        }));
        render(<AdminProviders />);

        await screen.findByText("Renovación de tarjeta · Netflix");
        const panel = document.querySelector(".admin-providers-card-renewal-panel");
        fireEvent.click(panel.querySelector("summary"));
        expect(within(panel).getByText("account12@example.com")).toBeInTheDocument();
        expect(within(panel).getAllByText(/Vencida hace/)).toHaveLength(2);
        expect(within(panel).getByText("netflix-promo@example.com")).toBeInTheDocument();
        expect(within(panel).queryByText("hbo@example.com")).not.toBeInTheDocument();

        fireEvent.change(within(panel).getByLabelText("Filtrar renovación de tarjeta por proveedor"), { target: { value: "2" } });
        expect(within(panel).getByText("netflix-promo@example.com")).toBeInTheDocument();
        expect(within(panel).queryByText("account12@example.com")).not.toBeInTheDocument();
    });

    it("excludes reported Streaming Box Netflix accounts from both renewal modules", async () => {
        const upcomingDate = new Date();
        upcomingDate.setDate(upcomingDate.getDate() + 3);
        const date = `${upcomingDate.getFullYear()}-${String(upcomingDate.getMonth() + 1).padStart(2, "0")}-${String(upcomingDate.getDate()).padStart(2, "0")}`;
        const reportedAccount = {
            ...accounts[3],
            id: 13,
            providerId: 4,
            providerName: "Streaming Box",
            accountEmail: "reported-netflix@example.com",
            expiresAt: date,
            cardRenewalDate: date,
            providerReportedAt: "2026-10-12 10:00",
        };
        apiFetch.mockImplementation(async (path) => ({
            ok: true,
            data: path === "/admin/providers"
                ? [{ id: 1, name: "Proveedor A", isActive: 1 }, { id: 4, name: "Streaming Box", isActive: 1 }]
                : path === "/admin/provider-platforms" ? [{ id: 18, name: "Netflix Internacional" }]
                    : [...accounts, reportedAccount],
        }));
        render(<AdminProviders />);

        await screen.findByText("Renovación de tarjeta · Netflix");
        const upcomingPanel = screen.getByText("Recordatorio de renovación").closest("details");
        const cardPanel = document.querySelector(".admin-providers-card-renewal-panel");
        fireEvent.click(upcomingPanel.querySelector("summary"));
        fireEvent.click(cardPanel.querySelector("summary"));

        expect(within(upcomingPanel).queryByText("reported-netflix@example.com")).not.toBeInTheDocument();
        expect(within(cardPanel).queryByText("reported-netflix@example.com")).not.toBeInTheDocument();
    });

    it("starts with the modules collapsed while keeping the accounts table available", async () => {
        const section = await loadedPage();
        const modules = [...document.querySelectorAll(".admin-providers-module")];
        expect(modules).toHaveLength(6);
        expect(modules.every((module) => !module.open)).toBe(true);
        expect(section).toBeVisible();
        expect(document.querySelector(".admin-providers-management-grid").compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

        const registeredProviders = modules[0];
        fireEvent.click(registeredProviders.querySelector("summary"));
        expect(registeredProviders.open).toBe(true);
        expect(within(registeredProviders).getByRole("columnheader", { name: "WhatsApp" })).toBeVisible();

        const ranking = modules[1];
        fireEvent.click(ranking.querySelector("summary"));
        expect(ranking.open).toBe(true);
        expect(within(ranking).getByText("Aún no hay proveedores para mostrar.")).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: "Editar" }));
        await waitFor(() => expect(modules[4].open).toBe(true));
    });

    it("shows additional pages and does not count overdue days for inactive accounts", async () => {
        const section = await loadedPage();
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        const inactiveRow = within(section).getByText("account1@example.com").closest("tr");
        const activeRow = within(section).getByText("account2@example.com").closest("tr");
        expect(within(inactiveRow).queryByText(/Vencida hace/)).not.toBeInTheDocument();
        expect(within(activeRow).getByText(/Vencida hace/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    });

    it("exports every account, includes card dates, and omits replacement history", async () => {
        const jsonToSheet = vi.fn(() => ({}));
        loadXlsx.mockResolvedValue({ utils: { json_to_sheet: jsonToSheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() });
        await loadedPage();
        fireEvent.click(screen.getByRole("button", { name: "Exportar todas" }));
        await waitFor(() => expect(jsonToSheet).toHaveBeenCalled());
        const rows = jsonToSheet.mock.calls[0][0];
        expect(rows).toHaveLength(12);
        expect(rows[0]["Renovación tarjeta"]).toBe("02/01/2000");
        expect(rows.at(-1)["Días restantes"]).toBe("");
        expect(Object.keys(rows[0])).not.toContain("Histórico");
    });
});
