import { Component } from "react";
import { RefreshCw } from "lucide-react";
import "./AppErrorBoundary.css";

function isAssetLoadError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("dynamically imported module")
        || message.includes("loading chunk")
        || message.includes("failed to fetch")
        || message.includes("importing a module script failed");
}

export default class AppErrorBoundary extends Component {
    state = { error: null, refreshing: false };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        // Keep the application usable when a deploy replaces a lazy-loaded bundle.
        console.error("Application render error", error);
    }

    async refreshApplication() {
        if (this.state.refreshing) return;
        this.setState({ refreshing: true });
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
            <div className="page-shell app-error-boundary">
                <div className="page-shell-bg" aria-hidden="true"><div className="bg-grid" /></div>
                <section className="app-error-boundary__card" role="alert" aria-labelledby="app-error-title">
                    <div className="app-error-boundary__icon" aria-hidden="true"><RefreshCw size={22} /></div>
                    <p className="app-error-boundary__eyebrow">Actualización disponible</p>
                    <h1 id="app-error-title" className="app-error-boundary__title">No se pudo cargar esta vista</h1>
                    <p className="app-error-boundary__message">
                        {assetError
                            ? "Esta página tenía una versión anterior en memoria. Actualízala para cargar los archivos más recientes."
                            : "Ocurrió un error inesperado al abrir esta vista. Actualiza la aplicación para volver a intentarlo."}
                    </p>
                    <button
                        className="app-error-boundary__button"
                        type="button"
                        onClick={() => this.refreshApplication()}
                        disabled={this.state.refreshing}
                        aria-busy={this.state.refreshing}
                    >
                        <RefreshCw size={17} className={this.state.refreshing ? "app-error-boundary__spin" : undefined} aria-hidden="true" />
                        {this.state.refreshing ? "Actualizando..." : "Actualizar aplicación"}
                    </button>
                </section>
            </div>
        );
    }
}
