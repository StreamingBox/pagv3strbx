const {
    DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
    DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
} = require("../utils/youtubeMusic");

const LEGACY_YOUTUBE_MUSIC_PRODUCT_DETAILS = [
    "🎵 CONDICIONES DE COMPRA - YOUTUBE MUSIC",
    "📦 Tu compra incluye acceso a YouTube Music con las credenciales entregadas en el pedido.",
    "📺 Al iniciar sesión, selecciona exactamente el canal indicado en la entrega. El correo de Google y el nombre del canal pueden ser distintos.",
    "🔐 Si Google solicita verificación, entra en Códigos, escribe el ID de suscripción y consulta el código cuando estés listo para ingresarlo. Cada código cambia cada 30 segundos.",
    "🛡️ No cambies la contraseña, los datos de recuperación ni la verificación en dos pasos. Tampoco renombres ni elimines el canal asignado.",
    "🆘 Si el canal indicado no aparece o no puedes acceder, contacta a soporte antes de hacer cambios o nuevos intentos.",
].join("\n");

const LEGACY_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS = [
    "▶️ CONDICIONES DE COMPRA - YOUTUBE 3 MESES",
    "📆 Tu compra incluye acceso a YouTube por el periodo de 3 meses indicado en el producto.",
    "📱 Dispositivos permitidos: 1 celular y 1 TV.",
    "⚠️ Si se detectan más celulares asociados, se anulará la garantía ante fallas o anomalías en el servicio.",
    "📦 Usa las credenciales entregadas en el pedido y selecciona el canal indicado.",
    "🔐 Si Google solicita verificación, entra en Códigos, escribe el ID de suscripción y consulta el código cuando estés listo para ingresarlo. Cada código cambia cada 30 segundos.",
    "🛡️ No cambies la contraseña, los datos de recuperación ni la verificación en dos pasos. Tampoco renombres ni elimines el canal asignado.",
    "🆘 Si el canal indicado no aparece o no puedes acceder, contacta a soporte antes de hacer cambios o nuevos intentos.",
].join("\n");

module.exports = {
    id: "054_youtube_login_instructions",
    name: "Update YouTube customer login and Google Authenticator instructions",
    async up({ query }) {
        await query(
            `UPDATE platforms
                SET product_details = ?
              WHERE (LOWER(name) LIKE '%youtube music%'
                 OR LOWER(slug) LIKE '%youtube-music%')
                AND product_details = ?`,
            [DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS, LEGACY_YOUTUBE_MUSIC_PRODUCT_DETAILS]
        );
        await query(
            `UPDATE platforms
                SET product_details = ?
              WHERE (LOWER(name) LIKE '%youtube%3%mes%'
                 OR LOWER(slug) LIKE '%youtube%3%mes%'
                 OR LOWER(name) LIKE '%youtube%3%month%'
                 OR LOWER(slug) LIKE '%youtube%3%month%')
                AND product_details = ?`,
            [DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS, LEGACY_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS]
        );
    },
};
