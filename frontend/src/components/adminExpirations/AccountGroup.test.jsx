import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AccountGroup from "./AccountGroup.jsx";

function renderAccountGroup(isAttended, navigate = vi.fn()) {
    const item = {
        id: 7288,
        platform_name: "Disney Premium",
        user_email: "customer@example.test",
        profile_number: 7,
        expires_date: "2026-10-30",
        is_attended: isAttended,
    };

    render(
        <table>
            <tbody>
                <AccountGroup
                    group={{ account_email: "account@example.test", rows: [item] }}
                    getDaysLeft={() => 5}
                    renderDaysBadge={(days) => <span>{days} días</span>}
                    toggleAttended={vi.fn()}
                    navigate={navigate}
                    allCollapsed={false}
                    attendedFilter="all"
                    savingIds={[]}
                />
            </tbody>
        </table>,
    );

    return { navigate };
}

describe("AccountGroup renewal action", () => {
    it("disables the renewal link after the expiration is attended", () => {
        const { navigate } = renderAccountGroup(1);
        const renewButton = screen.getByRole("button", { name: "Renovar →" });

        expect(renewButton).toBeDisabled();
        expect(renewButton).toHaveAttribute("title", "Cuenta atendida. Desmárcala para habilitar la renovación.");
        fireEvent.click(renewButton);
        expect(navigate).not.toHaveBeenCalled();
    });

    it("keeps renewal available for a pending expiration with remaining days", () => {
        const { navigate } = renderAccountGroup(0);
        const renewButton = screen.getByRole("button", { name: "Renovar →" });

        expect(renewButton).toBeEnabled();
        fireEvent.click(renewButton);
        expect(navigate).toHaveBeenCalledWith("/admin/renewals", { state: { orderId: 7288 } });
    });
});
