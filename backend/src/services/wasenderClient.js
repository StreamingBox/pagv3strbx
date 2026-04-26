function normalizePhone(input) {
    const digits = String(input || "").replace(/\D/g, "");
    if (!digits) return "";
    return `+${digits}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEnvInt(name, fallback) {
    const raw = Number.parseInt(String(process.env[name] || ""), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function isRateLimited(status, data) {
    if (Number(status) === 429) return true;
    const text = String(data?.message || data?.error || "").toLowerCase();
    return text.includes("only send 1 message")
        || text.includes("free trial")
        || text.includes("rate");
}

let globalSendChain = Promise.resolve();
let lastGlobalSentAt = 0;

async function sendWaText({ token, to, text, context = "whatsapp" }) {
    const minGapMs = getEnvInt("WA_GLOBAL_MIN_GAP_MS", 5500);
    const maxRetries = getEnvInt("WA_RATE_LIMIT_MAX_RETRIES", 2);
    const retryBaseMs = getEnvInt("WA_RATE_LIMIT_RETRY_BASE_MS", 65000);

    const work = async () => {
        const normalizedTo = normalizePhone(to);
        let attempts = 0;
        let retryCount = 0;
        let lastResult = {
            ok: false,
            status: 500,
            data: { success: false, message: "send_failed" },
        };

        while (attempts <= maxRetries) {
            attempts += 1;

            const waitMs = Math.max(0, minGapMs - (Date.now() - lastGlobalSentAt));
            if (waitMs > 0) await sleep(waitMs);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch("https://www.wasenderapi.com/api/send-message", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ to: normalizedTo, text }),
                    signal: controller.signal,
                });
                const data = await response.json().catch(() => ({}));
                const ok = response.ok && data?.success !== false;
                lastGlobalSentAt = Date.now();

                lastResult = { ok, status: response.status, data };
                if (ok) {
                    return { ...lastResult, attempts, retryCount };
                }

                if (!isRateLimited(response.status, data) || attempts > maxRetries) {
                    console.warn("[whatsapp.send] failed", {
                        context,
                        to: normalizedTo,
                        status: response.status,
                        providerMessage: data?.message || data?.error || null,
                        attempts,
                    });
                    return { ...lastResult, attempts, retryCount };
                }

                retryCount += 1;
                const backoffMs = retryBaseMs * Math.pow(2, retryCount - 1);
                console.warn("[whatsapp.send] rate_limited_retry", {
                    context,
                    to: normalizedTo,
                    status: response.status,
                    attempts,
                    backoffMs,
                });
                await sleep(backoffMs);
            } catch (error) {
                lastGlobalSentAt = Date.now();
                const status = error?.name === "AbortError" ? 504 : 500;
                const message = error?.name === "AbortError"
                    ? "Timeout enviando mensaje a WhatsApp provider."
                    : (error?.message || "send_failed");

                lastResult = {
                    ok: false,
                    status,
                    data: { success: false, message },
                };

                console.error("[whatsapp.send] exception", {
                    context,
                    to: normalizedTo,
                    attempts,
                    message,
                });

                if (attempts > maxRetries) {
                    return { ...lastResult, attempts, retryCount };
                }

                retryCount += 1;
                const backoffMs = retryBaseMs * Math.pow(2, retryCount - 1);
                await sleep(backoffMs);
            } finally {
                clearTimeout(timeout);
            }
        }

        return { ...lastResult, attempts, retryCount };
    };

    const scheduled = globalSendChain.then(work, work);
    globalSendChain = scheduled.then(() => undefined, () => undefined);
    return scheduled;
}

module.exports = {
    sendWaText,
    normalizePhone,
};
