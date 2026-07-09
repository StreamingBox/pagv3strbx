const DEFAULT_TEMPLATES = [
    {
        title: "Clave actualizada",
        resolutionType: "repaired",
        resolutionSubtype: "password_updated",
        body: "Hola, revisamos la cuenta y actualizamos la clave. Ya puedes ingresar nuevamente con las credenciales del enlace de tu compra.",
    },
    {
        title: "Inicio aprobado en TV",
        resolutionType: "repaired",
        resolutionSubtype: "login_approved",
        body: "Hola, ya aprobamos el inicio de sesion del dispositivo. Por favor intenta ingresar nuevamente desde tu TV.",
    },
    {
        title: "Instrucciones enviadas",
        resolutionType: "repaired",
        resolutionSubtype: "usage_guidance_sent",
        body: "Hola, te dejamos las instrucciones para continuar. Ingresa a la pagina de codigos, coloca el ID de tu pedido y solicita el codigo correspondiente. Si el error continua, responde con una nueva evidencia.",
    },
    {
        title: "Cuenta reemplazada",
        resolutionType: "replaced",
        resolutionSubtype: "account_replaced",
        body: "Hola, reemplazamos la cuenta reportada. Ya puedes consultar las nuevas credenciales en el enlace de tu compra.",
    },
    {
        title: "Garantia no aplica",
        resolutionType: "other",
        resolutionSubtype: "warranty_denied",
        body: "Hola, revisamos el caso y la garantia no aplica para esta novedad. Recuerda validar las condiciones de uso del producto antes de compartir o cambiar de dispositivo.",
    },
];

module.exports = {
    id: "023_support_response_templates",
    name: "Add support response templates",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS support_response_templates (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(120) NOT NULL,
                resolution_type VARCHAR(32) NOT NULL,
                resolution_subtype VARCHAR(64) NULL,
                body TEXT NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                sort_order INT NOT NULL DEFAULT 0,
                created_by_user_id INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_support_templates_active (is_active, resolution_type, sort_order)
            )
        `);

        for (let index = 0; index < DEFAULT_TEMPLATES.length; index += 1) {
            const item = DEFAULT_TEMPLATES[index];
            await query(
                `INSERT INTO support_response_templates
                    (title, resolution_type, resolution_subtype, body, sort_order)
                 SELECT ?, ?, ?, ?, ?
                  WHERE NOT EXISTS (
                    SELECT 1 FROM support_response_templates WHERE title = ? LIMIT 1
                  )`,
                [
                    item.title,
                    item.resolutionType,
                    item.resolutionSubtype,
                    item.body,
                    (index + 1) * 10,
                    item.title,
                ]
            );
        }
    },
};
