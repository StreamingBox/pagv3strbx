const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeAccessUrl } = require("../src/utils/accountAccess");

test("optional access URL is stored as null when omitted", () => {
    assert.equal(normalizeAccessUrl(""), null);
    assert.equal(normalizeAccessUrl(null), null);
});

test("IPTV access URL is required", () => {
    assert.throws(
        () => normalizeAccessUrl("", { required: true }),
        (error) => error?.status === 400 && /URL/.test(error.message)
    );
});

test("access URL accepts HTTP and HTTPS endpoints", () => {
    assert.equal(normalizeAccessUrl("http://red4tv.lat"), "http://red4tv.lat");
    assert.equal(normalizeAccessUrl("https://example.com/access"), "https://example.com/access");
});

test("access URL rejects unsupported protocols", () => {
    assert.throws(
        () => normalizeAccessUrl("ftp://red4tv.lat"),
        (error) => error?.status === 400 && /URL/.test(error.message)
    );
});
