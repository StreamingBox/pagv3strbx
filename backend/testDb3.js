require('dotenv').config();
const pool = require('./src/db');

async function migrate_url_toggle() {
    try {
        await pool.query(`
            ALTER TABLE platforms 
            ADD COLUMN wa_show_url TINYINT(1) DEFAULT 1
        `);
        console.log("Columna wa_show_url creada con éxito.");
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
migrate_url_toggle();
