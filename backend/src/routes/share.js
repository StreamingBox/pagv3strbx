const express = require("express");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { cleanupExpiredCredentialLinks } = require("../utils/tokens");
const {
  daysRemainingStoredDateOnly,
  formatDateOnlyBogota,
  formatStoredDateOnly,
  isDateTimeExpired,
  isStoredDateOnlyExpired,
} = require("../utils/date");
const router = express.Router();

function escapeHtml(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wantsJson(req) {
  const q = String(req.query.format || "").toLowerCase();
  if (q === "json") return true;
  const accept = String(req.get("Accept") || "");
  return accept.includes("application/json") && !accept.includes("text/html");
}

function normalizeWhatsappNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function buildAccountHelpWhatsappUrl({ platformName, orderId }) {
  const number = normalizeWhatsappNumber(process.env.SALES_CONTACT_PHONE || "3152485340");
  if (!number) return "";

  const text = encodeURIComponent(
    `Hola, necesito ayuda con mi cuenta.\nID de cuenta: ${orderId || "-"}\nPlataforma: ${platformName || "-"}`
  );
  return `https://wa.me/${number}?text=${text}`;
}

/**
 * Límite extra solo para GET JSON de credenciales (además del límite global en index.js).
 * No cuenta peticiones HTML.
 */
const shareJsonCredentialLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.CREDENTIAL_JSON_RATE_MAX || 5),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !wantsJson(req),
    message: { ok: false, error: "Demasiadas solicitudes JSON a este enlace. Espera un minuto." },
});

/**
 * Evita que clientes arbitrarios (curl, otros sitios) obtengan JSON de credenciales solo con el token.
 * Navegadores envían Sec-Fetch-Site en fetch same-origin; la página HTML envía Referer coherente.
 */
function assertJsonCredentialFetchAllowed(req, token) {
    if (String(process.env.CREDENTIAL_SHARE_JSON_STRICT || "true").toLowerCase() === "false") {
        return true;
    }
    if (String(process.env.CREDENTIAL_JSON_ALLOW_INSECURE || "").toLowerCase() === "true") {
        return true;
    }
    const sfs = String(req.get("Sec-Fetch-Site") || "").toLowerCase();
    if (sfs === "same-origin" || sfs === "same-site") {
        return true;
    }
    const referer = String(req.get("Referer") || "");
    const needle = `/s/${token}`;
    if (referer.includes(needle)) {
        return true;
    }
    // Algunos navegadores móviles o configuraciones de privacidad no envían
    // Sec-Fetch-Site ni Referer en fetch same-origin. Si la petición parece
    // venir de un navegador real y no trae Origin cruzado, permitimos el JSON.
    const origin = String(req.get("Origin") || "");
    const userAgent = String(req.get("User-Agent") || "");
    const looksLikeBrowser = /\bmozilla\/|applewebkit|chrome\/|safari\/|firefox\/|edg\//i.test(userAgent);
    if (!origin && looksLikeBrowser) {
        return true;
    }
    return false;
}

async function loadCredentialByToken(token) {
  const [rows] = await pool.query(
    `SELECT
       cl.token,
       cl.revoked_at,
       s.id AS order_id,
       s.expires_at,
       s.status,
       p.name AS platform_name,
       a.email,
       a.password,
       a.pin,
       a.profile_number,
       a.expires_at AS account_expires_at,
       p.type AS platform_type
     FROM credential_links cl
     JOIN subscriptions s ON s.id = cl.subscription_id
     JOIN platforms p ON p.id = s.platform_id
     LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
     WHERE cl.token = ?
     LIMIT 1`,
    [token]
  );
  return rows.length ? rows[0] : null;
}

