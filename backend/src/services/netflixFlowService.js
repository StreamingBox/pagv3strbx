// BACKEND: pagv2strbx/src/services/netflixFlowService.js
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const { getImapConfig, safeToDate } = require("../utils/imapConfig");

function getNetflixAxiosOptions() {
    const insecureTls = String(process.env.NETFLIX_TLS_INSECURE || "").toLowerCase() === "true";

    return {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "es-ES,es;q=0.9",
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: !insecureTls,
        }),
        maxRedirects: 10,
        timeout: 15000,
    };
}

function isTlsCertificateError(error) {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toUpperCase();

    return (
        message.includes("self-signed certificate") ||
        message.includes("unable to verify the first certificate") ||
        message.includes("certificate") ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        code === "SELF_SIGNED_CERT_IN_CHAIN" ||
        code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    );
}

/**
 * Entra al link de "Obtener código"
 */
async function scrapeTemporalCode(link) {
    try {
        const { data } = await axios.get(link, getNetflixAxiosOptions());

        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";

        // Si el enlace expiró
        if (textContent.includes("Este enlace ya no es válido") || textContent.includes("expired")) {
            return { ok: false, status: "expired", message: "El enlace del código de Netflix ya venció. Solicita uno nuevo." };
        }

        // Buscar el código de 4 dígitos en el texto renderizado.
        // Usualmente Netflix lo pone grande.
        // Buscamos un bloque de 4 dígitos rodeado de espacios o al final, pero es riesgoso sin contexto.
        // Haremos un regex específico: código de 4 números.
        const codeMatch = textContent.match(/\b(\d{4})\b/);

        if (codeMatch && codeMatch[1]) {
            return { ok: true, type: "code", code: codeMatch[1] };
        }

        // Si no lo encuentra por regex a lo bruto, intentamos ver si hay una caja con el código
        return { ok: false, status: "not_found", message: "No se encontró el código de 4 dígitos en la página de Netflix." };

    } catch (err) {
        console.error("Error scraping temporal code:", err.message);
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "tls_error",
                message: "Error TLS al abrir el enlace de Netflix. Revisa certificados o activa NETFLIX_TLS_INSECURE=true temporalmente.",
            };
        }
        return { ok: false, status: "network_error", message: "Error al leer el enlace de Netflix." };
    }
}

/**
 * Entra al link de "Aprobar" dispositivo
 */
async function scrapeApproveLink(link, deviceName) {
    try {
        const { data } = await axios.get(link, getNetflixAxiosOptions());

        // Netflix suele aprobarlo al abrir o confirmar. 
        // Asumiremos que el GET es suficiente, basándonos en cómo funciona el deep link en los correos recientes de Netflix.
        // Si Netflix requiere un POST posterior, habría que hacerlo aquí, pero usualmente los tokens de email son 1-click GET o redirect.

        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";

        if (textContent.includes("Este enlace ya no es válido") || textContent.includes("expired")) {
            return { ok: false, status: "expired", message: "El enlace de aprobación de Netflix ya venció." };
        }

        return { ok: true, type: "approval", deviceName: deviceName || "Dispositivo Desconocido" };

    } catch (err) {
        console.error("Error scraping approval link:", err.message);
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "tls_error",
                message: "Error TLS al abrir el enlace de aprobacion de Netflix. Revisa certificados o activa NETFLIX_TLS_INSECURE=true temporalmente.",
            };
        }
        return { ok: false, status: "network_error", message: "Error al confirmar aprobación de Netflix." };
    }
}


/**
 * Busca específicamente los flujos nuevos de Netflix en Gmail
 */
