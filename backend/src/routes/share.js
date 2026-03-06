const express = require("express");
const pool = require("../db");
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

function fmtYMD(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function daysLeft(date) {
  if (!date) return null;
  const end = new Date(date);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

router.get("/s/:token", async (req, res) => {
  try {
    const { token } = req.params;

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
         cl.show_whatsapp,
         u.whatsapp AS whatsapp_number,
         p.type AS platform_type,
         p.whatsapp_instructions
       FROM credential_links cl
       JOIN subscriptions s ON s.id = cl.subscription_id
       JOIN platforms p ON p.id = s.platform_id
       LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
       LEFT JOIN users u ON u.id = cl.created_by_user_id
       WHERE cl.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows.length) return res.status(404).send("Link inválido.");

    const r = rows[0];

    const expired = new Date(r.expires_at).getTime() < Date.now();
    const statusOk = r.status === "active";
    if (expired || !statusOk) return res.status(403).send("Este link ya expiró.");

    const exp = fmtYMD(r.expires_at);
    const remaining = daysLeft(r.expires_at);

    // ✅ WhatsApp condicional (desde users)
    const showWA = Number(r.show_whatsapp) === 1 && !!r.whatsapp_number;

    const waNumber = showWA ? String(r.whatsapp_number) : null;
    const waMsg = encodeURIComponent(
      `Hola, necesito ayuda con mi cuenta.\nPedido: ${r.order_id}\nPlataforma: ${r.platform_name}`
    );
    const waLink = showWA ? `https://wa.me/${encodeURIComponent(waNumber)}?text=${waMsg}` : "";

    const waButtonHtml = showWA
      ? `
        <div class="wa">
          <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.11 17.31c-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.12-.57.12-.17.25-.66.81-.81.98-.15.17-.3.19-.56.06-.25-.12-1.06-.39-2.02-1.24-.75-.67-1.26-1.49-1.41-1.74-.15-.25-.02-.39.11-.51.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.09-.17.04-.32-.02-.45-.06-.12-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.43h-.49c-.17 0-.45.06-.68.32-.23.25-.89.87-.89 2.12 0 1.24.91 2.45 1.04 2.62.12.17 1.79 2.74 4.33 3.84.61.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.48-.6 1.69-1.18.21-.57.21-1.06.15-1.18-.06-.11-.23-.17-.48-.3Z" fill="white"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.46 1.65 6.33L3 29l6.83-1.59A12.95 12.95 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3Zm0 23.63c-2.03 0-3.92-.6-5.52-1.63l-.4-.25-4.05.94.96-3.95-.26-.41A10.59 10.59 0 0 1 5.38 16C5.38 10.17 10.17 5.38 16 5.38S26.62 10.17 26.62 16 21.83 26.62 16 26.62Z" fill="white"/>
            </svg>
            Contactar por WhatsApp
          </a>
        </div>
      `
      : "";

    const platformName = escapeHtml(r.platform_name || "Plataforma");
    const email = escapeHtml(r.email || "-");
    const password = escapeHtml(r.password || "-");
    const pin = escapeHtml(r.pin ?? "-");
    const profile = escapeHtml(r.profile_number ?? "-");
    const orderId = escapeHtml(r.order_id ?? "-");
    const expEsc = escapeHtml(exp);
    const remainingEsc = escapeHtml(remaining === null ? "-" : remaining);

    const statusText = expired ? "Vencido" : "Activo";
    const statusClass = expired ? "danger" : "ok";

    const isEmailMode = r.platform_type === 'correo';
    const customWaitMsg = r.whatsapp_instructions || "Por favor, escribe al administrador para continuar con el proceso.";

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
      gap:10px;
      padding: 12px 18px;
      border-radius: 999px;
      text-decoration:none;
      font-weight: 800;
      color:#fff;
      background: linear-gradient(180deg, #22d46b, #17b556);
      box-shadow: 0 10px 30px rgba(32,212,106,.18);
    }
    .wa svg{ width: 20px; height: 20px; }
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
    
    ${isEmailMode ? `
        <div class="row" style="flex-direction: column; text-align: center; gap: 8px; padding: 20px 0;">
            <div style="font-size: 24px;">📧</div>
            <div style="color: var(--text); font-weight: bold;">Plataforma bajo pedido</div>
            <div style="color: var(--muted); font-size: 13px;">${escapeHtml(customWaitMsg)}</div>
        </div>
    ` : `
        <div class="row"><div class="label">Correo:</div><div class="value">${email}</div></div>
        <div class="row"><div class="label">Contraseña:</div><div class="value">${password}</div></div>
        <div class="row"><div class="label">Perfil:</div><div class="value">${profile}</div></div>
        <div class="row"><div class="label">Pin:</div><div class="value">${pin}</div></div>
    `}
    
    <div class="row"><div class="label">Fecha Final:</div><div class="value">${expEsc}</div></div>
    <div class="row"><div class="label">Días restantes:</div><div class="value">${remainingEsc}</div></div>
    <div class="row"><div class="label">Estado:</div>
      <div class="value"><span class="status ${statusClass}">${escapeHtml(statusText)}</span></div>
    </div>

    ${waButtonHtml}

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
