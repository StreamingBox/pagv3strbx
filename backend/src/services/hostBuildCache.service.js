const net = require("node:net");

const DEFAULT_SOCKET_PATH = "/run/pagev3-maintenance/agent.sock";
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

class HostMaintenanceError extends Error {
    constructor(code) {
        super(code);
        this.name = "HostMaintenanceError";
        this.code = code;
    }
}

function requestHostMaintenance(payload, {
    socketPath = process.env.PAGEV3_MAINTENANCE_SOCKET || DEFAULT_SOCKET_PATH,
    timeoutMs = 30_000,
} = {}) {
    return new Promise((resolve, reject) => {
        let response = "";
        let settled = false;
        const socket = net.createConnection({ path: socketPath });
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (error) reject(error);
            else resolve(value);
        };

        socket.setTimeout(timeoutMs, () => finish(new HostMaintenanceError("maintenance_timeout")));
        socket.once("connect", () => socket.end(`${JSON.stringify(payload)}\n`));
        socket.on("data", chunk => {
            response += chunk.toString("utf8");
            if (Buffer.byteLength(response) > 8192) finish(new HostMaintenanceError("invalid_response"));
        });
        socket.once("error", error => finish(new HostMaintenanceError(
            error.code === "ENOENT" || error.code === "ECONNREFUSED"
                ? "maintenance_unavailable"
                : "maintenance_connection_failed"
        )));
        socket.once("end", () => {
            if (settled) return;
            try {
                const result = JSON.parse(response);
                if (!result || typeof result !== "object" || Array.isArray(result)) {
                    throw new Error("invalid response");
                }
                if (result.ok !== true) return finish(new HostMaintenanceError(String(result.error || "maintenance_failed")));
                finish(null, result);
            } catch {
                finish(new HostMaintenanceError("invalid_response"));
            }
        });
    });
}

async function previewBuildCache(options) {
    const result = await requestHostMaintenance({ op: "preview" }, options);
    if (!Number.isSafeInteger(result.reclaimableBytes) || result.reclaimableBytes < 0) {
        throw new HostMaintenanceError("invalid_response");
    }
    if (result.reclaimableBytes > 0 && !TOKEN_PATTERN.test(String(result.token || ""))) {
        throw new HostMaintenanceError("invalid_response");
    }
    return result;
}

async function pruneBuildCache(token, options) {
    if (!TOKEN_PATTERN.test(String(token || ""))) throw new HostMaintenanceError("invalid_token");
    const result = await requestHostMaintenance({ op: "prune", token }, { timeoutMs: 15 * 60_000, ...options });
    if (!Number.isSafeInteger(result.reclaimedBytes) || result.reclaimedBytes < 0) {
        throw new HostMaintenanceError("invalid_response");
    }
    return result;
}

module.exports = { HostMaintenanceError, previewBuildCache, pruneBuildCache, requestHostMaintenance };
