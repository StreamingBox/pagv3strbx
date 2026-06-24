const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

(async () => {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
        });

        const [wallets] = await conn.query("SELECT id FROM wallets WHERE user_id=1");
        const walletId = wallets[0].id;

        const [purchases] = await conn.query(`
            SELECT SUM(ABS(amount)) as total_purchase
            FROM wallet_transactions
            WHERE wallet_id = ? AND type = 'purchase' AND amount < 0
        `, [walletId]);

        console.log("Total purchase amount < 0:", purchases[0].total_purchase);

        const [ordersTotal] = await conn.query(`
            SELECT SUM(total) as total_orders
            FROM orders
            WHERE user_id = 1
        `);

        console.log("Total orders (All statuses):", ordersTotal[0].total_orders);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        if (conn) await conn.end();
    }
})();
