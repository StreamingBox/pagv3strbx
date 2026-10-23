const requiredFeatures = [
    "cardRenewalDate",
    "providerReportedAt",
    "historyIds",
    "Exportar vista",
    "Exportar todas",
];

export function assertProviderFeatures(code) {
    const missing = requiredFeatures.filter((feature) => !code.includes(feature));
    if (missing.length) {
        throw new Error(`Provider release is missing saved features: ${missing.join(", ")}`);
    }
}

export function providerReleaseGuard() {
    return {
        name: "provider-release-guard",
        apply: "build",
        generateBundle(_options, bundle) {
            // Inspect the emitted component, not unrelated or leftover asset files.
            const providerChunk = Object.values(bundle).find((entry) => entry.type === "chunk"
                && Object.keys(entry.modules).some((id) => id.replaceAll("\\", "/").endsWith("/src/pages/AdminProviders.jsx")));
            if (!providerChunk) {
                this.error("Provider release is missing the AdminProviders component");
                return;
            }
            try {
                assertProviderFeatures(providerChunk.code);
            } catch (error) {
                this.error(error.message);
            }
        },
    };
}
