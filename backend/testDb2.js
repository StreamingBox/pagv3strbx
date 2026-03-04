require('dotenv').config();
const pool = require('./src/db');

async function migrate_toggles() {
    try {
        await pool.query("ALTER TABLE platforms RENAME COLUMN whatsapp_template TO whatsapp_instructions");
        console.log("Renombrado whatsapp_template a whatsapp_instructions");
    } catch (e) {
        console.log("Ignorando error rename: ", e.message);
    }

    try {
        await pool.query(`
            ALTER TABLE platforms 
            ADD COLUMN wa_show_id TINYINT(1) DEFAULT 1,
            ADD COLUMN wa_show_email TINYINT(1) DEFAULT 1,
            ADD COLUMN wa_show_pass TINYINT(1) DEFAULT 1,
            ADD COLUMN wa_show_profile TINYINT(1) DEFAULT 1,
            ADD COLUMN wa_show_pin TINYINT(1) DEFAULT 1,
            ADD COLUMN wa_show_expire TINYINT(1) DEFAULT 1
        `);
        console.log("Columnas de toggle creadas con éxito.");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Las columnas ya existen.");
        } else {
            console.error("Error MIGRATION:", e);
        }
    } finally {
        process.exit();
    }
}
migrate_toggles();
