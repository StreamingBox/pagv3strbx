import { ArrowLeft, Home, MonitorPlay, SearchX, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import StreamingBoxLogo from "../components/StreamingBoxLogo.jsx";
import "../styles/not-found.css";

function getHomePath(user) {
    if (!user?.id) return "/";
    return String(user.role || "user").toLowerCase() === "admin" ? "/admin" : "/dashboard";
}

export default function NotFound() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const homePath = getHomePath(user);

    function goBack() {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate(homePath, { replace: true });
    }

    return (
        <main className="not-found-shell">
            <div className="not-found-frame">
                <header className="not-found-header">
                    <StreamingBoxLogo size={34} showText={true} />
                    <span className="not-found-status">Conexión estable · Ruta no encontrada</span>
                </header>

                <section className="not-found-content" aria-labelledby="not-found-title">
                    <div className="not-found-visual" aria-hidden="true">
                        <div className="not-found-signal signal-one" />
                        <div className="not-found-signal signal-two" />
                        <div className="not-found-code">
                            <span>4</span>
                            <div className="not-found-screen">
                                <div className="not-found-screen-top">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                                <MonitorPlay size={58} strokeWidth={1.35} />
                                <div className="not-found-screen-base" />
                            </div>
                            <span>4</span>
                        </div>
                        <div className="not-found-floor" />
                        <Sparkles className="not-found-spark spark-one" size={18} />
                        <Sparkles className="not-found-spark spark-two" size={13} />
                    </div>

                    <div className="not-found-copy">
                        <p className="not-found-eyebrow">
                            <SearchX size={16} strokeWidth={2.5} aria-hidden="true" />
                            Error 404
                        </p>
                        <h1 id="not-found-title">Esta señal no llegó a destino.</h1>
                        <p className="not-found-description">
                            La página que buscas no está disponible o cambió de lugar dentro de la plataforma.
                        </p>
                        <div className="not-found-actions">
                            <button className="not-found-primary" type="button" onClick={() => navigate(homePath, { replace: true })}>
                                <Home size={18} strokeWidth={2.4} aria-hidden="true" />
                                {user?.id ? "Volver al inicio" : "Ir a iniciar sesión"}
                            </button>
                            <button className="not-found-secondary" type="button" onClick={goBack}>
                                <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
                                Regresar
                            </button>
                        </div>
                        <p className="not-found-path" title={location.pathname}>
                            Ruta solicitada: <strong>{location.pathname}</strong>
                        </p>
                    </div>
                </section>

                <footer className="not-found-footer">
                    <span>Streaming Box</span>
                    <span className="not-found-footer-dot" aria-hidden="true" />
                    <span>Todo vuelve a estar a un clic.</span>
                </footer>
            </div>
        </main>
    );
}
