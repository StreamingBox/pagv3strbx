const assert = require("node:assert/strict");
const test = require("node:test");

const {
    __testables: {
        compareNames,
        compareTimes,
        parseBrebEmail,
    },
} = require("../src/services/brebReconciliation.service");

function parseReceipt(timePhrase) {
    return parseBrebEmail({
        subject: "Recibiste plata por Bre-B",
        text: [
            "Hola, ANGEL MORENO!",
            "Recibiste 8.000 de LEONIS FUENMAYOR el 5 de agosto de 2026 " + timePhrase + ", desde el banco Nequi.",
        ].join("\n"),
    }, { uid: 123 });
}

test("reconoce el formato de Nequi con 'a la' y conserva monto, girador y hora", () => {
    const receipt = parseReceipt("a la 1:48 p.m.");

    assert.equal(receipt?.parsed, true);
    assert.equal(receipt?.amount, 8000);
    assert.equal(receipt?.senderName, "LEONIS FUENMAYOR");
    assert.equal(receipt?.receivedAt?.toISOString(), "2026-08-05T18:48:00.000Z");
});

test("tambien reconoce el formato de Nequi con 'a las'", () => {
    const receipt = parseReceipt("a las 1:48 p.m.");

    assert.equal(receipt?.parsed, true);
    assert.equal(receipt?.receivedAt?.toISOString(), "2026-08-05T18:48:00.000Z");
});

test("autoaprueba una diferencia normal de segundos solo cuando monto, girador y hora coinciden", () => {
    const receipt = parseReceipt("a la 1:48 p.m.");
    const declaredAt = new Date("2026-08-05T18:49:10.000Z");

    assert.equal(compareNames("Leonis FUENMAYOR", receipt.senderName).ok, true);
    assert.equal(compareTimes(declaredAt, receipt.receivedAt).ok, true);
    assert.equal(compareNames("Otra Persona", receipt.senderName).ok, false);
    assert.equal(compareTimes(new Date("2026-08-05T19:15:00.000Z"), receipt.receivedAt).ok, false);
});
