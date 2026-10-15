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
                assert.equal(path, "/srv/streamingbox/backend");
                return { blocks: 4096, bsize: 1024 * 1024, bavail: 1024, bfree: 1500 };
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
        },
    });

    const message = buildServerResourcesMessage(result);
    assert.match(message, /RAM del sistema/);
    assert.match(message, /Almacenamiento del volumen de la aplicación/);
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
    });
    assert.match(buildServerResourcesMessage(result), /No se pudo consultar el almacenamiento/);
});

test("server metrics require an explicitly configured authorized chat", () => {
    const configuredAdmins = new Set([123456]);
    assert.equal(isConfiguredAdmin(123456, configuredAdmins), true);
    assert.equal(isConfiguredAdmin("123456", configuredAdmins), true);
    assert.equal(isConfiguredAdmin(789, configuredAdmins), false);
    assert.equal(isConfiguredAdmin(123456, new Set()), false);
});
