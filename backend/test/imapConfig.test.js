const assert = require("node:assert/strict");
const test = require("node:test");
const {
    isImapAuthenticationError,
    getImapAuthenticationMessage,
} = require("../src/utils/imapConfig");

test("detects Gmail IMAP authentication failures", () => {
    assert.equal(isImapAuthenticationError({ message: "Invalid credentials (Failure)" }), true);
    assert.equal(isImapAuthenticationError({ code: "AUTHENTICATIONFAILED" }), true);
    assert.equal(isImapAuthenticationError({ message: "connection timed out" }), false);
});

test("provides an actionable IMAP authentication message", () => {
    assert.match(getImapAuthenticationMessage(), /app password/i);
});
