const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSaleNotificationMessage } = require("../src/services/telegramBot");

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
