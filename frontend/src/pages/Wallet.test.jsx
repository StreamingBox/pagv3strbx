import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "../api/api";
import Wallet from "./Wallet";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
    useNavigate: () => navigate,
}));

vi.mock("../context/AuthContext.jsx", () => ({
    useAuth: () => ({ user: { id: 9, name: "Cliente Test" } }),
}));

vi.mock("../hooks/useAppLogout.js", () => ({
    default: () => vi.fn(),
}));

vi.mock("../api/api", () => ({
    apiGet: vi.fn(),
    apiGetTransactions: vi.fn(),
}));

vi.mock("../components/dashboard/Sidebar.jsx", () => ({
    default: () => <aside data-testid="sidebar" />,
}));

vi.mock("../components/wallet/TransactionsList.jsx", () => ({
    default: () => <section data-testid="transactions-list" />,
}));

describe("Wallet", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockResolvedValue({
            ok: true,
            data: {
                balance: 25000,
                profit_total: 9000,
                total_invested: 16000,
                currency: "COP",
            },
        });
    });

    it("carga y muestra saldo, ganancia e inversion en COP", async () => {
        render(<Wallet />);

        await waitFor(() => {
            expect(apiGet).toHaveBeenCalledWith("/wallet");
        });

        expect(screen.getByText("Saldo y movimientos")).toBeInTheDocument();
        expect(screen.getByText("25.000")).toBeInTheDocument();
        expect(screen.getByText("9.000")).toBeInTheDocument();
        expect(screen.getByText("16.000")).toBeInTheDocument();
        expect(screen.getAllByText("COP").length).toBeGreaterThan(0);
        expect(screen.getByTestId("transactions-list")).toBeInTheDocument();
    });
});
