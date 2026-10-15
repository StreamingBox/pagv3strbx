const fs = require("node:fs/promises");
const os = require("node:os");

const BYTES_PER_GIB = 1024 ** 3;

function parseLinuxMemory(contents) {
    const entries = new Map();
    for (const line of String(contents || "").split(/\r?\n/)) {
        const match = line.match(/^(MemTotal|MemAvailable|MemFree):\s+(\d+)\s+kB$/i);
        if (match) entries.set(match[1].toLowerCase(), Number(match[2]) * 1024);
    }

    const totalBytes = entries.get("memtotal");
    const availableBytes = entries.get("memavailable") ?? entries.get("memfree");
    if (!Number.isFinite(totalBytes) || !Number.isFinite(availableBytes) || totalBytes <= 0) return null;
    return { totalBytes, availableBytes };
}

function formatGiB(bytes) {
    return `${(Number(bytes || 0) / BYTES_PER_GIB).toLocaleString("es-CO", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })} GiB`;
}

async function getServerResources({
    currentPath = process.cwd(),
    osInfo = os,
    fsPromises = fs,
    readFile = fs.readFile,
} = {}) {
    let systemMemory = {
        totalBytes: Number(osInfo.totalmem()),
        availableBytes: Number(osInfo.freemem()),
    };

    if (osInfo.platform() === "linux") {
        try {
            systemMemory = parseLinuxMemory(await readFile("/proc/meminfo", "utf8")) || systemMemory;
        } catch {
            // Keep the portable OS memory values when procfs is unavailable.
        }
    }

    const totalMemoryBytes = Math.max(0, systemMemory.totalBytes);
    const availableMemoryBytes = Math.min(totalMemoryBytes, Math.max(0, systemMemory.availableBytes));
    const memory = {
        totalBytes: totalMemoryBytes,
        availableBytes: availableMemoryBytes,
        usedBytes: totalMemoryBytes - availableMemoryBytes,
    };

    let storage = null;
    try {
        const stats = await fsPromises.statfs(currentPath);
        const blockSize = Number(stats.bsize);
        const totalBlocks = Number(stats.blocks);
        const availableBlocks = Number(stats.bavail ?? stats.bfree);
        if ([blockSize, totalBlocks, availableBlocks].every(Number.isFinite) && blockSize > 0 && totalBlocks >= 0) {
            const totalBytes = totalBlocks * blockSize;
            const availableBytes = Math.min(totalBytes, Math.max(0, availableBlocks * blockSize));
            storage = {
                totalBytes,
                availableBytes,
                usedBytes: totalBytes - availableBytes,
            };
        }
    } catch {
        // A RAM snapshot is still useful when the app volume cannot be inspected.
    }

    return { memory, storage };
}

function buildServerResourcesMessage(resources) {
    const memory = resources?.memory || {};
    const storage = resources?.storage;
    return [
        "🖥️ Recursos del servidor",
        "",
        "🧠 RAM del sistema",
        `• Total: ${formatGiB(memory.totalBytes)}`,
        `• En uso: ${formatGiB(memory.usedBytes)}`,
        `• Disponible: ${formatGiB(memory.availableBytes)}`,
        "",
        "💽 Almacenamiento del volumen de la aplicación",
        storage
            ? `• Total: ${formatGiB(storage.totalBytes)}\n• Ocupado: ${formatGiB(storage.usedBytes)}\n• Disponible: ${formatGiB(storage.availableBytes)}`
            : "• No se pudo consultar el almacenamiento.",
    ].join("\n");
}

module.exports = {
    getServerResources,
    buildServerResourcesMessage,
    __testing: { parseLinuxMemory, formatGiB },
};
