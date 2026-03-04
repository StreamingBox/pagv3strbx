require('dotenv').config();
const pool = require('./src/db');

async function migrate() {
    try {
        await pool.query("ALTER TABLE platforms ADD COLUMN whatsapp_instructions TEXT DEFAULT NULL");
        console.log("Columna añadida con éxito.");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("La columna ya existe.");
        } else {
            console.error("Error MIGRATION:", e);
        }
    } finally {
        process.exit();
    }
}
migrate();
