import { Component } from "react";

function isAssetLoadError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("dynamically imported module")
        || message.includes("loading chunk")
        || message.includes("failed to fetch")
        || message.includes("importing a module script failed");
}

export default class AppErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        // Keep the application usable when a deploy replaces a lazy-loaded bundle.
        console.error("Application render error", error);
    }

    async refreshApplication() {
        try {
            if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
            }
            if ("serviceWorker" in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((registration) => registration.update()));
            }
        } catch {
            // A normal reload is still useful even if a browser blocks cache access.
        }
        window.location.reload();
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const assetError = isAssetLoadError(error);
        return (
            <div className="page-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
                <div className="page-shell-bg" aria-hidden="true"><div className="bg-grid" /></div>
                <section style={{ position: "relative", zIndex: 1, width: "min(100%, 520px)", padding: 28, border: "1px solid var(--stroke)", borderRadius: 12, background: "var(--card)", boxShadow: "var(--shadow)" }}>
                    <p style={{ margin: "0 0 8px", color: "var(--cyan)", fontWeight: 800, fontSize: 12, textTransform: "uppercase" }}>Actualizacion disponible</p>
                    <h1 style={{ margin: "0 0 10px", color: "var(--text)", fontSize: 24 }}>No se pudo cargar esta vista</h1>
                    <p style={{ margin: "0 0 22px", color: "var(--muted)", lineHeight: 1.55 }}>
                        {assetError
                            ? "La pagina tenia una version anterior en memoria. Actualizala para cargar los archivos nuevos."
                            : "Ocurrio un error inesperado al abrir esta vista. Puedes intentar actualizar la aplicacion."}
                    </p>
                    <button className="btn-primary" type="button" onClick={() => this.refreshApplication()}>Actualizar aplicacion</button>
                </section>
            </div>
        );
    }
}
