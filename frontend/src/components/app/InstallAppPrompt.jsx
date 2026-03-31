import { useEffect, useState } from "react";

const STORAGE_KEY = "sb-install-banner-dismissed-at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7;

function isStandaloneMode() {
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    return window.navigator.standalone === true;
}

export default function InstallAppPrompt() {
    const [promptEvent, setPromptEvent] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [showIosHint, setShowIosHint] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        if (isStandaloneMode()) return undefined;

        try {
            const dismissedAt = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
            if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) {
                setDismissed(true);
                return undefined;
            }
        } catch {
            // ignore localStorage errors
        }

        const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
        setShowIosHint(isIos);

        const onBeforeInstallPrompt = (event) => {
            event.preventDefault();
            setPromptEvent(event);
        };

        const onInstalled = () => {
            setDismissed(true);
            setPromptEvent(null);
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    if (dismissed || isStandaloneMode()) return null;
    if (!promptEvent && !showIosHint) return null;

    const handleInstall = async () => {
        if (!promptEvent) return;
        promptEvent.prompt();
        try {
            await promptEvent.userChoice;
        } finally {
            setPromptEvent(null);
            setDismissed(true);
        }
    };

    const handleDismiss = () => {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
            // ignore localStorage errors
        }
        setDismissed(true);
    };

    return (
        <div className="install-app-banner" role="status" aria-live="polite">
            <div className="install-app-icon" aria-hidden="true">
                <img src="/app-icon.svg" alt="" />
            </div>
            <div className="install-app-copy">
                <strong>App de Streaming Box</strong>
                <span>
                    {promptEvent
                        ? "Instala esta pagina como app para abrirla mas rapido desde tu celular o escritorio."
                        : "En iPhone abre compartir y toca \"Agregar a pantalla de inicio\" para instalarla."}
                </span>
            </div>
            <div className="install-app-actions">
                {promptEvent ? (
                    <button type="button" className="install-app-primary" onClick={handleInstall}>
                        Instalar app
                    </button>
                ) : null}
                <button type="button" className="install-app-secondary" onClick={handleDismiss}>
                    Cerrar
                </button>
            </div>
        </div>
    );
}
