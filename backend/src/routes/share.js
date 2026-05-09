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
