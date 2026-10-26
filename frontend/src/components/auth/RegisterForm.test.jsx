import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RegisterForm from "./RegisterForm.jsx";

const props = { S: { regSide: () => ({}), relativeWrap: {}, input: {}, heading: {} }, C: { muted: "gray" }, isRegister: true, name: "", email: "", password: "", confirmPassword: "", setName: vi.fn(), setEmail: vi.fn(), setPassword: vi.fn(), setConfirmPassword: vi.fn(), setAcceptedTerms: vi.fn(), onSubmit: vi.fn(), referralCode: "SB0123456789", setReferralCode: vi.fn(), setReferralConsent: vi.fn() };
describe("referral registration field", () => {
    it("preserves and normalizes an optional referral code", () => {
        render(<RegisterForm {...props} referralCampaign={{ active: true }} />);
        const input = screen.getByLabelText("Código de referido (opcional)");
        expect(input).toHaveValue("SB0123456789");
        fireEvent.change(input, { target: { value: "sb-0123456789" } });
        expect(props.setReferralCode).toHaveBeenCalledWith("SB0123456789");
    });
    it("does not promise a reward when the campaign is paused", () => {
        render(<RegisterForm {...props} referralCampaign={{ active: false }} />);
        expect(screen.getByText(/Este registro no generará un premio/)).toBeInTheDocument();
    });
    it("requires explicit contact and progress consent for a participating registration", () => {
        render(<RegisterForm {...props} referralCampaign={{ active: true }} />);
        const consent = screen.getByRole("checkbox", { name: /Autorizo a quien me invita/ });
        expect(consent).toBeRequired(); expect(consent).not.toBeChecked();
        fireEvent.click(consent);
        expect(props.setReferralConsent).toHaveBeenCalledWith(true);
    });
    it("prefills and locks the invited email and shows the single-use referral terms", () => {
        render(<RegisterForm {...props} email="invitee@example.test" referralInvite={{ status: "valid", inviterName: "Synthetic Inviter", campaign: { active: true } }} referralCampaign={{ active: false }} />);
        expect(screen.getByLabelText("Email")).toHaveValue("invitee@example.test");
        expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
        expect(screen.getByText("Synthetic Inviter")).toBeInTheDocument();
        expect(screen.getByText(/te invitó a registrarte/)).toBeInTheDocument();
        expect(screen.getByText(/solo podrá usarse una vez/)).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /Autorizo a quien me invita/ })).toBeRequired();
        expect(screen.queryByLabelText("Código de referido (opcional)")).not.toBeInTheDocument();
    });
    it("blocks registration while a personal invitation cannot be validated", () => {
        render(<RegisterForm {...props} referralInvite={{ status: "invalid", message: "Invitación no disponible" }} />);
        expect(screen.getByRole("alert")).toHaveTextContent("Invitación no disponible");
        expect(screen.getByRole("button", { name: "Registrarse" })).toBeDisabled();
        expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    });
});
