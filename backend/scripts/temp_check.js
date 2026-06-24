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
        const [rows] = await conn.query("DESCRIBE users");
        process.stdout.write(JSON.stringify(rows));
    } catch (e) {
        process.stderr.write(e.message);
    } finally {
        if (conn) await conn.end();
    }
})();
