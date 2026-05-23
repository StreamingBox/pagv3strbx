const fs = require("fs");
const path = require("path");

const DEFAULT_LOCK_NAME = "streaming_box_v3_schema_migrations";
const DEFAULT_LOCK_TIMEOUT_SECONDS = 30;

function summarizeSql(sql) {
    return String(sql).replace(/\s+/g, " ").trim().slice(0, 140);
}

async function runQuery(pool, sql, params = [], options = {}) {
    try {
        return await pool.query(sql, params);
    } catch (err) {
        const ignored = Array.isArray(options.ignoreCodes) && options.ignoreCodes.includes(err?.code);
        if (ignored) {
            const logger = options.logger || console;
            logger.warn(`[migrate] Ignorado ${err.code}: ${summarizeSql(sql)}`);
            return [[], []];
        }
        err.message = `${err.message} | SQL: ${summarizeSql(sql)}`;
        throw err;
    }
}

async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(191) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function acquireMigrationLock(pool, logger) {
    const lockName = process.env.DB_MIGRATION_LOCK_NAME || DEFAULT_LOCK_NAME;
    const timeout = parseInt(
        process.env.DB_MIGRATION_LOCK_TIMEOUT_SECONDS || String(DEFAULT_LOCK_TIMEOUT_SECONDS),
        10
    );
    const [rows] = await pool.query("SELECT GET_LOCK(?, ?) AS locked", [lockName, timeout]);
    if (!rows?.[0]?.locked) {
        throw new Error(`No se pudo obtener lock de migraciones MySQL: ${lockName}`);
    }
    logger.info(`[migrate] Lock adquirido: ${lockName}`);
    return lockName;
}

async function releaseMigrationLock(pool, lockName, logger) {
    if (!lockName) return;
    try {
        await pool.query("SELECT RELEASE_LOCK(?)", [lockName]);
        logger.info(`[migrate] Lock liberado: ${lockName}`);
    } catch (err) {
        logger.warn(`[migrate] No se pudo liberar lock ${lockName}: ${err.message}`);
    }
}

function loadMigrations(migrationsDir) {
    return fs.readdirSync(migrationsDir)
        .filter((file) => /^\d+.*\.js$/.test(file))
        .sort((a, b) => a.localeCompare(b))
        .map((file) => {
            const migration = require(path.join(migrationsDir, file));
            const id = migration.id || path.basename(file, ".js");
            const name = migration.name || id;
            if (typeof migration.up !== "function") {
                throw new Error(`Migracion invalida ${file}: falta up()`);
            }
            return { ...migration, id, name, file };
        });
}

async function getAppliedMigrationIds(pool) {
    const [rows] = await pool.query("SELECT id FROM schema_migrations");
    return new Set(rows.map((row) => row.id));
}

async function runMigrations(pool, options = {}) {
    const logger = options.logger || console;
    const migrationsDir = options.migrationsDir || __dirname;

    await ensureMigrationsTable(pool);
    const lockName = await acquireMigrationLock(pool, logger);

    try {
        const applied = await getAppliedMigrationIds(pool);
        const migrations = loadMigrations(migrationsDir);

        for (const migration of migrations) {
            if (applied.has(migration.id)) {
                logger.info(`[migrate] Omitida ${migration.id} (${migration.name})`);
                continue;
            }

            logger.info(`[migrate] Ejecutando ${migration.id} (${migration.name})`);
            await migration.up({
                pool,
                query: (sql, params = [], queryOptions = {}) => runQuery(pool, sql, params, {
                    ...queryOptions,
                    logger,
                }),
            });
            await pool.query(
                "INSERT INTO schema_migrations (id, name) VALUES (?, ?)",
                [migration.id, migration.name]
            );
            logger.info(`[migrate] Aplicada ${migration.id}`);
        }
    } finally {
        await releaseMigrationLock(pool, lockName, logger);
    }
}

module.exports = { runMigrations, runQuery };
