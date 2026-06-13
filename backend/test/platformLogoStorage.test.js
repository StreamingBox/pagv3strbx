const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    getPlatformLogoDirs,
    savePlatformLogo,
    slugifyFilename,
} = require("../src/utils/platformLogoStorage");

const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
]);

test("platform logos are saved to public and dist folders when dist exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "platform-logos-"));
    const publicDir = path.join(root, "public-logos");
    const distDir = path.join(root, "dist-logos");
    const previousPublic = process.env.PLATFORM_LOGOS_PUBLIC_DIR;
    const previousDist = process.env.PLATFORM_LOGOS_DIST_DIR;
    process.env.PLATFORM_LOGOS_PUBLIC_DIR = publicDir;
    process.env.PLATFORM_LOGOS_DIST_DIR = distDir;

    try {
        const result = savePlatformLogo({
            slug: "Chat Gpt, cuenta personal solo un dispositivo",
            file: {
                mimetype: "image/png",
                buffer: pngBuffer,
            },
        });

        assert.equal(slugifyFilename("Chat Gpt, cuenta personal solo un dispositivo"), "chat-gpt-cuenta-personal-solo-un-dispositivo");
        assert.equal(result.file, "/platform-logos/chat-gpt-cuenta-personal-solo-un-dispositivo.png");
        assert.deepEqual(getPlatformLogoDirs(), [publicDir, distDir]);
        assert.equal(fs.readFileSync(path.join(publicDir, "chat-gpt-cuenta-personal-solo-un-dispositivo.png")).compare(pngBuffer), 0);
        assert.equal(fs.readFileSync(path.join(distDir, "chat-gpt-cuenta-personal-solo-un-dispositivo.png")).compare(pngBuffer), 0);
    } finally {
        if (previousPublic == null) delete process.env.PLATFORM_LOGOS_PUBLIC_DIR;
        else process.env.PLATFORM_LOGOS_PUBLIC_DIR = previousPublic;
        if (previousDist == null) delete process.env.PLATFORM_LOGOS_DIST_DIR;
        else process.env.PLATFORM_LOGOS_DIST_DIR = previousDist;
        fs.rmSync(root, { recursive: true, force: true });
    }
});
