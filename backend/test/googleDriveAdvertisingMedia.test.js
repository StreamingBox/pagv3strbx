const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeImage } = require("../src/services/googleDriveService");

test("normalizes advertising video metadata for the media preview", () => {
    const media = normalizeImage({
        id: "video-id",
        name: "promo.mp4",
        mimeType: "video/mp4",
        size: "1024",
    });

    assert.equal(media.isVideo, true);
    assert.equal(media.mimeType, "video/mp4");
    assert.equal(media.previewLink, "/api/advertising/file/video-id");
});

test("keeps image files classified as images", () => {
    const media = normalizeImage({
        id: "image-id",
        name: "promo.png",
        mimeType: "image/png",
    });

    assert.equal(media.isVideo, false);
    assert.equal(media.mimeType, "image/png");
});
