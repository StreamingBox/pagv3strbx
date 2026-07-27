import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PlatformProfitView from "./PlatformProfitView";

describe("PlatformProfitView", () => {
    it("marca como pendiente una plataforma que todavia no tiene costo compatible", () => {
        render(
            <PlatformProfitView
                isMobile={false}
                trackingStartLabel="12 de junio de 2026"
                data={{
                    currency: "COP",
                    totals: {
                        salesCount: 6,
                        revenueTotal: 120000,
                        trackedSalesCount: 4,
                        trackedRevenue: 80000,
                        costTotal: 30000,
                        netProfit: 50000,
                        marginPct: 62.5,
                        untrackedSalesCount: 2,
                    },
                    platforms: [
                        {
                            platformId: 1,
                            platformName: "Netflix",
                            salesCount: 4,
                            revenueTotal: 80000,
                            trackedSalesCount: 4,
                            trackedRevenue: 80000,
                            costTotal: 30000,
                            netProfit: 50000,
                            marginPct: 62.5,
                            untrackedSalesCount: 0,
                            untrackedRevenue: 0,
                        },
                        {
                            platformId: 2,
                            platformName: "Max",
                            salesCount: 2,
                            revenueTotal: 40000,
                            trackedSalesCount: 0,
                            trackedRevenue: 0,
                            costTotal: 0,
                            netProfit: 0,
                            marginPct: 0,
                            untrackedSalesCount: 2,
                            untrackedRevenue: 40000,
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText("Rentabilidad por plataforma")).toBeInTheDocument();
        expect(screen.getByText("2 ventas necesitan costo o moneda compatible.")).toBeInTheDocument();
        expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText("Buscar plataforma"), { target: { value: "Netflix" } });
        expect(screen.getByText("Netflix")).toBeInTheDocument();
        expect(screen.queryByText("Max")).not.toBeInTheDocument();
    });
});
