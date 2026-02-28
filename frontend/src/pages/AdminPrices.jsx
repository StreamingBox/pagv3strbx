import { useNavigate } from "react-router-dom";
import { useAdminPrices } from "../hooks/useAdminPrices";
import PricesForm from "../components/prices/PricesForm";
import PricesTable from "../components/prices/PricesTable";

export default function AdminPrices() {
    // FRONTEND
    const navigate = useNavigate();

    const {
        platforms,
        durations,
        prices,
        loading,
        saving,
        error,
        page,
        limit,
        total,
        totalPages,
        loadAll,
        saveMulti,
        toggleAll,
    } = useAdminPrices(); // ✅ SIN TOKEN (cookies HttpOnly)

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Planes / Precios</p>

                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span>
                        <span style={{ opacity: 0.7 }}>→</span>
                    </div>

                    <button
                        className="btn-ghost"
                        style={{ width: "100%", marginTop: 10 }}
                        onClick={() => loadAll(1, limit)}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Planes / Precios</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        CRUD de <b>platform_prices</b> (multi-moneda: COP/MXN/USD).
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    {/* Formulario “crear/actualizar” por plataforma+duración */}
                    <PricesForm
                        platforms={platforms}
                        durations={durations}
                        saving={saving}
                        onSaveMulti={saveMulti}
                    />

                    {/* Tabla agrupada: 1 fila por plataforma+duración, columnas COP/MXN/USD */}
                    <PricesTable
                        prices={prices}
                        loading={loading}
                        saving={saving}
                        page={page}
                        limit={limit}
                        total={total}
                        totalPages={totalPages}
                        onToggleAll={toggleAll}
                        onSaveMulti={saveMulti}
                        loadAll={loadAll}
                    />
                </main>
            </div>
        </div>
    );
}
