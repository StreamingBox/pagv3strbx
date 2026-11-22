import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../api/api.js";
import AdminStockPlanning from "./AdminStockPlanning.jsx";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: 1, name: "Admin" } }) }));
vi.mock("../hooks/useAppLogout.js", () => ({ default: () => vi.fn() }));
vi.mock("../components/admin/AdminSidebar.jsx", () => ({ default: () => <aside /> }));
vi.mock("../api/api.js", () => ({ apiGet: vi.fn() }));

const planning = {
    targetDate: "2026-11-28",
    daysAhead: 7,
    salesPeriods: { monthToDateDays: 20, previousMonthDays: 20 },
    rows: [
        {
            platformId: "18+19", platformName: "Netflix + Netflix Internacional", historicalSales: 375,
            averageDailySales: 12.5, expiringSubscriptions: 130, estimatedDemand: 125,
            availableStock: 31, suggestedToReplenish: 94,
            salesTrend: {
                recent7Sales: 60, previous7Sales: 99, weeklyChangePercent: -39.4,
                monthToDateSales: 245, previousMonthSales: 257, monthlyChangePercent: -4.7,
                replenishment: { recent7: 55, recent14: 83, monthToDate: 92, selectedHistory: 94 },
            },
        },
        {
            platformId: 3, platformName: "HBO Max", historicalSales: 10,
            averageDailySales: 0.33, expiringSubscriptions: 2, estimatedDemand: 2,
            availableStock: 4, suggestedToReplenish: 0,
            salesTrend: {
                recent7Sales: 1, previous7Sales: 2, weeklyChangePercent: -50,
                monthToDateSales: 4, previousMonthSales: 5, monthlyChangePercent: -20,
                replenishment: { recent7: 0, recent14: 0, monthToDate: 0, selectedHistory: 0 },
            },
        },
    ],
};

describe("AdminStockPlanning views and platform filter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue({ ok: true, data: planning });
    });

    it("shows one table at a time across the three view buttons", async () => {
        render(<AdminStockPlanning />);
        await screen.findByRole("row", { name: /Netflix \+ Netflix Internacional/ });

        expect(screen.getByRole("button", { name: /Necesidad/ })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("columnheader", { name: "Vencen en el periodo" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Cambio mensual" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
        expect(screen.getByRole("button", { name: /Ventas/ })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("columnheader", { name: "Cambio mensual" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Vencen en el periodo" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Reposición/ }));
        expect(screen.getByRole("columnheader", { name: "Ritmo últimos 14 días" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Cambio mensual" })).not.toBeInTheDocument();
    });

    it("filters the active table and summary metrics, and keeps the selection across views", async () => {
        render(<AdminStockPlanning />);
        await screen.findByRole("row", { name: /Netflix \+ Netflix Internacional/ });

        fireEvent.change(screen.getByLabelText("Filtrar por plataforma"), { target: { value: "3" } });
        expect(screen.getByRole("row", { name: /HBO Max/ })).toBeInTheDocument();
        expect(screen.queryByRole("row", { name: /Netflix \+ Netflix Internacional/ })).not.toBeInTheDocument();
        expect(screen.getByText("1 de 2 grupos")).toBeInTheDocument();
        const demand = document.querySelector(".stock-planning-metric--demand");
        expect(within(demand).getByText("2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
        expect(screen.getByRole("row", { name: /HBO Max/ })).toBeInTheDocument();
        expect(screen.queryByRole("row", { name: /Netflix \+ Netflix Internacional/ })).not.toBeInTheDocument();
    });
});
