// BACKEND: pagv2strbx/src/services/netflixFlowService.js
const { simpleParser } = require("mailparser");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const { getImapConfig, safeToDate, getEnvBool, allowInsecureTls, connectImapWithTlsFallback, isTlsCertificateError } = require("../utils/imapConfig");

function getNetflixAxiosOptions() {
    const insecureTls = allowInsecureTls("NETFLIX_TLS_INSECURE");

    return {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: !insecureTls,
        }),
        maxRedirects: 10,
        timeout: 15000,
    };
}

function stripDiacritics(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
    return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTemporaryCodeCandidate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 4) return "";
    if (digits === "0000") return "";
    if (/^20[0-9]{2}$/.test(digits)) return "";
    return digits;
}

function firstTemporaryCodeCandidate(content) {
    const matches = String(content || "").match(/\b(?:[0-9][\s.\-]*){4}\b/g) || [];
    for (const match of matches) {
        const candidate = normalizeTemporaryCodeCandidate(match);
        if (candidate) return candidate;
    }
    return "";
}

function pageLooksExpired(content) {
    const normalized = normalizeText(content);
    return [
        "este enlace ya no es valido",
        "this link is no longer valid",
        "link has expired",
        "this link has expired",
        "solicita uno nuevo",
    ].some((needle) => normalized.includes(needle));
}

function extractNetflixTemporaryCode(content) {
    const source = String(content || "");
    const textOnly = cheerio.load(`<body>${source}</body>`)("body").text().replace(/\s+/g, " ").trim();
    const normalizedText = normalizeText(textOnly);
    const normalizedSource = normalizeText(source.replace(/<[^>]+>/g, " "));

    const $ = cheerio.load(source || "<body></body>");
    let isolatedCode = "";
    $("*").each((_, el) => {
        if (isolatedCode) return;
        const candidate = normalizeTemporaryCodeCandidate($(el).text());
        if (candidate) isolatedCode = candidate;
    });
    if (isolatedCode) return isolatedCode;

    const patterns = [
        /usa este codigo para ver netflix en tu dispositivo[\s\S]{0,260}?ingresa este codigo en el dispositivo solicitante para obtener acceso temporal\.?\s*((?:[0-9][\s.\-]*){4})/i,
        /ingresa este codigo en el dispositivo solicitante para obtener acceso temporal\.?\s*((?:[0-9][\s.\-]*){4})/i,
        /(?:codigo|code)[^0-9]{0,120}((?:[0-9][\s.\-]*){4})[^0-9]{0,180}(?:acceso temporal|temporary access|15 minutos|15 minutes|vence|expires)/i,
        /(?:acceso temporal|temporary access)[^0-9]{0,180}((?:[0-9][\s.\-]*){4})/i,
        /((?:[0-9][\s.\-]*){4})[^0-9]{0,180}(?:este codigo vence despues de 15 minutos|vence despues de 15 minutos|expires after 15 minutes|15 minutes)/i,
    ];

    for (const haystack of [normalizedText, normalizedSource, textOnly, source]) {
        for (const pattern of patterns) {
            const match = haystack.match(pattern);
            const candidate = normalizeTemporaryCodeCandidate(match?.[1]);
            if (candidate) {
                return candidate;
            }
        }
    }

    if (
        normalizedText.includes("acceso temporal")
        || normalizedText.includes("temporary access")
        || normalizedSource.includes("acceso temporal")
        || normalizedSource.includes("temporary access")
    ) {
        return firstTemporaryCodeCandidate(`${textOnly}\n${source}`);
    }

    return "";
}

