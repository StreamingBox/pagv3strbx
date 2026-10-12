const test = require("node:test");
const assert = require("node:assert/strict");

const { __test: inventoryTest } = require("../src/services/inventory.service");

test("buscar una dirección de correo filtra por prefijo y la ordena por vencimiento descendente", () => {
    const result = inventoryTest.buildInventoryWhere({
        q: "cuentastrbx@gmail.com",
        assignedTo: "",
    });

    assert.equal(result.whereSql, "WHERE pa.email LIKE ?");
    assert.equal(result.params[0], "cuentastrbx@gmail.com%");
    assert.match(inventoryTest.inventoryOrderBy("cuentastrbx@gmail.com"), /ORDER BY CASE WHEN EXISTS \([\s\S]*THEN 0 ELSE 1 END ASC, CASE WHEN active_sub\.expires_at IS NOT NULL THEN DATE\(active_sub\.expires_at\)/);
    assert.match(inventoryTest.inventoryOrderBy("cuentastrbx@gmail.com"), /DESC, pa\.id DESC$/);
    assert.match(inventoryTest.inventoryOrderBy("Netflix"), /ORDER BY CASE WHEN EXISTS \([\s\S]*THEN 0 ELSE 1 END ASC, pa\.id DESC$/);
    assert.equal(inventoryTest.isEmailSearchQuery("cuentastrbx@gmail.com"), true);
});

test("el buscador general conserva sus campos y no mezcla el correo del usuario asignado", () => {
    const result = inventoryTest.buildInventoryWhere({
        q: "Netflix",
        assignedTo: "",
    });

    assert.match(result.whereSql, /pa\.email LIKE/);
    assert.match(result.whereSql, /CAST\(pa\.id AS CHAR\) LIKE/);
    assert.doesNotMatch(result.whereSql, /u\.email LIKE/);
    assert.equal(result.params.length, 8);
});

test("el filtro Asignada a conserva la búsqueda de usuarios separada", () => {
    const result = inventoryTest.buildInventoryWhere({
        q: "Netflix",
        assignedTo: "cuentastrbx@gmail.com",
    });

    assert.match(result.whereSql, /u\.email LIKE/);
    assert.equal(result.params.at(-1), "%cuentastrbx@gmail.com%");
    assert.equal(result.params.length, 9);
});
