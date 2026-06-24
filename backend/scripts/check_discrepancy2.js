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

        const [ordersCols] = await conn.query("SHOW COLUMNS FROM orders");
        console.log("Columnas de orders:");
        console.table(ordersCols.map(c => c.Field));

        const [analytics] = await conn.query(`
            SELECT SUM(price_sale) as total_price
            FROM orders
            WHERE user_id = 1 AND status != 'failed' AND status != 'cancelled'
        `);

        console.log("Total orders price_sale (Analytics):", analytics[0].total_price);

        const [sales] = await conn.query(`
            SELECT status, SUM(price_sale) as total
            FROM orders
            WHERE user_id = 1
            GROUP BY status
        `);
        console.log(sales);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        if (conn) await conn.end();
    }
})();
