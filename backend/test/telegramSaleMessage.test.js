const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDailySalesMessage,
    buildSaleNotificationMessage,
} = require("../src/services/telegramBot");

test("el resumen diario conserva la hora calendario de Colombia y segmenta la moneda", () => {
    const message = buildDailySalesMessage([
        {
            currency: "COP",
            sale_count: 2,
            item_count: 3,
            total_sales: 16000,
            cost_total: 7000,
            provider_profit: 1500,
            own_profit: 9000,
            missing_cost_items: 0,
        },
        {
            currency: "USD",
            sale_count: 1,
            item_count: 1,
            total_sales: 20,
            cost_total: 8,
            provider_profit: 2,
            own_profit: 12,
            missing_cost_items: 0,
        },
    ], "2026-09-10");

    assert.match(message, /10\/09\/2026/);
    assert.match(message, /Ventas: \*3\*/);
    assert.match(message, /Ganancia proveedor/);
    assert.match(message, /Ganancia propia/);
    assert.match(message, /COP/);
    assert.match(message, /USD/);
});

test("la alerta de Telegram muestra costo cargado y ganancia real", () => {
    const message = buildSaleNotificationMessage({
        seller: "Jennifer",
        platforms: ["CapCut Pro"],
        total: 8000,
        currency: "COP",
        discount: 8000,
        providerProfit: 0,
        newBalance: 12000,
        orderCode: "ORD-TEST",
        costTotal: 3500,
        profitTotal: 4500,
        costComplete: true,
    });

    assert.match(message, /Total/);
    assert.match(message, /Descuento/);
    assert.match(message, /Ganancia proveedor/);
    assert.match(message, /Costo de cuenta/);
    assert.match(message, /3\\\.500/);
    assert.match(message, /Ganancia propia/);
    assert.match(message, /4\\\.500/);
    assert.match(message, /DETALLE DE LA VENTA/);
    assert.match(message, /COSTOS Y GANANCIAS/);
    assert.match(message, /SALDO Y TRAZABILIDAD/);
    assert.match(message, /Descuento:[^\n]+\n\n📊/);
});

test("la alerta avisa cuando falta costo de alguna cuenta", () => {
    const message = buildSaleNotificationMessage({
        seller: "Jennifer",
        platforms: ["Netflix", "Spotify"],
        total: 16000,
        currency: "COP",
        discount: 16000,
        providerProfit: 2500,
        newBalance: 0,
        orderCode: "ORD-TEST-2",
        costTotal: 4000,
        profitTotal: 12000,
        costComplete: false,
    });

    assert.match(message, /Costo de cuenta/);
    assert.match(message, /incompleto/);
    assert.match(message, /Ganancia propia.*Pendiente/);
    assert.match(message, /Ganancia proveedor/);
});
