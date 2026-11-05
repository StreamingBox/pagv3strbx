import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ProductDetailLine from "./ProductDetailLine.jsx";

afterEach(cleanup);

describe("ProductDetailLine", () => {
    it("renders marked terms as emphasis and keeps text escaped", () => {
        const { container } = render(
            <ProductDetailLine>Antes **IMPORTANTE: $4.000 COP** &lt;script&gt;alert(1)&lt;/script&gt;</ProductDetailLine>
        );

        expect(container.querySelector("strong")?.textContent).toBe("IMPORTANTE: $4.000 COP");
        expect(container.querySelector("script")).toBeNull();
        expect(container.textContent).toContain("<script>alert(1)</script>");
    });

    it("highlights the Google AI PLUS trial eligibility condition", () => {
        const { container } = render(
            <ProductDetailLine>**PRUEBA: Solo funciona en cuentas de Google que no tengan planes anteriores ni planes activos.**</ProductDetailLine>
        );

        expect(container.querySelector("strong")?.textContent).toBe(
            "PRUEBA: Solo funciona en cuentas de Google que no tengan planes anteriores ni planes activos."
        );
    });
});