async function scrapeTemporalCode(link, depth = 0, visited = new Set()) {
    try {
        const safeLink = String(link || "").trim();
        if (!safeLink) {
            return { ok: false, status: "not_found", message: "Netflix no envió un enlace válido para obtener el código." };
        }
        if (visited.has(safeLink)) {
            return { ok: false, status: "not_found", message: "Netflix devolvió un enlace repetido y no se pudo avanzar al código." };
        }
        visited.add(safeLink);

        const { data } = await axios.get(safeLink, getNetflixAxiosOptions());
        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";
        const combinedContent = `${data}\n${textContent}`;

        if (pageLooksExpired(combinedContent)) {
            return { ok: false, status: "expired", message: "El enlace del código de Netflix ya venció. Solicita uno nuevo." };
        }

        const directCode = extractNetflixTemporaryCode(combinedContent);
        if (directCode) {
            return { ok: true, type: "code", code: directCode };
        }

        if (depth < 2) {
            const nestedLink = findNetflixButtonLink(
                data,
                ["obtener codigo", "obtener código", "get code", "access code", "codigo temporal", "continuar", "continue"],
                ["netflix.com/account/travel/verify", "travel/verify", "netflix.com/account/travel", "account/travel"]
            );
            if (nestedLink && nestedLink !== safeLink) {
                return scrapeTemporalCode(nestedLink, depth + 1, visited);
            }
        }

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

function subjectMatchesAction(subject, action) {
    const s = normalizeText(subject);
    const normalizedAction = String(action || "code").toLowerCase();

    if (normalizedAction === "temporary") {
        return s.includes("codigo de acceso temporal")
            || s.includes("codigo temporal")
            || s.includes("acceso temporal")
            || s.includes("temporary access code")
            || s.includes("temporary code")
            || s.includes("temporary access");
    }

    if (normalizedAction === "approve") {
        return s.includes("solicitud de inicio de sesion")
            || s.includes("aprueba la nueva solicitud")
            || s.includes("approve")
            || s.includes("request");
    }

    if (
        s.includes("codigo de acceso temporal")
        || s.includes("codigo temporal")
        || s.includes("acceso temporal")
        || s.includes("temporary access code")
        || s.includes("temporary code")
        || s.includes("temporary access")
    ) {
        return false;
    }

    return s.includes("codigo")
        || s.includes("iniciar sesion")
        || s.includes("login")
        || s.includes("sign in")
        || s.includes("code");
}

function findNetflixButtonLink(html, textNeedles = [], hrefNeedles = []) {
    const $ = cheerio.load(String(html || ""));
    const links = $("a").toArray();
    for (const el of links) {
        const label = normalizeText($(el).text());
        const href = String($(el).attr("href") || "");
        const labelMatch = textNeedles.some((needle) => label.includes(normalizeText(needle)));
        const hrefMatch = hrefNeedles.some((needle) => href.toLowerCase().includes(String(needle).toLowerCase()));
        if (href && (labelMatch || hrefMatch)) return href;
    }
    return "";
}

/**
 * Entra al link de "Aprobar" dispositivo
 */
async function scrapeApproveLink(link, deviceName, depth = 0, visited = new Set()) {
    try {
        const safeLink = String(link || "").trim();
        if (!safeLink) {
            return { ok: false, status: "not_found", message: "Netflix no envió un enlace válido de aprobación." };
        }
        if (visited.has(safeLink)) {
            return { ok: false, status: "not_found", message: "Netflix devolvió un enlace repetido y no se pudo confirmar la aprobación." };
        }
        visited.add(safeLink);

        const { data } = await axios.get(safeLink, getNetflixAxiosOptions());

        // Netflix suele aprobarlo al abrir o confirmar. 
        // Asumiremos que el GET es suficiente, basándonos en cómo funciona el deep link en los correos recientes de Netflix.
        // Si Netflix requiere un POST posterior, habría que hacerlo aquí, pero usualmente los tokens de email son 1-click GET o redirect.

        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";
        const combinedContent = `${data}\n${textContent}`;

        if (pageLooksExpired(combinedContent)) {
            return { ok: false, status: "expired", message: "El enlace de aprobación de Netflix ya venció." };
        }

        if (depth < 2) {
            const nestedLink = findNetflixButtonLink(
                data,
                ["aprobar", "approve", "continuar", "continue"],
                ["netflix.com/account/approve", "account/approve"]
            );
            if (nestedLink && nestedLink !== safeLink) {
                return scrapeApproveLink(nestedLink, deviceName, depth + 1, visited);
            }
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
        conn = await connectImapWithTlsFallback(config, "netflixFlowService");
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
        let lastFlowFailure = null;

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

            const isTarget = subjectMatchesAction(subject, action);

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
            if (action === "temporary") {
                const buttonLink = findNetflixButtonLink(
                    html,
                    ["obtener codigo", "obtener código", "get code", "access code", "codigo temporal", "continuar", "continue"],
                    ["netflix.com/account/travel/verify", "travel/verify", "netflix.com/account/travel", "account/travel"]
                );

                if (buttonLink) {
                    stage = "open_netflix_code_link";
                    const result = await scrapeTemporalCode(buttonLink);
                    if (result.ok || result.status === "expired") {
                        return { ...result, emailDate: msgDate };
                    }
                    lastFlowFailure = result;
                } else {
                    const $ = cheerio.load(html || "<body></body>");
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

                const extractedCode = extractNetflixTemporaryCode(`${subject}\n${text}\n${html}`);
                if (extractedCode) {
                    return { ok: true, type: "code", code: extractedCode, emailDate: msgDate };
                }

                if (lastFlowFailure && lastFlowFailure.status !== "not_found") {
                    return { ...lastFlowFailure, emailDate: msgDate };
                }
            }

            // 2. FLUJO: CÓDIGO DE INICIO DE SESIÓN
            if (action === "code") {
                const htmlText = cheerio.load(html)("body").text() || "";
                const haystack = `${subject}\n${text}\n${htmlText}`;
                const patterns = [
                    /(?:codigo|c[oó]digo|code)[^0-9]{0,60}([0-9]{4,8})/i,
                    /\b([0-9]{4,8})\b/,
                ];

                for (const pattern of patterns) {
                    const match = haystack.match(pattern);
                    if (match?.[1] && !["2023", "2024", "2025", "2026"].includes(match[1])) {
                        return { ok: true, type: "code", code: match[1], emailDate: msgDate };
                    }
                }
            }

            // 3. FLUJO: APROBAR DISPOSITIVO
            if (action === "approve") {
                const buttonLink = findNetflixButtonLink(
                    html,
                    ["aprobar", "approve"],
                    ["netflix.com/account/approve", "account/approve"]
                );

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
            return { ok: false, status: "expired", message: `No se evidencia un correo reciente de Netflix en los ultimos ${maxAgeMinutes} minutos.` };
        }

        if (!sawSenderMatch) {
            return { ok: false, status: "sender_mismatch", message: "No se encontraron correos recientes del remitente configurado." };
        }

        if (!sawTargetMatch) {
            return { ok: false, status: "netflix_flow_miss", message: "No se encontraron correos nuevos de Netflix para el tipo de solicitud seleccionado." };
        }

        if (lastFlowFailure) {
            return lastFlowFailure;
        }

        return { ok: false, status: "netflix_flow_miss", message: "Se detectó el correo de Netflix, pero no se pudo completar el flujo." };

    } catch (err) {
        console.error("[netflixFlowService] error", {
            stage,
            toEmail,
            action,
            message: err?.message || String(err),
            code: err?.code || null,
            imapTlsInsecure: getEnvBool("IMAP_TLS_INSECURE"),
            netflixTlsInsecure: getEnvBool("NETFLIX_TLS_INSECURE"),
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
