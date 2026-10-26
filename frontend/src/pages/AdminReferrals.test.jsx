import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiFetch } from "../api/api";
import { loadXlsx } from "../utils/loadXlsx.js";
import AdminReferrals from "./AdminReferrals.jsx";

vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: 1, role: "admin" } }) }));
vi.mock("../hooks/useAppLogout.js", () => ({ default: () => vi.fn() }));
vi.mock("../components/admin/AdminSidebar.jsx", () => ({ default: () => <aside /> }));
vi.mock("../api/api", () => ({ apiGet: vi.fn(), apiFetch: vi.fn() }));
vi.mock("../utils/loadXlsx.js", () => ({ loadXlsx: vi.fn() }));

const settings = { enabled: false, rewardAmount: 10000, minimumTopup: 50000, attributionDays: 30, monthlyRewardLimit: 0, monthlyBudget: 0, startsAt: null, endsAt: null, version: 1 };
const item = { id: 10, status: "review", reason: "monthly_budget", referrerName: "Synthetic Referrer", referrerEmail: "referrer@example.test", referredName: "Synthetic Invitee", referredEmail: "invited@example.test", rewardAmount: 10000, minimumTopup: 50000, progressAmount: 50000, remainingAmount: 0, contactSharing: true, settingsVersion: 1, qualifyingTopupId: 8, createdAt: "2026-10-26T12:00:00Z", expiresAt: "2026-11-25T12:00:00Z" };
const history = { items: [item], total: 1, totalPages: 1, page: 1, summary: { total: 1, review: 1, pending: 0, awarded: 0 } };
describe("admin referrals", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiGet.mockImplementation(async path => ({ ok: true, data: path.includes("/settings") ? { settings, campaign: { active: false }, monthlyAwarded: 0, audit: [] } : path === "/admin/referrals/10" ? { item, events: [{ action: "review", detail: JSON.stringify({ reason: "monthly_budget" }), createdAt: item.createdAt }] } : history }));
        apiFetch.mockResolvedValue({ ok: true, data: { settings, campaign: { active: false }, result: { status: "credited" } } });
    });
    it("filters on demand and exports the filtered records as Excel", async () => {
        const jsonToSheet = vi.fn(() => ({})); const writeFile = vi.fn();
        loadXlsx.mockResolvedValue({ utils: { json_to_sheet: jsonToSheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile });
        render(<AdminReferrals />);
        await screen.findByText("referrer@example.test");
        fireEvent.change(screen.getByLabelText("Cliente, correo o ID"), { target: { value: "synthetic" } });
        fireEvent.change(screen.getByLabelText("Registro desde"), { target: { value: "2026-10-26" } });
        fireEvent.click(screen.getByRole("button", { name: "Filtrar referidos" }));
        await waitFor(() => expect(apiGet.mock.calls.at(-1)[0]).toContain("search=synthetic"));
        fireEvent.click(screen.getByRole("button", { name: "Exportar Excel" }));
        await waitFor(() => expect(writeFile).toHaveBeenCalled());
        expect(apiGet.mock.calls.some(([path]) => path.startsWith("/admin/referrals/export?") && path.includes("from=2026-10-26"))).toBe(true);
        expect(jsonToSheet.mock.calls[0][0][0]["Correo invitado"]).toBe("invited@example.test");
    });
    it("saves explicit activation, money and dates with a configuration version", async () => {
        render(<AdminReferrals />);
        fireEvent.click(screen.getByRole("tab", { name: "Configuración" }));
        const reward = await screen.findByLabelText("Premio para quien invita (COP)");
        expect(screen.getByRole("switch")).not.toBeChecked();
        fireEvent.change(reward, { target: { value: "5000" } });
        fireEvent.click(screen.getByRole("switch"));
        fireEvent.change(screen.getByLabelText("Inicio (hora de Colombia)"), { target: { value: "2026-11-01T09:00" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar campaña" }));
        await waitFor(() => expect(apiFetch).toHaveBeenCalled());
        const body = JSON.parse(apiFetch.mock.calls[0][1].body);
        expect(body.enabled).toBe(true); expect(body.rewardAmount).toBe(5000);
        expect(body.expectedVersion).toBe(1); expect(body).not.toHaveProperty("version");
        expect(body.startsAt).toBe("2026-11-01T14:00:00.000Z");
    });
    it("requires a cancellation reason and offers controlled reevaluation", async () => {
        render(<AdminReferrals />);
        await screen.findByText("referrer@example.test");
        fireEvent.click(screen.getByRole("button", { name: "Detalle del referido #10" }));
        expect(await screen.findByRole("button", { name: "Reevaluar premio" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Cancelar premio" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "Solicitud de prueba cancelada" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancelar premio" }));
        await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/referrals/10/cancel", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Solicitud de prueba cancelada" }) })));
    });
    it("shows stale-edit failures without discarding unsaved values", async () => {
        apiFetch.mockResolvedValue({ ok: false, data: { message: "La campaña cambió en otra sesión." } });
        render(<AdminReferrals />);
        fireEvent.click(screen.getByRole("tab", { name: "Configuración" }));
        const reward = await screen.findByLabelText("Premio para quien invita (COP)");
        fireEvent.change(reward, { target: { value: "6000" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar campaña" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("otra sesión");
        expect(reward).toHaveValue(6000);
    });
});
