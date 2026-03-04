// BACKEND: pagv2strbx/src/services/netflixFlowService.js
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const axios = require("axios");
const cheerio = require("cheerio");
const { getImapConfig, safeToDate } = require("../utils/imapConfig");

/**
 * Entra al link de "Obtener código"
 */
async function scrapeTemporalCode(link) {
    try {
        const { data } = await axios.get(link, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9",
            }
        });

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
        return { ok: false, status: "network_error", message: "Error al leer el enlace de Netflix." };
    }
}

/**
 * Entra al link de "Aprobar" dispositivo
 */
async function scrapeApproveLink(link, deviceName) {
    try {
        const { data } = await axios.get(link, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9",
            }
        });

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
    const sinceDate = new Date(new Date(Date.now() - ms).setHours(0, 0, 0, 0));

    let conn;
    try {
        conn = await imaps.connect(config);
        await conn.openBox("INBOX");

        let criteria = [["SINCE", sinceDate]];
        if (toEmail && String(toEmail).trim()) {
            criteria.push(["TO", String(toEmail).trim()]);
        }

        let messages = await conn.search(criteria, { bodies: [""], markSeen: false });

        if (!messages?.length) {
            messages = await conn.search([["SINCE", sinceDate]], { bodies: [""], markSeen: false });
        }

        if (!messages?.length) {
            return { ok: false, status: "not_found", message: "No hay correos recientes en la bandeja." };
        }

        // Ordenar más reciente a antiguo
        messages.sort((a, b) => {
            const da = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const db = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return db - da;
        });

        const fromNeedle = "netflix.com";
        let sawExpiredMatch = false;

        for (const msg of messages) {
            const msgDate = safeToDate(msg?.attributes?.date);
            if (!msgDate) continue;

            const ageMin = (Date.now() - msgDate.getTime()) / 1000 / 60;

            const envFrom = (msg?.attributes?.envelope?.from || [])
                .map((f) => `${f.mailbox || ""}@${f.host || ""}`.toLowerCase())
                .join(" ") || "";

            if (!envFrom.includes(fromNeedle)) continue;

            if (ageMin > maxAgeMinutes) {
                sawExpiredMatch = true;
                continue;
            }

            const raw = msg?.parts?.find((p) => p.which === "");
            if (!raw?.body) continue;

            const parsed = await simpleParser(raw.body);
            const subject = String(parsed.subject || "").toLowerCase();
            const html = String(parsed.html || "");
            const text = String(parsed.text || "");

            // 1. FLUJO: CÓDIGO TEMPORAL
            if (action === "code" && subject.includes("código de acceso temporal")) {
                const $ = cheerio.load(html);
                const buttonLink = $("a").filter((i, el) => {
                    return $(el).text().toLowerCase().includes("obtener") || $(el).attr("href")?.includes("netflix.com/account/travel/verify");
                }).attr("href");

                if (!buttonLink) continue; // Prueba el siguiente correo

                const result = await scrapeTemporalCode(buttonLink);
                if (result.ok || result.status === "expired") {
                    return { ...result, emailDate: msgDate };
                }
            }

            // 2. FLUJO: APROBAR DISPOSITIVO
            if (action === "approve" && (subject.includes("solicitud de inicio de sesión") || subject.includes("aprueba la nueva solicitud"))) {
                const $ = cheerio.load(html);
                const buttonLink = $("a").filter((i, el) => {
                    return $(el).text().toLowerCase().includes("aprobar") || $(el).attr("href")?.includes("netflix.com/account/approve");
                }).attr("href");

                if (!buttonLink) continue; // Prueba el siguiente correo

                // Intentar extraer el nombre del dispositivo
                // "Solicitud de Profile One desde: Samsung - Smart TV"
                let deviceName = "Tu Dispositivo";
                const matchDevice = text.match(/desde:\s*([^\n]+)/i);
                if (matchDevice && matchDevice[1]) {
                    deviceName = matchDevice[1].trim();
                }

                const result = await scrapeApproveLink(buttonLink, deviceName);
                if (result.ok || result.status === "expired") {
                    return { ...result, emailDate: msgDate };
                }
            }
        }

        if (sawExpiredMatch) {
            return { ok: false, status: "expired", message: `El correo de Netflix está vencido (más de ${maxAgeMinutes} min).` };
        }

        return { ok: false, status: "not_found", message: "No se encontraron correos nuevos con códigos o aprobaciones." };

    } catch (err) {
        return { ok: false, status: "imap_error", message: err?.message || "Error leyendo correos." };
    } finally {
        if (conn) {
            try { await conn.end(); } catch (_) { }
        }
    }
}

module.exports = { fetchNetflixFlow };
