require('dotenv').config();
const pool = require('./src/db');

async function migrate_template() {
    try {
        await pool.query("ALTER TABLE platforms RENAME COLUMN whatsapp_instructions TO whatsapp_template");
        console.log("Columna renombrada con éxito.");
    } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
            console.log("whatsapp_instructions no existe. Verificando si existe whatsapp_template...");
        } else {
            console.error("Error MIGRATION:", e);
        }
    } finally {
        process.exit();
    }
}
migrate_template();
