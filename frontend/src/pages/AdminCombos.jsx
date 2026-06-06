import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiLogout, apiPatch, apiPost } from "../api/api.js";
import { displayCurrency } from "../utils/currency.js";

const emptyForm = {
    id: null,
    name: "",
    slug: "",
    description: "",
    badge: "Combo",
    is_active: true,
    sort_order: 0,
    prices: { COP: "", MXN: "", USD: "" },
    lite_price_cop: "",
    show_in_lite: false,
    items: [{ platform_id: "", duration_id: "", quantity: 1 }],
};

function toPriceMap(prices = []) {
    const map = { COP: "", MXN: "", USD: "" };
    for (const price of prices) {
        if (map[price.currency] !== undefined) map[price.currency] = String(Number(price.price || 0));
    }
    return map;
}

function toLiteConfig(prices = []) {
    const cop = prices.find((price) => String(price.currency).toUpperCase() === "COP");
    return {
        lite_price_cop: cop?.lite_price_cop != null ? String(Number(cop.lite_price_cop || 0)) : "",
        show_in_lite: Boolean(cop?.show_in_lite),
    };
}

function SearchSelect({ label, value, options, placeholder, searchPlaceholder, onChange, getOptionLabel, getOptionMeta }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const selected = options.find((option) => String(option.value) === String(value));
    const filtered = options.filter((option) =>
        getOptionLabel(option).toLowerCase().includes(query.trim().toLowerCase())
    );

    return (
        <label style={{ position: "relative", minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{label}</span>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                style={{
                    width: "100%",
                    height: 42,
                    borderRadius: 10,
                    border: "1px solid rgba(59,130,246,.65)",
                    background: "rgba(8,18,43,.92)",
                    color: "var(--text)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "0 14px",
                    fontFamily: "var(--font)",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selected ? getOptionLabel(selected) : placeholder}
                </span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{open ? "▲" : "▼"}</span>
            </button>

            {open ? (
                <div
                    style={{
                        position: "absolute",
                        zIndex: 30,
                        top: "calc(100% + 5px)",
                        left: 0,
                        right: 0,
                        borderRadius: 12,
                        border: "1px solid rgba(59,130,246,.45)",
                        background: "#101a3a",
                        boxShadow: "0 18px 42px rgba(0,0,0,.38)",
                        overflow: "hidden",
                    }}
                >
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={searchPlaceholder}
                        autoFocus
                        style={{
                            width: "100%",
                            height: 40,
                            border: "none",
                            borderBottom: "1px solid rgba(255,255,255,.08)",
                            outline: "none",
                            background: "#0b1430",
                            color: "var(--text)",
                            padding: "0 14px",
                            fontFamily: "var(--font)",
                            boxSizing: "border-box",
                        }}
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setOpen(false);
                                setQuery("");
                            }}
                            style={{
                                width: "100%",
                                border: "none",
                                background: value ? "transparent" : "rgba(59,130,246,.18)",
                                color: "#60a5fa",
                                textAlign: "left",
                                padding: "10px 14px",
                                fontFamily: "var(--font)",
                                cursor: "pointer",
                            }}
                        >
                            {placeholder}
                        </button>
                        {filtered.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                onClick={() => {
                                    onChange(String(option.value));
                                    setOpen(false);
                                    setQuery("");
                                }}
                                style={{
                                    width: "100%",
                                    border: "none",
                                    background: String(option.value) === String(value) ? "rgba(59,130,246,.22)" : "transparent",
                                    color: "var(--text)",
                                    textAlign: "left",
                                    padding: "10px 14px",
                                    fontFamily: "var(--font)",
                                    fontSize: 13,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                }}
                            >
                                {getOptionMeta ? <span style={{ color: "#93c5fd" }}>{getOptionMeta(option)} - </span> : null}
                                {getOptionLabel(option)}
                            </button>
                        ))}
                        {!filtered.length ? (
                            <div style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 13 }}>
                                Sin resultados.
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </label>
    );
}

export default function AdminCombos() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [combos, setCombos] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [durations, setDurations] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const durationById = useMemo(() => new Map(durations.map((d) => [Number(d.id), d])), [durations]);
    const activePlatforms = useMemo(
        () => platforms.filter((platform) => Number(platform.is_active) === 1),
        [platforms]
    );

    function platformOptionsFor(selectedPlatformId) {
        const selectedId = Number(selectedPlatformId || 0);
        const selectedInactive = platforms.find((platform) => Number(platform.id) === selectedId && Number(platform.is_active) !== 1);
        return selectedInactive ? [...activePlatforms, selectedInactive] : activePlatforms;
    }

    function platformSelectOptions(selectedPlatformId) {
        return platformOptionsFor(selectedPlatformId).map((platform) => ({
            value: platform.id,
            label: `${platform.name}${Number(platform.is_active) === 1 ? "" : " (inactiva)"}`,
            id: platform.id,
        }));
    }

    const durationSelectOptions = useMemo(
        () => durations.map((duration) => ({
            value: duration.id,
            label: `${duration.name} (${duration.days} dias)`,
            id: duration.id,
        })),
        [durations]
    );

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [comboRes, platformRes, durationRes] = await Promise.all([
                apiGet("/admin/combos"),
                apiGet("/admin/platforms"),
                apiGet("/admin/durations"),
            ]);

            if (!comboRes.ok) throw new Error(comboRes.data?.message || "No se pudieron cargar los combos.");
            if (!platformRes.ok) throw new Error(platformRes.data?.message || "No se pudieron cargar plataformas.");
            if (!durationRes.ok) throw new Error(durationRes.data?.message || "No se pudieron cargar duraciones.");

            setCombos(Array.isArray(comboRes.data) ? comboRes.data : []);
            setPlatforms(Array.isArray(platformRes.data) ? platformRes.data : []);
            setDurations(Array.isArray(durationRes.data) ? durationRes.data : []);
        } catch (e) {
            setError(e?.message || "No se pudo cargar la pantalla.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    function setField(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function setPrice(currency, value) {
        setForm((prev) => ({ ...prev, prices: { ...prev.prices, [currency]: value } }));
    }

    function setItem(index, field, value) {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
        }));
    }

    function addItem() {
        setForm((prev) => ({
            ...prev,
            items: [...prev.items, { platform_id: "", duration_id: "", quantity: 1 }],
        }));
    }

    function removeItem(index) {
        setForm((prev) => ({
            ...prev,
            items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== index) : prev.items,
        }));
    }

    function editCombo(combo) {
        setForm({
            id: combo.id,
            name: combo.name || "",
            slug: combo.slug || "",
            description: combo.description || "",
            badge: combo.badge || "Combo",
            is_active: Number(combo.is_active) === 1,
            sort_order: Number(combo.sort_order || 0),
            prices: toPriceMap(combo.prices),
            ...toLiteConfig(combo.prices),
            items: combo.items?.length
                ? combo.items.map((item) => ({
                    platform_id: String(item.platform_id),
                    duration_id: String(item.duration_id),
                    quantity: Number(item.quantity || 1),
                }))
                : [{ platform_id: "", duration_id: "", quantity: 1 }],
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function saveCombo(event) {
        event.preventDefault();
        setSaving(true);
        setError("");

        const payload = {
            name: form.name,
            slug: form.slug,
            description: form.description,
            badge: form.badge,
            is_active: form.is_active,
            sort_order: Number(form.sort_order || 0),
            lite_price_cop: form.lite_price_cop !== "" ? Number(form.lite_price_cop) : undefined,
            show_in_lite: form.show_in_lite,
            prices: Object.fromEntries(
                Object.entries(form.prices).filter(([, value]) => value !== "" && Number(value) >= 0)
            ),
            items: form.items
                .filter((item) => item.platform_id && item.duration_id)
                .map((item) => ({
                    platform_id: Number(item.platform_id),
                    duration_id: Number(item.duration_id),
                    quantity: Math.max(1, Number(item.quantity || 1)),
                })),
        };

        try {
            const res = form.id
                ? await apiPatch(`/admin/combos/${form.id}`, payload)
                : await apiPost("/admin/combos", payload);
            if (!res.ok) throw new Error(res.data?.message || "No se pudo guardar el combo.");
            setForm(emptyForm);
            await loadAll();
        } catch (e) {
            setError(e?.message || "No se pudo guardar el combo.");
        } finally {
            setSaving(false);
        }
    }

    async function setComboActive(combo, active) {
        const action = active ? "activar" : "desactivar";
        if (!window.confirm(`Quieres ${action} ${combo.name}?`)) return;
        setSaving(true);
        try {
            const res = await apiPatch(`/admin/combos/${combo.id}`, { is_active: active });
            if (!res.ok) throw new Error(res.data?.message || `No se pudo ${action}.`);
            await loadAll();
        } catch (e) {
            setError(e?.message || `No se pudo ${action}.`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 22 }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>Combos</h1>
                            <p style={{ margin: "5px 0 0", color: "var(--muted)" }}>
                                Define paquetes con precio propio usando cuentas individuales del inventario.
                            </p>
                        </div>
                    </div>

                    {error ? <div className="error" style={{ marginBottom: 14 }}>{error}</div> : null}

                    <form onSubmit={saveCombo} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                            <label>
                                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Nombre</span>
                                <input className="input" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                            </label>
                            <label>
                                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Slug</span>
                                <input className="input" value={form.slug} onChange={(e) => setField("slug", e.target.value)} placeholder="auto si lo dejas vacio" />
                            </label>
                            <label>
                                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Etiqueta</span>
                                <input className="input" value={form.badge} onChange={(e) => setField("badge", e.target.value)} />
                            </label>
                            <label>
                                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Orden</span>
                                <input className="input" type="number" value={form.sort_order} onChange={(e) => setField("sort_order", e.target.value)} />
                            </label>
                        </div>

                        <label style={{ display: "block", marginTop: 12 }}>
                            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Descripcion</span>
                            <input className="input" value={form.description} onChange={(e) => setField("description", e.target.value)} />
                        </label>

                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 850, marginBottom: 9 }}>Precios del combo</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                                {["COP", "MXN", "USD"].map((currency) => (
                                    <label key={currency}>
                                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{displayCurrency(currency)}</span>
                                        <input className="input" type="number" min="0" step="0.01" value={form.prices[currency]} onChange={(e) => setPrice(currency, e.target.value)} />
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) auto", gap: 12, alignItems: "end", marginTop: 12 }}>
                                <label>
                                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Lite COP</span>
                                    <input className="input" type="number" min="0" step="1" value={form.lite_price_cop} onChange={(e) => setField("lite_price_cop", e.target.value)} />
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13, paddingBottom: 10 }}>
                                    <input type="checkbox" checked={form.show_in_lite} onChange={(e) => setField("show_in_lite", e.target.checked)} />
                                    Mostrar en Lite
                                </label>
                            </div>
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 9 }}>
                                <div style={{ fontSize: 13, fontWeight: 850 }}>Plataformas incluidas</div>
                                <button type="button" className="btn-ghost" onClick={addItem} style={{ width: "auto", padding: "7px 12px" }}>Agregar plataforma</button>
                            </div>
                            <div style={{ display: "grid", gap: 10 }}>
                                {form.items.map((item, index) => (
                                    <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(140px, 1fr) 90px auto", gap: 10, alignItems: "end" }}>
                                        <SearchSelect
                                            label="Plataforma"
                                            value={item.platform_id}
                                            options={platformSelectOptions(item.platform_id)}
                                            placeholder="-- Selecciona --"
                                            searchPlaceholder="Buscar plataforma..."
                                            onChange={(value) => setItem(index, "platform_id", value)}
                                            getOptionLabel={(option) => option.label}
                                            getOptionMeta={(option) => `#${option.id}`}
                                        />
                                        <SearchSelect
                                            label="Duracion"
                                            value={item.duration_id}
                                            options={durationSelectOptions}
                                            placeholder="-- Selecciona --"
                                            searchPlaceholder="Buscar duracion..."
                                            onChange={(value) => setItem(index, "duration_id", value)}
                                            getOptionLabel={(option) => option.label}
                                        />
                                        <label>
                                            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Cantidad</span>
                                            <input className="input" type="number" min="1" value={item.quantity} onChange={(e) => setItem(index, "quantity", e.target.value)} />
                                        </label>
                                        <button type="button" className="btn-ghost" onClick={() => removeItem(index)} style={{ width: "auto", padding: "9px 12px" }}>Quitar</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 16 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                                <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
                                Activo
                            </label>
                            <div style={{ display: "flex", gap: 10 }}>
                                {form.id ? <button type="button" className="btn-ghost" onClick={() => setForm(emptyForm)}>Nuevo</button> : null}
                                <button className="btn" disabled={saving}>{saving ? "Guardando..." : form.id ? "Actualizar combo" : "Crear combo"}</button>
                            </div>
                        </div>
                    </form>

                    <section style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
                        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--stroke)", fontWeight: 900 }}>
                            Combos creados
                        </div>
                        {loading ? (
                            <div style={{ padding: 24, color: "var(--muted)" }}>Cargando...</div>
                        ) : !combos.length ? (
                            <div style={{ padding: 24, color: "var(--muted)" }}>No hay combos creados.</div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ textAlign: "left", background: "rgba(0,0,0,.18)" }}>
                                            {["Combo", "Precios", "Incluye", "Estado", "Acciones"].map((head) => (
                                                <th key={head} style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>{head}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {combos.map((combo) => (
                                            <tr key={combo.id} style={{ borderTop: "1px solid var(--stroke)" }}>
                                                <td style={{ padding: "13px 14px" }}>
                                                    <div style={{ fontWeight: 850 }}>{combo.name}</div>
                                                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{combo.slug}</div>
                                                </td>
                                                <td style={{ padding: "13px 14px" }}>
                                                    {(combo.prices || []).filter((p) => p.is_active).map((price) => (
                                                        <div key={price.currency}>{Number(price.price).toLocaleString("es-CO")} {displayCurrency(price.currency)}</div>
                                                    ))}
                                                    {(combo.prices || []).some((p) => p.show_in_lite) ? (
                                                        <div style={{ color: "#10b981", fontWeight: 850, marginTop: 4 }}>
                                                            Lite: {Number((combo.prices || []).find((p) => p.show_in_lite)?.lite_price_cop || 0).toLocaleString("es-CO")} COP
                                                        </div>
                                                    ) : null}
                                                </td>
                                                <td style={{ padding: "13px 14px", color: "var(--muted)" }}>
                                                    {(combo.items || []).map((item) => (
                                                        <div key={item.id}>{item.quantity}x {item.platform_name} - {durationById.get(Number(item.duration_id))?.name || item.duration_name}</div>
                                                    ))}
                                                </td>
                                                <td style={{ padding: "13px 14px" }}>
                                                    <span style={{ color: Number(combo.is_active) === 1 ? "#22c55e" : "#ef4444", fontWeight: 850 }}>
                                                        {Number(combo.is_active) === 1 ? "Activo" : "Inactivo"}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "13px 14px" }}>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button className="btn-ghost" onClick={() => editCombo(combo)} style={{ width: "auto", padding: "7px 12px" }}>Editar</button>
                                                        <button
                                                            className="btn-ghost"
                                                            onClick={() => setComboActive(combo, Number(combo.is_active) !== 1)}
                                                            disabled={saving}
                                                            style={{ width: "auto", padding: "7px 12px" }}
                                                        >
                                                            {Number(combo.is_active) === 1 ? "Desactivar" : "Activar"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
