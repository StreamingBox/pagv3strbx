const assert = require("node:assert/strict");
const test = require("node:test");
const {
    APPLE_TV_CODE_WINDOW_MINUTES,
    extractAppleTvOtpCode,
    isAppleSender,
    isAppleTvOtpSubject,
} = require("../src/services/appleTvCodePolicy");
const { toCodeSlug } = require("../src/utils/platformSlugMap");

test("normalizes Apple TV platform names to the code module slug", () => {
    assert.equal(toCodeSlug("Apple Tv"), "appletv");
    assert.equal(toCodeSlug("Apple TV"), "appletv");
});

test("accepts Apple mail domains but rejects lookalike senders", () => {
    assert.equal(isAppleSender("Apple <noreply@apple.com>"), true);
    assert.equal(isAppleSender("Apple <verify@email.apple.com>"), true);
    assert.equal(isAppleSender("Apple <noreply@apple.com.attacker.test>"), false);
});

test("matches the Apple TV sign-in subject and extracts a code after its body heading", () => {
    assert.equal(isAppleTvOtpSubject("Your sign-in code for Apple TV"), true);
    assert.equal(isAppleTvOtpSubject("Your Apple ID receipt"), false);
    assert.equal(APPLE_TV_CODE_WINDOW_MINUTES, 30);
    assert.equal(extractAppleTvOtpCode({
        text: "Your sign-in code for Apple TV\n677009\nThis code expires in 30 minutes.",
    }), "677009");
});

test("does not accept a six-digit number without the Apple TV body heading", () => {
    assert.equal(extractAppleTvOtpCode({ text: "Apple TV sign-in requested. Reference 123456." }), null);
});
