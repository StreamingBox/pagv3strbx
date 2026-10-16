import { Component } from "react";
import { RefreshCw } from "lucide-react";
import {
    claimAutomaticAssetRecovery,
    isAssetLoadError,
    refreshApplicationAssets,
    reloadCurrentPage,
} from "./assetLoadRecovery.js";
import "./AppErrorBoundary.css";

export default class AppErrorBoundary extends Component {
    state = {
        error: null,
        refreshing: false,
        autoRecoveryAttempted: false,
        automaticRecoveryUnavailable: false,
    };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error("Application render error", error);

        if (!isAssetLoadError(error)) return;

        let recoveryClaim = null;
        try {
            recoveryClaim = claimAutomaticAssetRecovery(window.sessionStorage);
        } catch {
            // Keep the manual recovery available when storage is blocked.
        }

        if (recoveryClaim === true) {
            void this.refreshApplication();
            return;
        }

        this.setState({
            autoRecoveryAttempted: recoveryClaim === false,
            automaticRecoveryUnavailable: recoveryClaim === null,
        });
    }

    async refreshApplication() {
        if (this.state.refreshing) return;
        this.setState({ refreshing: true });
        try {
            await refreshApplicationAssets({
                cacheStorage: "caches" in window ? window.caches : null,
                serviceWorkerContainer: "serviceWorker" in navigator ? navigator.serviceWorker : null,
                origin: window.location.origin,
            });
        } catch {
            // Reload even if this browser does not expose cache or worker APIs.
        }
        reloadCurrentPage();
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
                            ? this.state.autoRecoveryAttempted
                                ? "La vista sigue sin cargar después del intento automático. Puedes volver a actualizar la aplicación."
                                : this.state.automaticRecoveryUnavailable
                                    ? "No pudimos iniciar la actualización automática. Pulsa el botón para volver a cargar la aplicación."
                                    : "Detectamos archivos desactualizados. Estamos actualizando la aplicación para volver a cargar esta vista."
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
                        {this.state.refreshing
                            ? "Actualizando aplicación…"
                            : (this.state.autoRecoveryAttempted || this.state.automaticRecoveryUnavailable) && assetError
                                ? "Intentar de nuevo"
                                : "Actualizar aplicación"}
                    </button>
                </section>
            </div>
        );
    }
}
