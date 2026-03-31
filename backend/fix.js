require('dotenv').config();
const pool = require('./src/db');

async function fix() {
    try {
        const [r1] = await pool.query('UPDATE wallet_transactions SET type="invest_adj" WHERE reference_type="admin_invest_adj" AND type=""');
        console.log("Fixed invest_adj:", r1.affectedRows);

        const [r2] = await pool.query('UPDATE wallet_transactions SET type="profit_adj" WHERE reference_type="admin_profit_adj" AND type=""');
        console.log("Fixed profit_adj:", r2.affectedRows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
fix();
