const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    hasAllowedImageSignature,
    saveSupportAttachment,
    resolveSupportAttachment,
    removeSupportAttachment,
} = require("../src/utils/supportAttachmentStorage");

test("support evidence is stored privately with a generated image name", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "support-evidence-"));
    const previous = process.env.SUPPORT_UPLOAD_DIR;
    process.env.SUPPORT_UPLOAD_DIR = directory;

    try {
        const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const storedName = await saveSupportAttachment({
            mimetype: "image/png",
            buffer: imageBuffer,
        });
        assert.match(storedName, /^[0-9a-f-]+\.png$/);
        assert.deepEqual(await fs.readFile(resolveSupportAttachment(storedName)), imageBuffer);
        await removeSupportAttachment(storedName);
        await assert.rejects(fs.access(resolveSupportAttachment(storedName)));
    } finally {
        if (previous === undefined) delete process.env.SUPPORT_UPLOAD_DIR;
        else process.env.SUPPORT_UPLOAD_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test("support evidence rejects a file that only spoofs the image mimetype", () => {
    assert.equal(hasAllowedImageSignature("image/png", Buffer.from("not-an-image")), false);
});

test("support evidence path cannot escape its private directory", () => {
    assert.throws(
        () => resolveSupportAttachment("../secret.txt"),
        /Archivo de soporte invalido/
    );
});
