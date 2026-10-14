const dotenv = require("dotenv");

function loadBackupEnvironment(envPath) {
    return dotenv.config({ path: envPath, override: false, quiet: true });
}

module.exports = { loadBackupEnvironment };