router.get("/s/:token", shareJsonCredentialLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    cleanupExpiredCredentialLinks(pool).catch(() => {});

    // Esta página necesita poder hacer un fetch same-origin a su versión JSON.
    // El helmet global usa "no-referrer", lo que impide que el backend valide
    // el Referer en navegadores donde Sec-Fetch-* no llega consistente.
    res.set("Referrer-Policy", "same-origin");

    if (wantsJson(req) && !assertJsonCredentialFetchAllowed(req, token)) {
      return res.status(403).json({ ok: false, error: "Solicitud no permitida." });
    }

    const r = await loadCredentialByToken(token);
    if (!r) {
      if (wantsJson(req)) {
        return res.status(404).json({ ok: false, error: "Link inválido." });
      }
      return res.status(404).send("Link inválido.");
    }

    const displayExpiresAt = r.account_expires_at || r.expires_at;
    if (r.revoked_at) {
      if (wantsJson(req)) {
        return res.status(403).json({ ok: false, error: "Este link fue desactivado." });
      }
      return res.status(403).send("Este link fue desactivado.");
    }

    const expired = r.account_expires_at
      ? isDateTimeExpired(r.account_expires_at)
      : isStoredDateOnlyExpired(r.expires_at);
    const statusOk = r.status === "active";
    if (expired || !statusOk) {
      pool.query("DELETE FROM credential_links WHERE token = ?", [token]).catch(() => {});
      if (wantsJson(req)) {
        return res.status(403).json({ ok: false, error: "Este link ya expiró." });
      }
      return res.status(403).send("Este link ya expiró.");
    }

    const exp = r.account_expires_at
      ? formatDateOnlyBogota(r.account_expires_at)
      : formatStoredDateOnly(r.expires_at);
    const remaining = r.account_expires_at
      ? daysRemainingStoredDateOnly(formatDateOnlyBogota(r.account_expires_at))
      : daysRemainingStoredDateOnly(r.expires_at);
    const isEmailMode = r.platform_type === "correo";

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");

    if (wantsJson(req)) {
      return res.json({
        ok: true,
        platformName: r.platform_name,
        orderId: r.order_id,
        email: r.email,
        password: r.password,
        pin: r.pin,
        profileNumber: r.profile_number,
        expiresAt: displayExpiresAt,
        expiresLabel: exp,
        daysRemaining: remaining,
        status: r.status,
        platformType: r.platform_type,
        isEmailMode,
      });
    }

    const platformName = escapeHtml(r.platform_name || "Plataforma");
    const orderId = escapeHtml(r.order_id ?? "-");
    const expEsc = escapeHtml(exp);
    const remainingEsc = escapeHtml(remaining === null ? "-" : remaining);
    const whatsappUrl = escapeHtml(buildAccountHelpWhatsappUrl({
      platformName: r.platform_name,
      orderId: r.order_id,
    }));

    const statusText = expired ? "Vencido" : "Activo";
    const statusClass = expired ? "danger" : "ok";

    const customWaitMsg = "Por favor, contacta a soporte para continuar con el proceso.";

    const credentialsBlock = isEmailMode
      ? `
        <div class="row" style="flex-direction: column; text-align: center; gap: 8px; padding: 20px 0;">
            <div style="font-size: 24px;">📧</div>
            <div style="color: var(--text); font-weight: bold;">Plataforma bajo pedido</div>
            <div style="color: var(--muted); font-size: 13px;">${escapeHtml(customWaitMsg)}</div>
        </div>
    `
      : `
        <div id="cred-status" class="row" style="display:none;"><div class="label"></div><div class="value cred-err"></div></div>
        <div class="row cred-row"><div class="label">Correo:</div><div class="value" id="cred-email">Cargando…</div></div>
        <div class="row cred-row"><div class="label">Contraseña:</div><div class="value" id="cred-pass">…</div></div>
        <div class="row cred-row"><div class="label">Perfil:</div><div class="value" id="cred-profile">…</div></div>
        <div class="row cred-row"><div class="label">Pin:</div><div class="value" id="cred-pin">…</div></div>
        <script>
          (function () {
            var q = location.search ? "&" : "?";
            var url = location.pathname + q + "format=json";
            fetch(url, {
              credentials: "same-origin",
              mode: "same-origin",
              referrerPolicy: "same-origin",
              headers: { Accept: "application/json" }
            })
              .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
              .then(function (x) {
                if (!x.ok || !x.j || !x.j.ok) {
                  var msg = (x.j && x.j.error) ? x.j.error : "No se pudieron cargar las credenciales.";
                  document.querySelectorAll(".cred-row").forEach(function (el) { el.style.display = "none"; });
                  var st = document.getElementById("cred-status");
                  if (st) { st.style.display = "flex"; st.querySelector(".cred-err").textContent = msg; }
                  return;
                }
                var d = x.j;
                function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v == null || v === "" ? "—" : String(v); }
                set("cred-email", d.email);
                set("cred-pass", d.password);
                set("cred-profile", d.profileNumber);
                set("cred-pin", d.pin);
              })
              .catch(function () {
                document.querySelectorAll(".cred-row").forEach(function (el) { el.style.display = "none"; });
                var st = document.getElementById("cred-status");
                if (st) { st.style.display = "flex"; st.querySelector(".cred-err").textContent = "Error de conexión al cargar credenciales."; }
              });
          })();
        <\/script>
    `;

    return res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Detalle Cuenta</title>
  <style>
    :root{
      --bg1:#060606; --bg2:#141414;
      --card1:#1b1b1b; --card2:#101010;
      --text:#f2f2f2; --muted:#c9c9c9;
      --accent:#ff2d8d;
      --ok:#20d46a; --danger:#ff4d4d;
      --shadow: 0 20px 60px rgba(0,0,0,.55);
      --radius: 18px;
    }
    *{ box-sizing:border-box; }
    body{
      margin:0; min-height:100vh;
      display:flex; align-items:center; justify-content:center;
      padding:28px 16px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:var(--text);
      background:
        radial-gradient(800px 500px at 50% 20%, rgba(255,45,141,.10), transparent 60%),
        radial-gradient(700px 450px at 30% 80%, rgba(32,212,106,.08), transparent 60%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
    }
    .card{
      width:min(460px, 100%);
      background: linear-gradient(180deg, rgba(27,27,27,.96), rgba(16,16,16,.96));
      border: 1px solid rgba(255,255,255,.06);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 26px 22px 22px;
      overflow:hidden;
    }
    .brand{
      text-align:center;
      font-weight:800;
      letter-spacing:.8px;
      opacity:.9;
      margin-bottom: 14px;
      text-transform: uppercase;
      font-size: 12px;
    }
    .title{
      text-align:center;
      font-size: 34px;
      font-weight: 800;
      color: var(--accent);
      margin: 6px 0 10px;
    }
    .divider{
      height: 2px;
      width: 82%;
      margin: 8px auto 18px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity:.9;
    }
    .row{
      display:flex;
      gap:12px;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    .row:last-of-type{ border-bottom: none; }
    .label{
      width: 140px;
      font-weight: 800;
      color: var(--text);
    }
    .value{
      flex:1;
      color: var(--muted);
      word-break: break-word;
    }
    .status.ok{ color: var(--ok); font-weight:900; }
    .status.danger{ color: var(--danger); font-weight:900; }
    .wa{
      margin-top: 18px;
      display:flex;
      justify-content:center;
    }
    .wa a{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      padding: 12px 18px;
      border-radius: 999px;
      text-decoration:none;
      font-size:14px;
      line-height:1.2;
      font-weight: 800;
      color:#fff;
      background: linear-gradient(180deg, #22d46b, #17b556);
      box-shadow: 0 10px 30px rgba(32,212,106,.18);
    }
    .wa a:hover{
      transform: translateY(-1px);
      box-shadow: 0 14px 34px rgba(32,212,106,.24);
    }
    .wa svg{ width: 20px; height: 20px; flex: 0 0 20px; }

    .hint{
      margin-top: 12px;
      text-align:center;
      font-size: 12px;
      color: rgba(255,255,255,.55);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">${platformName}</div>
    <div class="title">Detalle Cuenta</div>
    <div class="divider"></div>

    <div class="row"><div class="label">ID:</div><div class="value">${orderId}</div></div>

    ${credentialsBlock}

    <div class="row"><div class="label">Fecha Final:</div><div class="value">${expEsc}</div></div>
    <div class="row"><div class="label">Días restantes:</div><div class="value">${remainingEsc}</div></div>
    <div class="row"><div class="label">Estado:</div>
      <div class="value"><span class="status ${statusClass}">${escapeHtml(statusText)}</span></div>
    </div>

    ${whatsappUrl ? `
    <div class="wa">
      <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" aria-label="Contactar soporte por WhatsApp">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M19.11 17.31c-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.12-.57.12-.17.25-.66.81-.81.98-.15.17-.3.19-.56.06-.25-.12-1.06-.39-2.02-1.24-.75-.67-1.26-1.49-1.41-1.74-.15-.25-.02-.39.11-.51.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.09-.17.04-.32-.02-.45-.06-.12-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.43h-.49c-.17 0-.45.06-.68.32-.23.25-.89.87-.89 2.12 0 1.24.91 2.45 1.04 2.62.12.17 1.79 2.74 4.33 3.84.61.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.48-.6 1.69-1.18.21-.57.21-1.06.15-1.18-.06-.11-.23-.17-.48-.3Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.46 1.65 6.33L3 29l6.83-1.59A12.95 12.95 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3Zm0 23.63c-2.03 0-3.92-.6-5.52-1.63l-.4-.25-4.05.94.96-3.95-.26-.41A10.59 10.59 0 0 1 5.38 16C5.38 10.17 10.17 5.38 16 5.38S26.62 10.17 26.62 16 21.83 26.62 16 26.62Z" fill="white"/>
        </svg>
        <span>Contactar por WhatsApp</span>
      </a>
    </div>` : ""}

    <div class="hint">Si el link expira, solicita uno nuevo.</div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error interno.");
  }
});

module.exports = router;
