const YOUTUBE_CHANNEL_ACCESS_CONDITIONS = [
    "📺 Al iniciar sesión, selecciona exactamente el canal indicado en la entrega. El correo de Google y el nombre del canal pueden ser distintos.",
    "🔐 Si Google solicita verificación, entra en Códigos, escribe el ID de suscripción y consulta el código cuando estés listo para ingresarlo. Cada código cambia cada 30 segundos.",
    "🛡️ No cambies la contraseña, los datos de recuperación ni la verificación en dos pasos. Tampoco renombres ni elimines el canal asignado.",
    "🆘 Si el canal indicado no aparece o no puedes acceder, contacta a soporte antes de hacer cambios o nuevos intentos.",
];

const DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS = [
    "🎵 CONDICIONES DE COMPRA - YOUTUBE MUSIC",
    "📦 Tu compra incluye acceso a YouTube Music con las credenciales entregadas en el pedido.",
    ...YOUTUBE_CHANNEL_ACCESS_CONDITIONS,
].join("\n");

const DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS = [
    "▶️ CONDICIONES DE COMPRA - YOUTUBE 3 MESES",
    "📆 Tu compra incluye acceso a YouTube por el periodo de 3 meses indicado en el producto.",
    "📱 Dispositivos permitidos: 1 celular y 1 TV.",
    "⚠️ Si se detectan más celulares asociados, se anulará la garantía ante fallas o anomalías en el servicio.",
    "📦 Usa las credenciales entregadas en el pedido y selecciona el canal indicado.",
    ...YOUTUBE_CHANNEL_ACCESS_CONDITIONS.slice(1),
].join("\n");

module.exports = {
    DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
    DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
};
