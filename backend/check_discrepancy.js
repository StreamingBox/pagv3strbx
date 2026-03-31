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

        const [users] = await conn.query("SELECT id FROM users WHERE email='cuentastrbx@gmail.com'");
        if (!users.length) return console.log("Usuario no encontrado");
        const userId = users[0].id;

        const [wallets] = await conn.query("SELECT id FROM wallets WHERE user_id=?", [userId]);
        const walletId = wallets[0].id;

        const [rows] = await conn.query(`
            SELECT type, reference_type, SUM(amount) as total
            FROM wallet_transactions
            WHERE wallet_id = ?
            GROUP BY type, reference_type
        `, [walletId]);

        console.log("Transacciones por tipo para el usuario:");
        console.table(rows);

        const [purchases] = await conn.query(`
            SELECT SUM(ABS(amount)) as total_purchase
            FROM wallet_transactions
            WHERE wallet_id = ? AND type = 'purchase' AND amount < 0
        `, [walletId]);

        console.log("Total purchase amount < 0:", purchases[0].total_purchase);

        const [analytics] = await conn.query(`
            SELECT SUM(price) as total_price
            FROM orders
            WHERE user_id = ? AND status != 'failed' AND status != 'cancelled'
        `, [userId]);

        console.log("Total orders price (Analytics):", analytics[0].total_price);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        if (conn) await conn.end();
    }
})();
