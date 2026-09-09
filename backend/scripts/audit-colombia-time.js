#!/usr/bin/env node

/**
 * Read-only audit for the Colombia calendar contract.
 *
 * It intentionally never updates production data. Run with --strict in CI or
 * during a deployment when an active subscription/account mismatch must fail
 * the command; the daily timer uses the default reporting mode.
 */
const path = require("node:path");
const dotenv = require("dotenv");

process.env.TZ = "America/Bogota";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const pool = require("../src/db");
const {
    BOGOTA_TIME_ZONE,
    BOGOTA_TODAY_SQL,
    addDaysBogotaDateOnly,
    bogotaDateOnlyToUtcEndOfDay,
    formatDateOnlyBogota,
} = require("../src/utils/date");

const strict = process.argv.includes("--strict");

function pass(label, detail) {
    console.log(`[colombia-time] OK   ${label}${detail ? `: ${detail}` : ""}`);
}

function warn(label, detail) {
    console.warn(`[colombia-time] WARN ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail) {
    console.error(`[colombia-time] FAIL ${label}${detail ? `: ${detail}` : ""}`);
}

function assertEqual(label, actual, expected) {
    if (actual !== expected) {
        fail(label, `esperado ${expected}, recibido ${actual}`);
        return false;
    }
    pass(label, actual);
    return true;
}

async function run() {
    let hasBlockingIssue = false;

    const lateNight = new Date("2026-06-17T04:59:59.000Z");
    const midnight = new Date("2026-06-17T05:00:00.000Z");
    hasBlockingIssue = !assertEqual(
        "fecha Bogota antes de medianoche",
        formatDateOnlyBogota(lateNight),
        "2026-06-16"
    ) || hasBlockingIssue;
    hasBlockingIssue = !assertEqual(
        "fecha Bogota al comenzar el dia",
        formatDateOnlyBogota(midnight),
        "2026-06-17"
    ) || hasBlockingIssue;
    hasBlockingIssue = !assertEqual(
        "duracion de un dia antes de medianoche",
        addDaysBogotaDateOnly(1, lateNight),
        "2026-06-17"
    ) || hasBlockingIssue;
    hasBlockingIssue = !assertEqual(
        "duracion de un dia despues de medianoche",
        addDaysBogotaDateOnly(1, midnight),
        "2026-06-18"
    ) || hasBlockingIssue;

    const endOfDay = bogotaDateOnlyToUtcEndOfDay("2026-06-17");
    hasBlockingIssue = !assertEqual(
        "fin tecnico del dia colombiano",
        endOfDay.toISOString(),
        "2026-06-18T04:59:59.000Z"
    ) || hasBlockingIssue;
    hasBlockingIssue = !assertEqual(
        "lectura de fecha tecnica almacenada en Colombia",
        formatDateOnlyBogota(endOfDay),
        "2026-06-17"
    ) || hasBlockingIssue;

    const [clockRows] = await pool.query(`
        SELECT
            UTC_TIMESTAMP() AS utc_now,
            CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00') AS bogota_now,
            @@global.time_zone AS global_time_zone,
            @@session.time_zone AS session_time_zone
    `);
    const clock = clockRows[0] || {};
    pass(
        "reloj de base de datos",
        `UTC ${clock.utc_now || "?"}; Bogota ${clock.bogota_now || "?"}; `
        + `global ${clock.global_time_zone || "?"}; session ${clock.session_time_zone || "?"}`
    );

    const [mismatchRows] = await pool.query(`
        SELECT
            pa.id AS account_id,
            pa.platform_name,
            s.id AS subscription_id,
            s.expires_at AS subscription_expires_at,
            DATE(CONVERT_TZ(pa.expires_at, '+00:00', '-05:00')) AS account_expires_at
        FROM platform_accounts pa
        JOIN subscriptions s
          ON s.platform_account_id = pa.id
         AND s.status = 'active'
        WHERE pa.expires_at IS NOT NULL
          AND DATE(CONVERT_TZ(pa.expires_at, '+00:00', '-05:00')) <> s.expires_at
        ORDER BY pa.id ASC
        LIMIT 100
    `);

    if (mismatchRows.length) {
        const sample = mismatchRows.slice(0, 10).map((row) =>
            `#${row.account_id}/${row.platform_name || "?"} `
            + `suscripcion ${row.subscription_expires_at} vs cuenta ${row.account_expires_at}`
        ).join("; ");
        warn(
            "diferencias historicas de fecha detectadas",
            `${mismatchRows.length} encontradas; no se modificaron registros. ${sample}`
        );
    } else {
        pass("fechas activas consistentes", "suscripciones y cuentas usan el mismo dia Bogota");
    }

    const [statusRows] = await pool.query(`
        SELECT status, COUNT(*) AS total
        FROM platform_accounts
        GROUP BY status
        ORDER BY status
    `);
    const emptyStatus = statusRows.find((row) => String(row.status || "").trim() === "");
    if (emptyStatus) {
        warn("estados historicos vacios", `${emptyStatus.total} registros; no se modificaron`);
    } else {
        pass("estados sin valores vacíos");
    }

    console.log(`[colombia-time] Zona de aplicacion: ${BOGOTA_TIME_ZONE}`);
    console.log(`[colombia-time] SQL de hoy contractual: ${BOGOTA_TODAY_SQL}`);
    if (strict && mismatchRows.length) process.exitCode = 1;
    if (hasBlockingIssue && strict) process.exitCode = 1;
}

run()
    .catch((error) => {
        fail("auditoría no ejecutable", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await pool.end(); } catch { /* best effort */ }
    });
