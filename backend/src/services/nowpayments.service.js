const axios = require("axios");

const BASE_URL = String(process.env.NOWPAYMENTS_BASE_URL || "https://api.nowpayments.io/v1").replace(/\/+$/, "");
const API_KEY = String(process.env.NOWPAYMENTS_API_KEY || "").trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "https://strbx.com.co").replace(/\/+$/, "");
const DEFAULT_PAY_CURRENCY = String(process.env.NOWPAYMENTS_PAY_CURRENCY || "usdtbsc").trim().toLowerCase();
const DEFAULT_PRICE_CURRENCY = String(process.env.NOWPAYMENTS_PRICE_CURRENCY || "usd").trim().toLowerCase();
const WEBHOOK_URL = String(process.env.NOWPAYMENTS_WEBHOOK_URL || `${PUBLIC_BASE_URL}/api/payments/nowpayments/webhook`).trim();

function requireNowPaymentsConfig() {
    if (!API_KEY) {
        const err = new Error("NOWPayments API key no configurada.");
        err.status = 503;
        throw err;
    }
}

function buildDepositOrderId(userId) {
    return `wallet-${userId}-${Date.now()}`;
}

async function createNowPaymentsPayment({
    userId,
    amount,
    priceCurrency = DEFAULT_PRICE_CURRENCY,
    payCurrency = DEFAULT_PAY_CURRENCY,
}) {
    requireNowPaymentsConfig();

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        const err = new Error("El monto de recarga debe ser mayor a 0.");
        err.status = 400;
        throw err;
    }

    const payload = {
        price_amount: Number(numericAmount.toFixed(2)),
        price_currency: String(priceCurrency || DEFAULT_PRICE_CURRENCY).trim().toLowerCase(),
        pay_currency: String(payCurrency || DEFAULT_PAY_CURRENCY).trim().toLowerCase(),
        ipn_callback_url: WEBHOOK_URL,
        order_id: buildDepositOrderId(userId),
        order_description: `Recarga de wallet usuario #${userId}`,
        is_fixed_rate: true,
    };

    const response = await axios.post(`${BASE_URL}/payment`, payload, {
        headers: {
            "x-api-key": API_KEY,
            "Content-Type": "application/json",
        },
        timeout: 15000,
    });

    return {
        request: payload,
        response: response.data,
    };
}

async function fetchNowPaymentsStatus(paymentId) {
    requireNowPaymentsConfig();
    const response = await axios.get(`${BASE_URL}/payment/${paymentId}`, {
        headers: {
            "x-api-key": API_KEY,
            "Content-Type": "application/json",
        },
        timeout: 15000,
    });
    return response.data;
}

module.exports = {
    createNowPaymentsPayment,
    fetchNowPaymentsStatus,
    DEFAULT_PAY_CURRENCY,
    DEFAULT_PRICE_CURRENCY,
    WEBHOOK_URL,
};
