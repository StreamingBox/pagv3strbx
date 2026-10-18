const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), override: false });

const { sendNewsletterTestEmail } = require("../src/services/newsletterMail.service");

sendNewsletterTestEmail()
    .then(() => {
        console.info("Correo de prueba de Newsletter enviado al destinatario configurado.");
    })
    .catch(() => {
        console.error("No se pudo enviar la prueba. Revisa la configuración SMTP de Newsletter sin compartir sus valores.");
        process.exitCode = 1;
    });
