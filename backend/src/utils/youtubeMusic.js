const YOUTUBE_CHANNEL_ACCESS_CONDITIONS = [
    "🔑 Ingresa con el correo y la contraseña incluidos en tu pedido.",
    "📺 Selecciona siempre el canal indicado en tu pedido. El nombre del canal puede ser distinto al correo de Google.",
    "🔐 Después de ingresar la contraseña, Google solicitará Google Authenticator. Si aparece una pantalla de opciones, elige «Probar otra manera» o «Elegir otra opción» y luego «Google Authenticator».",
    "🆘 Cuando aparezca el espacio para el código de Google Authenticator, déjalo abierto y contacta al soporte por el medio indicado en tu pedido. Comparte tu número de pedido y solicita el código temporal de Google Authenticator.",
    "⏱️ Ingresa el código de Google Authenticator de inmediato: cambia cada 30 segundos. Si vence antes de usarlo, solicita uno nuevo a soporte.",
    "🛡️ No cambies la contraseña, los datos de recuperación ni la configuración de seguridad. No cambies ni elimines el canal indicado. Si no aparece Google Authenticator o el canal, detente y contacta a soporte.",
];

const DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS = [
    "🎵 CONDICIONES DE COMPRA - YOUTUBE MUSIC",
    "📦 Tu compra incluye acceso a YouTube Music con las credenciales entregadas en el pedido.",
    ...YOUTUBE_CHANNEL_ACCESS_CONDITIONS,
].join("\n");

const DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS = [
    "▶️ CONDICIONES DE COMPRA - YOUTUBE 3 MESES",
    "📆 Tu compra incluye acceso a YouTube por el periodo de 3 meses indicado en el producto.",
    ...YOUTUBE_CHANNEL_ACCESS_CONDITIONS,
].join("\n");

module.exports = {
    DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
    DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
    YOUTUBE_CHANNEL_ACCESS_CONDITIONS,
};
