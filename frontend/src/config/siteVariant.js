export function isLiteSite() {
    const envVariant = String(import.meta.env.VITE_SITE_VARIANT || "").trim().toLowerCase();
    if (envVariant === "lite" || envVariant === "client" || envVariant === "cliente") return true;

    if (typeof window === "undefined") return false;
    const host = String(window.location.hostname || "").trim().toLowerCase();
    return host.startsWith("lite.") || host.startsWith("cliente.") || host.startsWith("clientes.");
}

export function getSiteVariant() {
    return isLiteSite() ? "lite" : "reseller";
}
