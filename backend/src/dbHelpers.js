const pool = require("./db");

async function withConnection(callback) {
    const conn = await pool.getConnection();
    try {
        return await callback(conn);
    } finally {
        conn.release();
    }
}

async function withTransaction(callback) {
    return withConnection(async (conn) => {
        await conn.beginTransaction();
        try {
            const result = await callback(conn);
            await conn.commit();
            return result;
        } catch (err) {
            try {
                await conn.rollback();
            } catch {
                // Keep the original error as the actionable failure.
            }
            throw err;
        }
    });
}

module.exports = { withConnection, withTransaction };
