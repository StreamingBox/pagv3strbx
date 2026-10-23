const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/db");
const { getSellableInventory } = require("../src/services/inventory.service");
const { __test: sellAccountTest } = require("../src/services/sellAccount.service");

test("inventario de venta usa equivalencias cuando no hay stock directo y no devuelve credenciales", async () => {
    const originalQuery = pool.query;
    const queries = [];
    pool.query = async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT fallback_platform_id")) {
            return [[{ fallback_platform_id: 43 }]];
        }
        if (sql.includes("GROUP BY pa.platform_id")) {
            return [[{ platform_id: 43, total: 3 }]];
        }
        if (sql.includes("SELECT pa.id, pa.platform_id, p.name AS platform_name")) {
            return [[{ id: 12, platform_id: 43, platform_name: "Netflix Internacional", sale_priority: 0 }]];
        }
        throw new Error(`Consulta inesperada: ${sql}`);
    };

    try {
        const result = await getSellableInventory({ platformId: "42", page: "1", limit: "20" });
        assert.equal(result.total, 3);
        assert.deepEqual(result.items, [
            { id: 12, platform_id: 43, platform_name: "Netflix Internacional", status: "available", sale_priority: false, used_fallback: true },
        ]);
        assert.match(queries[1].sql, /pa\.status = 'available'/);
        assert.match(queries[1].sql, /p\.is_active = 1/);
        assert.match(queries[1].sql, /pa\.expires_at IS NULL/);
        assert.deepEqual(queries[1].params, [42, 43]);
        assert.deepEqual(queries[2].params, [43, 43]);
    } finally {
        pool.query = originalQuery;
    }
});

test("prioriza el inventario directo igual que el catálogo aunque haya equivalencias", async () => {
    const originalQuery = pool.query;
    pool.query = async (sql) => {
        if (sql.includes("SELECT fallback_platform_id")) return [[{ fallback_platform_id: 43 }]];
        if (sql.includes("GROUP BY pa.platform_id")) {
            return [[{ platform_id: 42, total: 2 }, { platform_id: 43, total: 3 }]];
        }
        if (sql.includes("SELECT pa.id, pa.platform_id, p.name AS platform_name")) {
            return [[{ id: 11, platform_id: 42, platform_name: "Netflix", sale_priority: 1 }]];
        }
        throw new Error(`Consulta inesperada: ${sql}`);
    };

    try {
        const result = await getSellableInventory({ platformId: 42 });
        assert.equal(result.total, 2);
        assert.deepEqual(result.items.map((item) => item.platform_id), [42]);
        assert.equal(result.items[0].used_fallback, false);
    } finally {
        pool.query = originalQuery;
    }
});

test("inventario de venta rechaza platformId inválido antes de consultar la base", async () => {
    await assert.rejects(getSellableInventory({ platformId: "no-es-id" }), (error) => error.status === 400);
});

test("una venta solo acepta la plataforma del plan o una equivalencia devuelta por la configuración activa", () => {
    const candidates = [{ platformId: 42, source: "requested" }, { platformId: 43, source: "fallback" }];
    assert.equal(sellAccountTest.isAllowedDeliveryPlatform(42, 42, candidates), true);
    assert.equal(sellAccountTest.isAllowedDeliveryPlatform(42, 43, candidates), true);
    assert.equal(sellAccountTest.isAllowedDeliveryPlatform(42, 44, candidates), false);
    assert.equal(sellAccountTest.isAllowedDeliveryPlatform(0, 42, candidates), false);
});
