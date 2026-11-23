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
                monthToDateSales: 272, previousMonthSales: 277, monthlyChangePercent: -1.8,
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

const profitability = {
    currency: "COP",
    platforms: [
        { platformId: 18, salesCount: 3, trackedSalesCount: 3, untrackedSalesCount: 0, revenueTotal: 100000, trackedRevenue: 100000, netProfit: 40000 },
        { platformId: 19, salesCount: 2, trackedSalesCount: 1, untrackedSalesCount: 1, revenueTotal: 50000, trackedRevenue: 20000, netProfit: 10000 },
        { platformId: 3, salesCount: 1, trackedSalesCount: 1, untrackedSalesCount: 0, revenueTotal: 24000, trackedRevenue: 24000, netProfit: 12000 },
    ],
};

describe("AdminStockPlanning views and platform filter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockImplementation((url) => Promise.resolve(url.startsWith("/admin/analytics/platform-profit")
            ? { ok: true, data: profitability }
            : { ok: true, data: planning }));
    });

    it("opens with the profitability heatmap and keeps one table active across all three views", async () => {
        render(<AdminStockPlanning />);
        await screen.findByRole("row", { name: /Netflix \+ Netflix Internacional/ });

        expect(screen.getByRole("button", { name: /Ventas/ })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("columnheader", { name: "Utilidad neta · COP" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Diferencia de ventas" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Margen registrado" })).not.toBeInTheDocument();
        expect(await screen.findAllByText(/50\.000/)).toHaveLength(2);
        expect(screen.getByText("5 / 6")).toBeInTheDocument();
        expect(screen.getByText("Vender y reponer")).toBeInTheDocument();
        expect(screen.getByText("Priorizar venta")).toBeInTheDocument();
        const netflixRow = screen.getByRole("row", { name: /Netflix \+ Netflix Internacional/ });
        expect(within(netflixRow).getByText("5 menos")).toBeInTheDocument();
        expect(within(netflixRow).getByText("277 mismo tramo del mes pasado")).toBeInTheDocument();
        expect(within(netflixRow).getByText("-1,8% vs. periodo comparable")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Glosario: cómo leer estas cifras"));
        expect(screen.getByText(/La misma cantidad de días transcurridos del mes anterior/)).toBeInTheDocument();
        expect(screen.getByText(/es una guía, no una orden de compra/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Necesidad/ }));
        expect(screen.getByRole("columnheader", { name: "Vencen en el periodo" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Utilidad neta · COP" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Reposición/ }));
        expect(screen.getByRole("columnheader", { name: "Ritmo últimos 14 días" })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Utilidad neta · COP" })).not.toBeInTheDocument();
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
        expect(screen.getAllByText(/12\.000/).length).toBeGreaterThan(0);
        expect(screen.getByText("Priorizar venta")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Reposición/ }));
        expect(screen.getByRole("row", { name: /HBO Max/ })).toBeInTheDocument();
        expect(screen.queryByRole("row", { name: /Netflix \+ Netflix Internacional/ })).not.toBeInTheDocument();
    });
});
