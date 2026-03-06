require("dotenv").config();
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
        // Agregar 'pending' al ENUM de status
        await conn.query("ALTER TABLE users MODIFY COLUMN status ENUM('active', 'inactive', 'blocked', 'pending') NOT NULL DEFAULT 'pending'");
        process.stdout.write("Status ENUM updated successfully.");
    } catch (e) {
        process.stderr.write(e.message);
    } finally {
        if (conn) await conn.end();
    }
})();
