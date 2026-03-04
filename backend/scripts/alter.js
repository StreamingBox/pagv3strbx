require('dotenv').config();
const pool = require('./src/db');

async function main() {
    try {
        await pool.query('ALTER TABLE subscriptions ADD COLUMN is_attended TINYINT(1) DEFAULT 0');
        console.log("Column added successfully!");
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists.");
        } else {
            console.error(err);
        }
    } finally {
        process.exit(0);
    }
}

main();
