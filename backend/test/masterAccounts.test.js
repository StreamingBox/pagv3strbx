const assert = require("node:assert/strict");
const test = require("node:test");

const { markAvailableAccountsDown } = require("../src/services/masterAccounts.service");

test("marks only available copies of an inactive master account as down", async () => {
    let queryCall = null;
    const conn = {
        async query(sql, params) {
            queryCall = { sql, params };
            return [{ affectedRows: 3 }];
        },
    };

    const markedDown = await markAvailableAccountsDown(conn, {
        platformId: 12,
        accountEmail: "  ACCOUNT@Example.COM ",
    });

    assert.equal(markedDown, 3);
    assert.match(queryCall.sql, /SET status = 'down'/i);
    assert.match(queryCall.sql, /status = 'available'/i);
    assert.match(queryCall.sql, /LOWER\(TRIM\(COALESCE\(email, ''\)\)\) = \?/i);
    assert.deepEqual(queryCall.params, [12, "account@example.com"]);
});

test("does not query when the master account identity is invalid", async () => {
    let queries = 0;
    const conn = {
        async query() {
            queries += 1;
            return [{ affectedRows: 1 }];
        },
    };

    assert.equal(await markAvailableAccountsDown(conn, { platformId: 0, accountEmail: "" }), 0);
    assert.equal(queries, 0);
});
