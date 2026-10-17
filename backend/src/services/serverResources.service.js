const fs = require("node:fs/promises");
const os = require("node:os");

const BYTES_PER_GIB = 1024 ** 3;
const MEMORY_BACKED_FILESYSTEMS = new Set([0x01021994, 0x858458f6]);

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
    temporaryPath = "/tmp",
    osInfo = os,
    fsPromises = fs,
    readFile = fs.readFile,
    includePressure = false,
} = {}) {
    let memoryContents = "";
    let systemMemory = {
        totalBytes: Number(osInfo.totalmem()),
        availableBytes: Number(osInfo.freemem()),
    };

    if (osInfo.platform() === "linux") {
        try {
            memoryContents = await readFile("/proc/meminfo", "utf8");
            systemMemory = parseLinuxMemory(memoryContents) || systemMemory;
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

    async function readStorage(location) {
        try {
            const stats = await fsPromises.statfs(location);
            const blockSize = Number(stats.bsize);
            const totalBlocks = Number(stats.blocks);
            const availableBlocks = Number(stats.bavail ?? stats.bfree);
            if ([blockSize, totalBlocks, availableBlocks].every(Number.isFinite) && blockSize > 0 && totalBlocks >= 0) {
                const totalBytes = totalBlocks * blockSize;
                const availableBytes = Math.min(totalBytes, Math.max(0, availableBlocks * blockSize));
                return {
                    totalBytes,
                    availableBytes,
                    usedBytes: totalBytes - availableBytes,
                    memoryBacked: MEMORY_BACKED_FILESYSTEMS.has(Number(stats.type) >>> 0),
                };
            }
        } catch {
            // Resource reporting should remain useful if one volume is unavailable.
        }
        return null;
    }

    const [storage, temporaryStorage] = await Promise.all([
        readStorage(currentPath),
        readStorage(temporaryPath),
    ]);

    if (!includePressure) return { memory, storage, temporaryStorage };
    const swapTotal = String(memoryContents).match(/^SwapTotal:\s+(\d+)\s+kB$/m);
    const swapFree = String(memoryContents).match(/^SwapFree:\s+(\d+)\s+kB$/m);
    const swap = swapTotal && swapFree ? {
        totalBytes: Number(swapTotal[1]) * 1024,
        usedBytes: Math.max(0, Number(swapTotal[1]) - Number(swapFree[1])) * 1024,
    } : null;
    const load = { cores: osInfo.availableParallelism?.() || osInfo.cpus?.().length || 1, average1m: osInfo.loadavg?.()[0] || 0 };
    return { memory, storage, temporaryStorage, swap, load };
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
        "",
        "🧺 Almacenamiento temporal (/tmp)",
        resources?.temporaryStorage
            ? `• Total: ${formatGiB(resources.temporaryStorage.totalBytes)}\n• Ocupado: ${formatGiB(resources.temporaryStorage.usedBytes)}\n• Disponible: ${formatGiB(resources.temporaryStorage.availableBytes)}${resources.temporaryStorage.memoryBacked ? "\n• Este espacio usa memoria temporal (tmpfs), no el disco raíz." : ""}`
            : "• No se pudo consultar el almacenamiento temporal.",
        ...(resources?.swap ? ["", `Swap utilizada: ${formatGiB(resources.swap.usedBytes)} / ${formatGiB(resources.swap.totalBytes)}`] : []),
        ...(resources?.load ? [`Carga CPU (1 min): ${Number(resources.load.average1m).toFixed(2)} / ${resources.load.cores} nucleo(s)`] : []),
    ].join("\n");
}

module.exports = {
    getServerResources,
    buildServerResourcesMessage,
    __testing: { parseLinuxMemory, formatGiB },
};
