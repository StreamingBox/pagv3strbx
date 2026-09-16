const axios = require("axios");

const NETFLIX_TV_URL = "https://www.netflix.com/tv2";
const DEFAULT_TIMEOUT_MS = 25000;

function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function normalizeTvCode(value) {
    const digits = normalizeDigits(value);
    return digits.length === 8 ? digits : "";
}

function workerBaseUrl() {
    return String(process.env.NETFLIX_TV_SETUP_WORKER_URL || "").trim().replace(/\/$/, "");
}

function workerToken() {
    return String(process.env.NETFLIX_TV_SETUP_WORKER_TOKEN || "").trim();
}

function workerHeaders() {
    const token = workerToken();
    return token ? { "x-tv-setup-token": token } : {};
}

function result(status, message, extra = {}) {
    return { ok: false, status, message, ...extra };
}

function mapWorkerError(error, fallbackStatus, fallbackMessage) {
    const response = error?.response?.data;
    if (response?.status && response?.message) return result(response.status, response.message);
    if (error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""))) {
        return result("automation_timeout", "El servicio de automatización tardó demasiado en responder.");
    }
    if (error?.response?.status === 401 || error?.response?.status === 403) {
        return result("worker_unauthorized", "El servicio de automatización no está autenticado correctamente.");
    }
    if (error?.response?.status >= 500) {
        return result("worker_unavailable", "El servicio de automatización no está disponible en este momento.");
    }
    return result(fallbackStatus, fallbackMessage);
}

async function cancelWorkerSession(baseUrl, sessionId) {
    if (!sessionId) return;
    await axios.post(`${baseUrl}/run/cancel`, { sessionId }, {
        headers: workerHeaders(),
        timeout: 5000,
    }).catch(() => {});
}

async function runNetflixTvSetup({ tvCode, accountEmail, requestLoginCode }) {
    const normalizedTvCode = normalizeTvCode(tvCode);
    const email = String(accountEmail || "").trim();
    const baseUrl = workerBaseUrl();

    if (!normalizedTvCode) return result("invalid_tv_code", "El código del TV debe tener 8 dígitos.");
    if (!email) return result("account_email_missing", "El pedido no tiene un correo de cuenta asignado.");
    if (typeof requestLoginCode !== "function") return result("login_code_unavailable", "No fue posible preparar el código de Inicio.");
    if (!baseUrl || !workerToken()) {
        return result("worker_config_error", "El servicio de automatización no está configurado en el servidor.");
    }

    let sessionId = null;
    try {
        const startResponse = await axios.post(`${baseUrl}/run/start`, {
            tvCode: normalizedTvCode,
            accountEmail: email,
        }, {
            headers: workerHeaders(),
            timeout: DEFAULT_TIMEOUT_MS,
        });
        const start = startResponse.data || {};
        if (!start.ok) return result(start.status || "automation_error", start.message || "No se pudo iniciar la conexión con Netflix.");
        sessionId = String(start.sessionId || "").trim();
        if (!sessionId) return result("worker_protocol_error", "El servicio de automatización no devolvió una sesión válida.");

        const loginCodeResult = await requestLoginCode();
        if (!loginCodeResult?.ok || !loginCodeResult.code) {
            await cancelWorkerSession(baseUrl, sessionId);
            return result(
                loginCodeResult?.status || "login_code_unavailable",
                loginCodeResult?.message || "No se pudo consultar el código de Inicio de la cuenta.",
            );
        }
        const loginCode = normalizeDigits(loginCodeResult.code);
        if (!/^\d{4}$/.test(loginCode)) {
            await cancelWorkerSession(baseUrl, sessionId);
            return result("invalid_login_code", "El proveedor no devolvió un código de Inicio válido.");
        }

        const completeResponse = await axios.post(`${baseUrl}/run/complete`, {
            sessionId,
            loginCode,
        }, {
            headers: workerHeaders(),
            timeout: DEFAULT_TIMEOUT_MS,
        });
        const complete = completeResponse.data || {};
        sessionId = null;
        if (!complete.ok) return result(complete.status || "automation_error", complete.message || "Netflix no confirmó la conexión del TV.");
        return { ok: true, status: "completed", finalUrl: complete.finalUrl || null };
    } catch (error) {
        await cancelWorkerSession(baseUrl, sessionId);
        console.error("[netflixTvSetup] worker error", { message: error?.message || String(error) });
        return mapWorkerError(error, "worker_unavailable", "No fue posible conectar con el servicio de automatización.");
    }
}

module.exports = {
    NETFLIX_TV_URL,
    runNetflixTvSetup,
    __test: { normalizeTvCode, mapWorkerError, workerBaseUrl },
};
