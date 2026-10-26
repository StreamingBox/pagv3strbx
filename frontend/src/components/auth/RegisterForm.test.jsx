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
});
