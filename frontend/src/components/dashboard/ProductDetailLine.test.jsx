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
});
