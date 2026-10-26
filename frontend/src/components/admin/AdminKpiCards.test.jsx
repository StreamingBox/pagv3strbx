import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../api/api.js";
import AdminKpiCards from "./AdminKpiCards.jsx";

vi.mock("../../api/api.js", () => ({ apiFetch: vi.fn() }));
vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }) => <div {...Object.fromEntries(Object.entries(props).filter(([key]) => !["initial", "animate", "transition", "variants", "whileHover", "whileTap"].includes(key)))}>{children}</div>,
    },
}));

describe("admin dashboard shortcuts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiFetch.mockResolvedValue({ ok: true, data: { counts: {}, latest: [] } });
    });

    it("shows the referrals module and opens its admin route", () => {
        const onNavigate = vi.fn();
        render(<AdminKpiCards onNavigate={onNavigate} />);

        const referralsTitle = screen.getByText("Referidos");
        expect(screen.getByText("Campaña, avances y premios.")).toBeInTheDocument();
        fireEvent.click(referralsTitle.closest(".stitch-beam-container"));

        expect(onNavigate).toHaveBeenCalledWith("/admin/referrals");
    });
});
