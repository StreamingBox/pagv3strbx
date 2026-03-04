require("dotenv").config({ path: __dirname + "/.env" });
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
        await conn.query("ALTER TABLE platforms ADD COLUMN type ENUM('normal', 'correo') DEFAULT 'normal'");
        console.log("Columna `type` agregada a platforms");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log("La columna ya existe");
        else console.error(e);
    } finally {
        if (conn) await conn.end();
    }
})();
