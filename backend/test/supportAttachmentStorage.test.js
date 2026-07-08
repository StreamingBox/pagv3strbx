const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    saveSupportAttachment,
    resolveSupportAttachment,
    removeSupportAttachment,
} = require("../src/utils/supportAttachmentStorage");

test("support evidence is stored privately with a generated image name", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "support-evidence-"));
    const previous = process.env.SUPPORT_UPLOAD_DIR;
    process.env.SUPPORT_UPLOAD_DIR = directory;

    try {
        const storedName = await saveSupportAttachment({
            mimetype: "image/png",
            buffer: Buffer.from("test-image"),
        });
        assert.match(storedName, /^[0-9a-f-]+\.png$/);
        assert.equal(
            await fs.readFile(resolveSupportAttachment(storedName), "utf8"),
            "test-image"
        );
        await removeSupportAttachment(storedName);
        await assert.rejects(fs.access(resolveSupportAttachment(storedName)));
    } finally {
        if (previous === undefined) delete process.env.SUPPORT_UPLOAD_DIR;
        else process.env.SUPPORT_UPLOAD_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test("support evidence path cannot escape its private directory", () => {
    assert.throws(
        () => resolveSupportAttachment("../secret.txt"),
        /Archivo de soporte invalido/
    );
});
