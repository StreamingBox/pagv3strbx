const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

function currentLevel() {
    const configured = String(process.env.LOG_LEVEL || "info").trim().toLowerCase();
    return LEVELS[configured] || LEVELS.info;
}

function serializeError(error) {
    if (!error) return null;
    return {
        name: error.name || "Error",
        message: error.message || String(error),
        code: error.code,
        status: error.status || error.statusCode,
        stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
}

function normalizeMeta(meta) {
    if (!meta) return {};
    if (meta instanceof Error) return { error: serializeError(meta) };

    const normalized = {};
    for (const [key, value] of Object.entries(meta)) {
        if (value instanceof Error) {
            normalized[key] = serializeError(value);
        } else {
            normalized[key] = value;
        }
    }
    return normalized;
}

function write(level, message, meta) {
    if ((LEVELS[level] || LEVELS.info) < currentLevel()) return;

    const entry = {
        ts: new Date().toISOString(),
        level,
        service: "pagev3-api",
        message: String(message || ""),
        ...normalizeMeta(meta),
    };

    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
        process.stderr.write(`${line}\n`);
    } else {
        process.stdout.write(`${line}\n`);
    }
}

module.exports = {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
};
