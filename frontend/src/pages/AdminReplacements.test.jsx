import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/api.js";
import { loadXlsx } from "../utils/loadXlsx.js";
import AdminReplacements from "./AdminReplacements.jsx";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: 1, name: "Admin" }, setUser: vi.fn() }) }));
vi.mock("../components/admin/AdminSidebar.jsx", () => ({ default: () => <aside /> }));
vi.mock("../api/api.js", () => ({ apiFetch: vi.fn(), apiLogout: vi.fn() }));
vi.mock("../utils/loadXlsx.js", () => ({ loadXlsx: vi.fn() }));

const sample = {
    id: 862,
    created_at: "2026-10-25T20:22:35.000Z",
    subscription_id: 8202,
    order_code: "ORD-TEST",
    platform_name: "Paramount Plus",
    user_name: "Cliente de prueba",
    user_email: "cliente@example.test",
    old_account_id: 9476,
    old_account_email: "old@example.test",
    new_account_id: 9483,
    new_account_email: "new@example.test",
    previousExpiresLabel: "2026-11-24",
    admin_email: "admin@example.test",
};

describe("admin replacement history", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiFetch.mockResolvedValue({
            ok: true,
            data: {
                items: [sample],
                platforms: [{ id: 12, name: "Paramount Plus" }],
                page: 1,
                total: 1,
                totalPages: 1,
            },
        });
    });

    it("filters by Bogota date range, platform and text", async () => {
        render(<AdminReplacements />);
        await screen.findByText("old@example.test");

        fireEvent.change(screen.getByLabelText("Fecha desde"), { target: { value: "2026-10-25" } });
        fireEvent.change(screen.getByLabelText("Fecha hasta"), { target: { value: "2026-10-25" } });
        fireEvent.change(screen.getByLabelText("Plataforma"), { target: { value: "12" } });
        fireEvent.change(screen.getByLabelText("Buscar reemplazos"), { target: { value: "ORD-TEST" } });
        fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

        await waitFor(() => {
            const requestedUrl = apiFetch.mock.calls.at(-1)[0];
            expect(requestedUrl).toContain("fromDate=2026-10-25");
            expect(requestedUrl).toContain("toDate=2026-10-25");
            expect(requestedUrl).toContain("platformId=12");
            expect(requestedUrl).toContain("q=ORD-TEST");
        });
        expect(screen.getByText("new@example.test")).toBeInTheDocument();
    });

    it("exports every filtered page with before and after account identifiers", async () => {
        const jsonToSheet = vi.fn((rows) => ({ rows }));
        const appendSheet = vi.fn();
        const writeFile = vi.fn();
        loadXlsx.mockResolvedValue({
            utils: {
                json_to_sheet: jsonToSheet,
                book_new: () => ({}),
                book_append_sheet: appendSheet,
            },
            writeFile,
        });

        render(<AdminReplacements />);
        await screen.findByText("old@example.test");
        fireEvent.change(screen.getByLabelText("Fecha desde"), { target: { value: "2026-10-25" } });
        fireEvent.change(screen.getByLabelText("Plataforma"), { target: { value: "12" } });
        fireEvent.change(screen.getByLabelText("Buscar reemplazos"), { target: { value: "ORD-TEST" } });
        fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));
        await waitFor(() => expect(apiFetch.mock.calls.at(-1)[0]).toContain("platformId=12"));

        apiFetch.mockResolvedValueOnce({ ok: true, data: { items: [sample], totalPages: 2 } });
        apiFetch.mockResolvedValueOnce({
            ok: true,
            data: { items: [{ ...sample, id: 863, old_account_id: 9001, new_account_id: 9002 }], totalPages: 2 },
        });
        fireEvent.click(screen.getByRole("button", { name: "Exportar Excel" }));

        await waitFor(() => expect(writeFile).toHaveBeenCalledOnce());
        const exportedRows = jsonToSheet.mock.calls[0][0];
        expect(exportedRows).toHaveLength(2);
        expect(exportedRows[0]).toMatchObject({
            "Cuenta anterior (ID)": 9476,
            "Cuenta anterior": "old@example.test",
            "Cuenta nueva (ID)": 9483,
            "Cuenta nueva": "new@example.test",
        });
        expect(exportedRows[1]).toMatchObject({ "Cuenta anterior (ID)": 9001, "Cuenta nueva (ID)": 9002 });
        const exportRequests = apiFetch.mock.calls.slice(-2).map(([url]) => url);
        expect(exportRequests[0]).toContain("page=1");
        expect(exportRequests[1]).toContain("page=2");
        for (const url of exportRequests) {
            expect(url).toContain("limit=200");
            expect(url).toContain("fromDate=2026-10-25");
            expect(url).toContain("platformId=12");
            expect(url).toContain("q=ORD-TEST");
        }
        expect(appendSheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), "Reemplazos");
        expect(writeFile.mock.calls[0][1]).toBe("Reemplazos_paramount-plus_2026-10-25_hoy.xlsx");
    });
});
