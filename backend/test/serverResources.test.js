const assert = require("node:assert/strict");
const test = require("node:test");

const {
    getServerResources,
    buildServerResourcesMessage,
} = require("../src/services/serverResources.service");
const { isConfiguredAdmin } = require("../src/services/telegramBot").__testing;

const GiB = 1024 ** 3;

test("reports Linux RAM from MemAvailable and the app volume capacity", async () => {
    const result = await getServerResources({
        currentPath: "/srv/streamingbox/backend",
        osInfo: {
            totalmem: () => 16 * GiB,
            freemem: () => 4 * GiB,
            platform: () => "linux",
        },
        fsPromises: {
            async statfs(path) {
                if (path === "/srv/streamingbox/backend") return { blocks: 4096, bsize: 1024 * 1024, bavail: 1024, bfree: 1500 };
                assert.equal(path, "/tmp");
                return { type: 0x01021994, blocks: 512, bsize: 1024 * 1024, bavail: 400, bfree: 420 };
            },
        },
        async readFile(path, encoding) {
            assert.equal(path, "/proc/meminfo");
            assert.equal(encoding, "utf8");
            return "MemTotal:       8388608 kB\nMemAvailable:   2097152 kB\nMemFree:         524288 kB\n";
        },
    });

    assert.deepEqual(result, {
        memory: { totalBytes: 8 * GiB, availableBytes: 2 * GiB, usedBytes: 6 * GiB },
        storage: {
            totalBytes: 4 * GiB,
            availableBytes: GiB,
            usedBytes: 3 * GiB,
            memoryBacked: false,
        },
        temporaryStorage: {
            totalBytes: 512 * 1024 ** 2,
            availableBytes: 400 * 1024 ** 2,
            usedBytes: 112 * 1024 ** 2,
            memoryBacked: true,
        },
    });

    const message = buildServerResourcesMessage(result);
    assert.match(message, /RAM del sistema/);
    assert.match(message, /Almacenamiento del volumen de la aplicación/);
    assert.match(message, /Almacenamiento temporal \(\/tmp\)/);
    assert.match(message, /memoria temporal \(tmpfs\), no el disco raíz/);
    assert.match(message, /Total: 8,0 GiB/);
    assert.match(message, /Disponible: 1,0 GiB/);
});

test("falls back to OS RAM and reports unavailable disk without failing", async () => {
    const result = await getServerResources({
        osInfo: {
            totalmem: () => 4 * GiB,
            freemem: () => GiB,
            platform: () => "linux",
        },
        fsPromises: {
            async statfs() {
                throw new Error("statfs unavailable");
            },
        },
        async readFile() {
            throw new Error("procfs unavailable");
        },
    });

    assert.deepEqual(result, {
        memory: { totalBytes: 4 * GiB, availableBytes: GiB, usedBytes: 3 * GiB },
        storage: null,
        temporaryStorage: null,
    });
    assert.match(buildServerResourcesMessage(result), /No se pudo consultar el almacenamiento/);
    assert.match(buildServerResourcesMessage(result), /No se pudo consultar el almacenamiento temporal/);
});

test("server metrics require an explicitly configured authorized chat", () => {
    const configuredAdmins = new Set([123456]);
    assert.equal(isConfiguredAdmin(123456, configuredAdmins), true);
    assert.equal(isConfiguredAdmin("123456", configuredAdmins), true);
    assert.equal(isConfiguredAdmin(789, configuredAdmins), false);
    assert.equal(isConfiguredAdmin(123456, new Set()), false);
});

test("pressure details expose swap and CPU load when explicitly requested", async () => {
    const result = await getServerResources({
        includePressure: true,
        osInfo: { totalmem: () => GiB, freemem: () => GiB / 4, platform: () => "linux", availableParallelism: () => 2, loadavg: () => [0.25, 0, 0] },
        fsPromises: { statfs: async () => ({ blocks: 4, bsize: GiB, bavail: 1 }) },
        readFile: async () => "MemTotal: 1048576 kB\nMemAvailable: 262144 kB\nSwapTotal: 524288 kB\nSwapFree: 131072 kB\n",
    });
    assert.deepEqual(result.swap, { totalBytes: GiB / 2, usedBytes: GiB * 3 / 8 });
    assert.deepEqual(result.load, { cores: 2, average1m: 0.25 });
    assert.match(buildServerResourcesMessage(result), /Swap utilizada/);
    assert.match(buildServerResourcesMessage(result), /Carga CPU \(1 min\): 0.25 \/ 2/);
});
