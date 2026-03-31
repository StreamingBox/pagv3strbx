
const mysql = require("mysql2/promise");
require("dotenv").config({ path: "c:/Users/deyby/OneDrive/Documentos/Desarrollos/pageV3/backend/.env" });

async function migrate() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });

    try {
        console.log("Adding is_renewable column to platform_prices...");
        await pool.query("ALTER TABLE platform_prices ADD COLUMN is_renewable TINYINT(1) DEFAULT 0;");
        console.log("Migration successful! ✅");
    } catch (err) {
        if (err.code === "ER_DUP_COLUMN_NAME") {
            console.log("Column is_renewable already exists. Skipping. ⚠️");
        } else {
            console.error("Migration failed:", err);
        }
    } finally {
        await pool.end();
    }
}

migrate();
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
