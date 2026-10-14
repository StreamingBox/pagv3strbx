const TRANSIENT_DATABASE_ERROR_CODES = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "PROTOCOL_CONNECTION_LOST",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EHOSTUNREACH",
]);

function isTransientDatabaseError(error) {
    if (!error) return false;
    if (TRANSIENT_DATABASE_ERROR_CODES.has(error.code)) return true;
    return Array.isArray(error.errors) && error.errors.some(isTransientDatabaseError);
}

module.exports = { isTransientDatabaseError };
