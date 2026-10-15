module.exports = {
    id: "053_orders_order_code_search_indexes",
    name: "Index order-code lookups used by renewals",
    async up({ query }) {
        const [columns] = await query("SHOW COLUMNS FROM orders");

        if (!columns.some((column) => column.Field === "order_code_suffix")) {
            await query(
                "ALTER TABLE orders ADD COLUMN order_code_suffix VARCHAR(6) GENERATED ALWAYS AS (RIGHT(order_code, 6)) STORED"
            );
        }

        const indexes = [
            ["idx_orders_order_code", "CREATE INDEX idx_orders_order_code ON orders(order_code)"],
            ["idx_orders_order_code_suffix", "CREATE INDEX idx_orders_order_code_suffix ON orders(order_code_suffix)"],
        ];

        for (const [name, statement] of indexes) {
            const [existing] = await query(
                "SHOW INDEX FROM orders WHERE Key_name = ?",
                [name]
            );
            if (!existing.length) await query(statement);
        }
    },
};
