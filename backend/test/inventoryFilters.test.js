const test = require("node:test");
const assert = require("node:assert/strict");

const { __test: inventoryTest } = require("../src/services/inventory.service");

test("el buscador general no mezcla el correo del usuario asignado", () => {
    const result = inventoryTest.buildInventoryWhere({
        q: "cuentastrbx@gmail.com",
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
