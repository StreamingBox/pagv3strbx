const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const pool = require("../src/db");
const shareRoutes = require("../src/routes/share");

test("credential links return a retryable response when MySQL is unreachable", async () => {
    const originalQuery = pool.query;
    const originalConsoleError = console.error;
    pool.query = async () => {
        throw Object.assign(new Error("Database network unavailable"), { code: "ENETUNREACH" });
    };
    console.error = () => {};

    const app = express();
    app.use("/api", shareRoutes);
    const server = http.createServer(app);

    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/api/s/test-token`);

        assert.equal(response.status, 503);
        assert.equal(response.headers.get("retry-after"), "3");
        assert.match(await response.text(), /Servicio temporalmente no disponible/);
    } finally {
        pool.query = originalQuery;
        console.error = originalConsoleError;
        await new Promise((resolve) => server.close(resolve));
    }
});
