const assert = require("node:assert/strict");
const test = require("node:test");
const migration = require("../src/migrations/049_youtube_music_channel_name_and_terms");
const {
    DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
    DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
} = require("../src/utils/youtubeMusic");
const conditionsMigration = require("../src/migrations/051_youtube_product_conditions_with_emojis");
const loginInstructionsMigration = require("../src/migrations/054_youtube_login_instructions");
const { isYouTubeChannelProduct, isYouTubeMusicProduct } = require("../src/utils/productDeliveryProfile");

test("YouTube Music detection is independent of profile naming", () => {
    assert.equal(isYouTubeMusicProduct({ platformName: "YouTube Music" }), true);
    assert.equal(isYouTubeMusicProduct({ platformSlug: "youtube-music-premium" }), true);
    assert.equal(isYouTubeMusicProduct({ platformName: "YouTube Premium" }), false);
});

test("YouTube channel accounts include the three-month product", () => {
    assert.equal(isYouTubeChannelProduct({ platformName: "YouTube Music" }), true);
    assert.equal(isYouTubeChannelProduct({ platformName: "Youtube 3 meses" }), true);
    assert.equal(isYouTubeChannelProduct({ platformSlug: "youtube-premium-3-months" }), true);
    assert.equal(isYouTubeChannelProduct({ platformName: "YouTube Premium" }), false);
});

test("YouTube Music migration adds channel storage and preserves existing product details", async () => {
    const calls = [];
    await migration.up({
        query: async (sql, params = []) => calls.push({ sql, params }),
    });

    assert.match(calls[0].sql, /ADD COLUMN youtube_channel_name VARCHAR\(180\) NULL/);
    assert.match(calls[1].sql, /CONCAT\(/);
    assert.match(calls[1].sql, /NOT LIKE '%CONDICIONES DE COMPRA - YOUTUBE MUSIC%'/);
    assert.equal(calls[1].params[0], DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS);
    assert.match(DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS, /selecciona siempre el canal indicado en tu pedido/i);
});

test("YouTube purchase-condition migration updates Music and three-month products separately", async () => {
    const calls = [];
    await conditionsMigration.up({
        query: async (sql, params = []) => calls.push({ sql, params }),
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /youtube music/);
    assert.equal(calls[0].params[0], DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS);
    assert.match(calls[1].sql, /youtube%3%mes/);
    assert.equal(calls[1].params[0], DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS);
    assert.match(DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS, /📺/u);
    assert.match(DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS, /Google Authenticator/u);
    assert.match(DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS, /30 segundos/u);
});

test("YouTube login conditions explain mandatory channel and Google Authenticator steps", () => {
    for (const details of [
        DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
        DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
    ]) {
        assert.match(details, /correo y la contraseña incluidos en tu pedido/i);
        assert.match(details, /selecciona siempre el canal indicado en tu pedido/i);
        assert.match(details, /Google Authenticator/u);
        assert.match(details, /Probar otra manera/u);
        assert.match(details, /número de pedido/u);
        assert.match(details, /código temporal de Google Authenticator/u);
        assert.match(details, /código de Google Authenticator de inmediato/u);
        assert.match(details, /30 segundos/u);
        assert.doesNotMatch(details, /entra en Códigos/u);
        assert.doesNotMatch(details, /1 celular y 1 TV/u);
    }
    assert.match(DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS, /3 meses/u);
});

test("YouTube login migration updates only unchanged legacy default conditions", async () => {
    const calls = [];
    await loginInstructionsMigration.up({
        query: async (sql, params = []) => calls.push({ sql, params }),
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].sql, /youtube music/);
    assert.match(calls[0].sql, /AND product_details = \?/);
    assert.equal(calls[0].params[0], DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS);
    assert.match(calls[0].params[1], /entra en Códigos/u);
    assert.match(calls[1].sql, /youtube%3%mes/);
    assert.match(calls[1].sql, /AND product_details = \?/);
    assert.equal(calls[1].params[0], DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS);
    assert.match(calls[1].params[1], /1 celular y 1 TV/u);
});