async function fetchNetflixFlow({ toEmail, maxAgeMinutes = 15, action = "code" }) {
    const config = getImapConfig();
    if (!config) return { ok: false, status: "config_error", message: "Faltan variables GMAIL." };

    const ms = maxAgeMinutes * 60 * 1000;
    // Retrocedemos 24 horas para garantizar que cubrimos los últimos mensajes sin problemas de zona horaria
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let conn;
    let stage = "connect";
    try {
        conn = await imaps.connect(config);
        stage = "open_box";
        await conn.openBox("INBOX");

        stage = "search_headers";
        let criteria = [["SINCE", sinceDate]];
        if (toEmail && String(toEmail).trim()) {
            criteria.push(["TO", String(toEmail).trim()]);
        }

        let messages = await conn.search(criteria, { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false });

        if (!messages || messages.length === 0) {
            stage = "search_headers_fallback";
            messages = await conn.search([["SINCE", sinceDate]], { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false });
        }

        if (!messages || messages.length === 0) {
            return { ok: false, status: "mailbox_empty", message: "No hay correos recientes en la bandeja." };
        }

        // Ordenar más reciente a antiguo
        messages.sort((a, b) => {
            const da = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const db = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return db - da;
        });

        const fromNeedle = "netflix.com";
        let sawExpiredMatch = false;
        let sawSenderMatch = false;
        let sawTargetMatch = false;

        for (const msg of messages) {
            const msgDate = safeToDate(msg?.attributes?.date);
            if (!msgDate) continue;

            const ageMin = (Date.now() - msgDate.getTime()) / 1000 / 60;

            // Buscar el header
            const headerPart = msg?.parts?.find(p => p.which.includes("HEADER"));
            const headers = headerPart?.body || {};

            const fromField = (headers.from && headers.from[0]) ? String(headers.from[0]).toLowerCase() : "";
            const toField = (headers.to && headers.to[0]) ? String(headers.to[0]).toLowerCase() : "";
            
            // Verificamos explícitamente el 'toEmail' por seguridad (en caso del fallback sin búsqueda estricta 'TO' en IMAP)
            if (toEmail && !toField.includes(String(toEmail).trim().toLowerCase())) {
                continue;
            }

            if (!fromField.includes(fromNeedle)) continue;
            sawSenderMatch = true;

            if (ageMin > maxAgeMinutes) {
                sawExpiredMatch = true;
                continue; // Está vencido, pero no detenemos, tal vez haya otro
            }

            const subject = (headers.subject && headers.subject[0]) ? String(headers.subject[0]).toLowerCase() : "";

            // ¿Coincide el subject con lo que buscamos?
            let isTarget = false;
            // Aceptar "código de acceso temporal" o "código para iniciar sesión" u "código", e incluso correos de "hogar" y variaciones en inglés
            if (action === "code" && (subject.includes("código") || subject.includes("codigo") || subject.includes("iniciar sesión") || subject.includes("hogar") || subject.includes("actualizaci") || subject.includes("code"))) isTarget = true;
            if (action === "approve" && (subject.includes("solicitud de inicio de sesión") || subject.includes("aprueba la nueva solicitud") || subject.includes("hogar") || subject.includes("approve") || subject.includes("request"))) isTarget = true;

            if (!isTarget) continue;
            sawTargetMatch = true;

            // ¡Encontramos el correo correcto! Ahora sí pedimos el cuerpo completo
            stage = "fetch_full_message";
            const fetchFull = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            if (!fetchFull || !fetchFull[0]) continue;

            const raw = fetchFull[0].parts?.find(p => p.which === "");
            if (!raw?.body) continue;

            stage = "parse_message";
            const parsed = await simpleParser(raw.body);
            const html = String(parsed.html || "");
            const text = String(parsed.text || "");

            // 1. FLUJO: CÓDIGO TEMPORAL
            if (action === "code") {
                const $ = cheerio.load(html);
                const buttonLink = $("a").filter((i, el) => {
                    return $(el).text().toLowerCase().includes("obtener") || $(el).attr("href")?.includes("netflix.com/account/travel/verify");
                }).attr("href");

                if (buttonLink) {
                    stage = "open_netflix_code_link";
                    const result = await scrapeTemporalCode(buttonLink);
                    if (result.ok || result.status === "expired") {
                        return { ...result, emailDate: msgDate };
                    }
                } else {
                    let extractedCode = null;

                    // 1. Buscar en HTML con Cheerio dentro de cualquier etiqueta
                    $('*').each((i, el) => {
                        const t = $(el).text().trim();
                        if (/^([0-9]\s*){4,6}$/.test(t)) {
                            extractedCode = t.replace(/\s/g, '');
                        }
                    });

                    // 2. Fallback: buscarlo en texto plano
                    if (!extractedCode) {
                        const plainMatches = text.match(/\b(?:[0-9]\s*){4,6}\b/g);
                        if (plainMatches) {
                            for (let mt of plainMatches) {
                                let rm = mt.replace(/\s/g, '');
                                if (rm.length >= 4 && rm !== "2023" && rm !== "2024" && rm !== "2025" && rm !== "2026") {
                                    extractedCode = rm;
                                    break;
                                }
                            }
                        }
                    }

                    if (extractedCode) {
                        return { ok: true, type: "code", code: extractedCode, emailDate: msgDate };
                    }
                }
            }

            // 2. FLUJO: APROBAR DISPOSITIVO
            if (action === "approve") {
                const $ = cheerio.load(html);
                const buttonLink = $("a").filter((i, el) => {
                    return $(el).text().toLowerCase().includes("aprobar") || $(el).attr("href")?.includes("netflix.com/account/approve");
                }).attr("href");

                if (!buttonLink) continue;

                let deviceName = "Tu Dispositivo";
                const matchDevice = text.match(/desde:\s*([^\n]+)/i);
                if (matchDevice && matchDevice[1]) {
                    deviceName = matchDevice[1].trim();
                }

                stage = "open_netflix_approve_link";
                const result = await scrapeApproveLink(buttonLink, deviceName);
                if (result.ok || result.status === "expired") {
                    return { ...result, emailDate: msgDate };
                }
            }
        }

        if (sawExpiredMatch) {
            return { ok: false, status: "expired", message: `El correo de Netflix está vencido (más de ${maxAgeMinutes} min).` };
        }

        if (!sawSenderMatch) {
            return { ok: false, status: "sender_mismatch", message: "No se encontraron correos recientes del remitente configurado." };
        }

        if (!sawTargetMatch) {
            return { ok: false, status: "netflix_flow_miss", message: "No se encontraron correos nuevos con códigos o aprobaciones." };
        }

        return { ok: false, status: "netflix_flow_miss", message: "Se detectó el correo de Netflix, pero no se pudo completar el flujo." };

    } catch (err) {
        console.error("[netflixFlowService] error", {
            stage,
            toEmail,
            action,
            message: err?.message || String(err),
            code: err?.code || null,
            imapTlsInsecure: String(process.env.IMAP_TLS_INSECURE || "").toLowerCase() === "true",
            netflixTlsInsecure: String(process.env.NETFLIX_TLS_INSECURE || "").toLowerCase() === "true",
        });
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: stage.startsWith("open_netflix_") ? "netflix_tls_error" : "imap_tls_error",
                message: stage.startsWith("open_netflix_")
                    ? `Error TLS abriendo enlace de Netflix durante ${stage}.`
                    : `Error TLS en Gmail IMAP durante ${stage}.`,
            };
        }
        return { ok: false, status: "imap_error", message: err?.message || "Error leyendo correos." };
    } finally {
        if (conn) {
            try { await conn.end(); } catch (_) { }
        }
    }
}

module.exports = { fetchNetflixFlow };
