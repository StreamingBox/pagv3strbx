import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiFetch } from "../api/api";
import Referrals from "./Referrals.jsx";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: 7, role: "user" } }) }));
vi.mock("../hooks/useAppLogout.js", () => ({ default: () => vi.fn() }));
vi.mock("../components/dashboard/Sidebar.jsx", () => ({ default: () => <aside /> }));
vi.mock("../api/api", () => ({ apiGet: vi.fn(), apiFetch: vi.fn() }));

const data = {
    eligible: true, code: "SB0123456789", shareUrl: "https://example.test/register?ref=SB0123456789",
    campaign: { active: true, rewardAmount: 10000, minimumTopup: 50000, attributionDays: 30 },
    items: [{ id: 10, status: "pending", rewardAmount: 10000, minimumTopup: 50000, progressAmount: 20000, remainingAmount: 30000, contactSharing: true, referredName: "Invitado de prueba", referredEmail: "invited@example.test", createdAt: "2026-10-26T12:00:00Z", expiresAt: "2026-11-25T12:00:00Z" }],
    total: 1, page: 1, totalPages: 1, summary: { total: 1, pending: 0, credited: 1, awarded: 5000 },
};
describe("client referrals", () => {
    beforeEach(() => { vi.clearAllMocks(); apiGet.mockImplementation(async path => ({ ok: true, data: path === "/wallet" ? { balance: 10000, currency: "COP" } : data })); });
    it("shows personal sharing, credited rewards and bounded history", async () => {
        const copy = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
        render(<Referrals />);
        expect(await screen.findByText("$10.000 COP por cada referido válido")).toBeInTheDocument();
        expect(screen.getByText("Faltan $30.000 COP")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Escribir" })).toHaveAttribute("href", expect.stringContaining("invited%40example.test"));
        expect(screen.getByRole("link", { name: "Compartir" })).toHaveAttribute("rel", "noopener noreferrer");
        fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
        await waitFor(() => expect(copy).toHaveBeenCalledWith(data.shareUrl));
        expect(await screen.findByText("Enlace copiado.")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "review" } });
        await waitFor(() => expect(apiGet.mock.calls.at(-1)[0]).toContain("status=review"));
    });
    it("does not offer sharing while paused but preserves history", async () => {
        apiGet.mockResolvedValue({ ok: true, data: { ...data, campaign: { ...data.campaign, active: false } } });
        render(<Referrals />);
        expect(await screen.findByText("Campaña pausada")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Copiar enlace" })).not.toBeInTheDocument();
        expect(screen.getByText("#10")).toBeInTheDocument();
    });
    it("reports load failures and allows retry", async () => {
        apiGet.mockResolvedValue({ ok: false, data: { message: "Synthetic network failure" } });
        render(<Referrals />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic network failure");
        apiGet.mockResolvedValue({ ok: true, data });
        fireEvent.click(screen.getByRole("button", { name: "Actualizar referidos" }));
        expect(await screen.findByText("$10.000 COP por cada referido válido")).toBeInTheDocument();
    });
    it("hides contact and progress after an invitation's consent is revoked", async () => {
        apiGet.mockResolvedValue({ ok: true, data: { ...data, items: [{ ...data.items[0], contactSharing: false, referredName: null, referredEmail: null, progressAmount: null, remainingAmount: null }] } });
        render(<Referrals />);
        expect(await screen.findByText("Avance no compartido")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Escribir" })).not.toBeInTheDocument();
    });
    it("allows the invited client to withdraw contact sharing without changing the reward", async () => {
        apiGet.mockResolvedValue({ ok: true, data: { ...data, invitation: { progressAmount: 20000, targetAmount: 50000, expiresAt: data.items[0].expiresAt, contactSharing: true } } });
        apiFetch.mockResolvedValue({ ok: true, data: {} });
        render(<Referrals />);
        const toggle = await screen.findByRole("switch");
        fireEvent.click(toggle);
        await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/referrals/contact-consent", expect.objectContaining({ method: "PUT", body: JSON.stringify({ consent: false }) })));
    });
    it("restores consent when the server could not save the change", async () => {
        apiGet.mockResolvedValue({ ok: true, data: { ...data, invitation: { progressAmount: 20000, targetAmount: 50000, expiresAt: data.items[0].expiresAt, contactSharing: true } } });
        apiFetch.mockResolvedValue({ ok: false, data: { message: "Synthetic consent save failure" } });
        render(<Referrals />);
        const toggle = await screen.findByRole("switch");
        fireEvent.click(toggle);
        expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic consent save failure");
        expect(toggle).toBeChecked();
    });
});
