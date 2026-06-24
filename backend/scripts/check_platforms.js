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
        const [rows] = await conn.query("DESCRIBE platforms");
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.end();
    }
})();
