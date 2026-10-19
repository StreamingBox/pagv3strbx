import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PricesTable from "./PricesTable";

vi.mock("./PriceRow", () => ({ default: () => null }));

function renderPricesTable(overrides = {}) {
    const props = {
        prices: [],
        loading: false,
        saving: false,
        page: 1,
        limit: 5,
        total: 0,
        totalPages: 1,
        q: "netflix",
        setQ: vi.fn(),
        status: "all",
        setStatus: vi.fn(),
        onToggleAll: vi.fn(),
        onSaveMulti: vi.fn(),
        loadAll: vi.fn(),
        ...overrides,
    };
    render(<PricesTable {...props} />);
    return props;
}

describe("PricesTable status filter", () => {
    it("loads the selected status while preserving the search query", () => {
        const props = renderPricesTable();

        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar precios por estado" }), {
            target: { value: "active" },
        });

        expect(props.setStatus).toHaveBeenCalledWith("active");
        expect(props.loadAll).toHaveBeenCalledWith(1, 5, "netflix", "active");
    });

    it("clears both the search and status filters", () => {
        const props = renderPricesTable({ status: "inactive" });

        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));

        expect(props.setQ).toHaveBeenCalledWith("");
        expect(props.setStatus).toHaveBeenCalledWith("all");
        expect(props.loadAll).toHaveBeenCalledWith(1, 5, "", "all");
    });
});
