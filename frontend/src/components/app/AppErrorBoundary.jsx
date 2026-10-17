import { Component } from "react";
import { RefreshCw } from "lucide-react";
import {
    claimAutomaticAssetRecovery,
    isAssetLoadError,
    refreshApplicationAssets,
    reloadCurrentPage,
    shouldRecoverStartupRenderError,
    STARTUP_RENDER_RECOVERY_ATTEMPT_KEY,
} from "./assetLoadRecovery.js";
import "./AppErrorBoundary.css";

export default class AppErrorBoundary extends Component {
    state = {
        error: null,
        refreshing: false,
        autoRecoveryAttempted: false,
        automaticRecoveryUnavailable: false,
        automaticRecoveryKind: null,
        errorHandled: true,
    };

    userInteracted = false;
    interactionEvents = ["input", "change", "submit"];

    markUserInteraction = () => {
        this.userInteracted = true;
    };

    componentDidMount() {
        this.interactionEvents.forEach((eventName) => {
            document.addEventListener(eventName, this.markUserInteraction, true);
        });
    }

    componentWillUnmount() {
        this.interactionEvents.forEach((eventName) => {
            document.removeEventListener(eventName, this.markUserInteraction, true);
        });
    }

    isStartupRenderRecovery(error) {
        const navigation = window.performance?.getEntriesByType?.("navigation")?.[0];
        const elapsedMs = window.performance?.now?.() - (navigation?.startTime ?? 0);
        return shouldRecoverStartupRenderError(error, {
            pathname: window.location.pathname,
            elapsedMs,
            userInteracted: this.userInteracted,
        });
    }

    static getDerivedStateFromError(error) {
        return { error, errorHandled: false };
    }

    componentDidCatch(error) {
        console.error("Application render error", error);

        const assetError = isAssetLoadError(error);
        const startupError = !assetError && this.isStartupRenderRecovery(error);
        if (!assetError && !startupError) {
            this.setState({ errorHandled: true });
            return;
        }

        let recoveryClaim = null;
        try {
            recoveryClaim = claimAutomaticAssetRecovery(
                window.sessionStorage,
                startupError ? STARTUP_RENDER_RECOVERY_ATTEMPT_KEY : undefined
            );
        } catch {
            // Keep the manual recovery available when storage is blocked.
        }

        if (recoveryClaim === true) {
            this.setState({ errorHandled: true, automaticRecoveryKind: startupError ? "startup" : "assets" });
            void this.refreshApplication();
            return;
        }

        this.setState({
            errorHandled: true,
            autoRecoveryAttempted: recoveryClaim === false,
            automaticRecoveryUnavailable: recoveryClaim === null,
            automaticRecoveryKind: startupError ? "startup" : "assets",
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
        const startupError = !assetError && this.isStartupRenderRecovery(error);
        const startupRecovery = this.state.automaticRecoveryKind === "startup" || startupError;
        const automaticRecovery = this.state.refreshing && this.state.automaticRecoveryKind;
        const loadingView = !this.state.errorHandled || automaticRecovery;
        let message;
        if (!this.state.errorHandled) {
            message = startupRecovery
                ? "Estamos preparando la vista y comprobando la carga."
                : "Estamos comprobando la aplicación antes de mostrar el error.";
        } else if (automaticRecovery && startupRecovery) {
            message = "Detectamos un problema al iniciar y estamos reintentando la carga una sola vez.";
        } else if (assetError) {
            message = this.state.autoRecoveryAttempted
                ? "La vista sigue sin cargar después del intento automático. Puedes volver a actualizar la aplicación."
                : this.state.automaticRecoveryUnavailable
                    ? "No pudimos iniciar la actualización automática. Pulsa el botón para volver a cargar la aplicación."
                    : "Detectamos archivos desactualizados. Estamos actualizando la aplicación para volver a cargar esta vista.";
        } else if (startupRecovery && this.state.autoRecoveryAttempted) {
            message = "La vista sigue sin cargar después del reintento inicial. Puedes volver a intentarlo.";
        } else if (startupRecovery && this.state.automaticRecoveryUnavailable) {
            message = "No pudimos iniciar la recuperación automática. Pulsa el botón para volver a cargar la vista.";
        } else {
            message = "Ocurrió un error inesperado al abrir esta vista. Actualiza la aplicación para volver a intentarlo.";
        }
        return (
            <div className="page-shell app-error-boundary">
                <div className="page-shell-bg" aria-hidden="true"><div className="bg-grid" /></div>
                <section className="app-error-boundary__card" role="alert" aria-labelledby="app-error-title">
                    <div className="app-error-boundary__icon" aria-hidden="true"><RefreshCw size={22} className={loadingView ? "app-error-boundary__spin" : undefined} /></div>
                    <p className="app-error-boundary__eyebrow">
                        {startupRecovery ? "Recuperación de la vista" : assetError ? "Actualización disponible" : "Error de carga"}
                    </p>
                    <h1 id="app-error-title" className="app-error-boundary__title">
                        {loadingView
                            ? startupRecovery ? "Recuperando la vista" : "Actualizando la aplicación"
                            : "No se pudo cargar esta vista"}
                    </h1>
                    <p className="app-error-boundary__message">{message}</p>
                    {this.state.errorHandled ? <button
                        className="app-error-boundary__button"
                        type="button"
                        onClick={() => this.refreshApplication()}
                        disabled={this.state.refreshing}
                        aria-busy={this.state.refreshing}
                    >
                        <RefreshCw size={17} className={this.state.refreshing ? "app-error-boundary__spin" : undefined} aria-hidden="true" />
                        {this.state.refreshing
                            ? startupRecovery ? "Recuperando vista…" : "Actualizando aplicación…"
                            : (this.state.autoRecoveryAttempted || this.state.automaticRecoveryUnavailable) && (assetError || startupRecovery)
                                ? "Intentar de nuevo"
                                : "Actualizar aplicación"}
                    </button> : null}
                </section>
            </div>
        );
    }
}
