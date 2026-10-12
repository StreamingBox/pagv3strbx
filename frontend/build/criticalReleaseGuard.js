const criticalComponents = [
    {
        moduleSuffix: "/src/pages/AdminAccounts.jsx",
        name: "AdminAccounts",
        features: [
            "Nombre del canal de YouTube *",
            "YouTube Music y YouTube 3 meses requieren la columna",
        ],
    },
    {
        moduleSuffix: "/src/pages/Codes.jsx",
        name: "Codes",
        features: [
            "¿Solicitar el código?",
            "El código es válido por 30 segundos.",
            "Como administrador, puedes volver a solicitar el código cuando lo necesites.",
        ],
    },
    {
        moduleSuffix: "/src/pages/AdminProviders.jsx",
        name: "AdminProviders",
        features: ["Top 5 proveedores", "Recordatorio de renovación"],
    },
];

export function assertCriticalReleaseFeatures(bundle) {
    const errors = [];

    for (const component of criticalComponents) {
        const chunk = Object.values(bundle).find((entry) => entry.type === "chunk"
            && Object.keys(entry.modules || {}).some((id) => id.replaceAll("\\", "/").endsWith(component.moduleSuffix)));

        if (!chunk) {
            errors.push(`${component.name} chunk is missing`);
            continue;
        }

        const missingFeatures = component.features.filter((feature) => !chunk.code.includes(feature));
        if (missingFeatures.length) errors.push(`${component.name}: ${missingFeatures.join(", ")}`);
    }

    if (errors.length) throw new Error(`Frontend release is missing required features: ${errors.join("; ")}`);
}

export function criticalReleaseGuard() {
    return {
        name: "critical-release-guard",
        apply: "build",
        generateBundle(_options, bundle) {
            try {
                assertCriticalReleaseFeatures(bundle);
            } catch (error) {
                this.error(error.message);
            }
        },
    };
}
