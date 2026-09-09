const assert = require("node:assert/strict");
const test = require("node:test");
const { getOAuthRedirectUri } = require("../src/services/googleDriveService");

test("builds the Drive callback from the configured public origin", () => {
    const previousRedirect = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
    const previousPublic = process.env.PUBLIC_BASE_URL;
    const previousFrontend = process.env.FRONTEND_URL;

    try {
        delete process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
        process.env.PUBLIC_BASE_URL = "https://www.strbx.com.co/";
        delete process.env.FRONTEND_URL;

        assert.equal(
            getOAuthRedirectUri(),
            "https://www.strbx.com.co/api/admin/advertising/drive/oauth/callback"
        );
    } finally {
        if (previousRedirect === undefined) delete process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
        else process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI = previousRedirect;
        if (previousPublic === undefined) delete process.env.PUBLIC_BASE_URL;
        else process.env.PUBLIC_BASE_URL = previousPublic;
        if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = previousFrontend;
    }
});

test("normalizes an explicit Drive callback without a trailing slash", () => {
    const previous = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
    try {
        process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI =
            "https://strbx.com.co/api/admin/advertising/drive/oauth/callback/";
        assert.equal(
            getOAuthRedirectUri(),
            "https://strbx.com.co/api/admin/advertising/drive/oauth/callback"
        );
    } finally {
        if (previous === undefined) delete process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
        else process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI = previous;
    }
});
