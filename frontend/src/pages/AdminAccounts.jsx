import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch as baseApiFetch } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";
import useAppLogout from "../hooks/useAppLogout.js";
import { loadXlsx } from "../utils/loadXlsx.js";
const MotionDiv = motion.div;

async function apiFetch(path, opts = {}) {
    const res = await baseApiFetch(path, opts);
    if (!res.ok) {
        const err = new Error(res.data?.message || `HTTP ${res.status}` || "Error en la solicitud");
        err.data = res.data;
        err.status = res.status;
        throw err;
    }
    return res.data;
}

const LOGO_URL = "/api/branding/logo";

function normalizeExcelKey(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function readExcelValue(row, aliases) {
    const key = Object.keys(row || {}).find((candidate) =>
        aliases.includes(normalizeExcelKey(candidate))
    );
    return key ? row[key] : "";
}

function positiveNumber(value) {
    const raw = String(value ?? "").trim();
    let normalized = raw;
    if (raw.includes(",")) {
        normalized = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
        normalized = raw.replace(/\./g, "");
    }
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function summarizeExcelRows(rows) {
    const summary = {
        total: rows.length,
        valid: 0,
        invalid: 0,
        screenCost: 0,
        accountCost: 0,
        withoutCost: 0,
        invalidCost: 0,
    };

    for (const row of rows) {
        const platform = readExcelValue(row, ["platformid", "plataformaid", "platform", "platformname", "plataforma"]);
        const email = readExcelValue(row, ["email", "correo"]);
        const password = readExcelValue(row, ["password", "contrasena", "clave"]);
        const valid = !!String(platform).trim() && !!String(email).trim() && !!String(password).trim();
        if (!valid) {
            summary.invalid += 1;
            continue;
        }
        summary.valid += 1;

        const mode = String(readExcelValue(row, ["costmode", "tipocosto", "tipodecosto"])).trim().toLowerCase();
        const amount = positiveNumber(readExcelValue(row, ["costamount", "valorcosto", "costo", "valor"]));
        const direct = positiveNumber(readExcelValue(row, ["unitcost", "costopantalla", "costoperfil"]));
        const accountTotal = positiveNumber(readExcelValue(row, ["mothercosttotal", "parentaccountcosttotal", "costocuentamadre", "costocuentacompleta"]));
        const profiles = positiveNumber(readExcelValue(row, ["motherprofilestotal", "parentprofilestotal", "cantidadperfiles", "totalpantallas"]));

        if (direct || (["pantalla", "perfil", "screen", "unitario"].includes(mode) && amount)) {
            summary.screenCost += 1;
        } else if (
            (accountTotal && profiles) ||
            (["cuenta", "account", "completa"].includes(mode) && amount && profiles)
        ) {
            summary.accountCost += 1;
        } else if (amount || accountTotal || profiles || mode) {
            summary.invalidCost += 1;
        } else {
            summary.withoutCost += 1;
        }
    }

    return summary;
}

function formatDuplicateAssignedWarnings(items = [], limit = 8) {
    const list = items.slice(0, limit).map((item) => {
        const profile = item.profileNumber === null || item.profileNumber === undefined || String(item.profileNumber).trim() === ""
            ? "sin perfil"
            : `perfil ${item.profileNumber}`;
        const order = item.orderCode || (item.orderId ? `orden #${item.orderId}` : item.subscriptionId ? `venta #${item.subscriptionId}` : "sin orden activa");
        const assignedTo = item.assignedTo ? `, asignada a ${item.assignedTo}` : "";
        const expires = item.expiresAt ? `, expira ${String(item.expiresAt).slice(0, 10)}` : ", sin fecha de expiracion";
        return `Fila ${item.rowNumber || "-"}: ${item.platformName || "Plataforma"} ${item.email || ""} (${profile}) no se cargo; ya existe cuenta #${item.accountId}${assignedTo}, ${order}${expires}.`;
    });
    if (items.length > limit) {
        list.push(`... y ${items.length - limit} duplicada(s) mas.`);
    }
    return list.join("\n");
}

function rowsFromDuplicateAssignedWarnings(rows = [], duplicateAssigned = []) {
    const selected = [];
    const seen = new Set();
    for (const item of duplicateAssigned) {
        const rowIndex = Number(item.rowNumber) - 2;
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length || seen.has(rowIndex)) {
            continue;
        }
        seen.add(rowIndex);
        selected.push(rows[rowIndex]);
    }
    return selected;
}

function CustomPlatformSelect({ value, onChange, platforms, selStyle }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = platforms.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    const currentName = value === "" ? "-- Selecciona --" : (platforms.find(p => String(p.id) === String(value))?.name || "-- Selecciona --");

    return (
        <div ref={dropdownRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div
                style={{ ...selStyle, display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%", userSelect: "none", cursor: "pointer" }}
                onClick={() => { setOpen(!open); setSearch(""); }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentName}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden",
                    display: "flex", flexDirection: "column"
                }}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar plataforma..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            background: "rgba(0,0,0,0.2)", border: "none", borderBottom: "1px solid var(--stroke)",
                            padding: "12px 14px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", fontFamily: "var(--font)"
                        }}
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
                        <div
                            style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === "" ? "rgba(13,166,242,0.1)" : "transparent", color: value === "" ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                            onClick={() => { onChange(""); setOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = value === "" ? "rgba(13,166,242,0.1)" : "transparent"}
                        >
                            -- Selecciona --
                        </div>
                        {filtered.map(p => (
                            <div
                                key={p.id}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: String(value) === String(p.id) ? "rgba(13,166,242,0.1)" : "transparent", color: String(value) === String(p.id) ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                                onClick={() => { onChange(p.id); setOpen(false); }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.background = String(value) === String(p.id) ? "rgba(13,166,242,0.1)" : "transparent"}
                            >
                                #{p.id} - {p.name}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No hay coincidencias</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminAccounts() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [platforms, setPlatforms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const [platformId, setPlatformId] = useState("");
    const [platformName, setPlatformName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pin, setPin] = useState("");
    const [profileNumber, setProfileNumber] = useState("");
    const [costMode, setCostMode] = useState("screen");
    const [motherCostTotal, setMotherCostTotal] = useState("");
    const [motherProfilesTotal, setMotherProfilesTotal] = useState("");

    // Excel upload
    const fileExcelRef = useRef(null);
    const forceConfirmResolveRef = useRef(null);
    const [excelLoading, setExcelLoading] = useState(false);
    const [excelMsg, setExcelMsg] = useState("");
    const [excelError, setExcelError] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [excelPreview, setExcelPreview] = useState(null);
    const [forceConfirm, setForceConfirm] = useState(null);

    const selectedPlatform = useMemo(
        () => platforms.find((p) => String(p.id) === String(platformId)),
        [platforms, platformId]
    );
    const manualCostAmount = positiveNumber(motherCostTotal);
    const manualProfiles = Math.floor(positiveNumber(motherProfilesTotal));
    const manualUnitCost = costMode === "account"
        ? (manualCostAmount > 0 && manualProfiles > 0 ? manualCostAmount / manualProfiles : 0)
        : manualCostAmount;
    const manualCostIncomplete = costMode === "account" && manualCostAmount > 0 && manualProfiles <= 0;

    async function loadPlatforms() {
        setLoading(true);
        setError("");

        try {
            const data = await apiFetch(`/admin/platforms`);
            if (!data) return;
            setPlatforms(
                Array.isArray(data)
                    ? data.filter((platform) => Number(platform?.is_active) === 1)
                    : []
            );
        } catch (e) {
            setError(e?.message || "Error cargando plataformas.");
        } finally {
            setLoading(false);
        }
    }

    async function createAccount() {
        if (manualCostIncomplete) {
            setError("Indica cuantas pantallas vendibles tiene la cuenta completa.");
            return;
        }

        setSaving(true);
        setError("");
        setExcelMsg("");

        try {
            const data = await apiFetch(`/admin/accounts`, {
                method: "POST",
                body: JSON.stringify({
                    platformId: Number(platformId),
                    platformName: platformName || selectedPlatform?.name || "",
                    email,
                    password,
                    pin: pin || null,
                    profileNumber: profileNumber || null,
                    costMode,
                    costAmount: motherCostTotal || null,
                    motherProfilesTotal: costMode === "account" ? (motherProfilesTotal || null) : null,
                }),
            });

            if (data?.id) {
                setEmail("");
                setPassword("");
                setPin("");
                setProfileNumber("");
                setMotherCostTotal("");
                setMotherProfilesTotal("");
                setExcelError(false);
                setExcelMsg(`✅ Cuenta cargada correctamente (ID: ${data.id})`);
                setTimeout(() => setExcelMsg(""), 5000);
            }
        } catch (e) {
            setError(e.message || "Error cargando cuenta.");
        } finally {
            setSaving(false);
        }
    }

    function openExcelPicker() {
        setExcelMsg("");
        setExcelError(false);
        setExcelPreview(null);
        fileExcelRef.current?.click();
    }

    async function processExcelFile(file) {
        if (!file) return;

        setExcelLoading(true);
        setError("");
        setExcelMsg("");
        setExcelError(false);

        try {
            // 1) leer excel
            const buffer = await file.arrayBuffer();
            const XLSX = await loadXlsx();
            const wb = await XLSX.read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

            const summary = summarizeExcelRows(rows);
            if (!summary.valid) throw new Error("El archivo no tiene cuentas validas.");

            setExcelPreview({
                fileName: file.name,
                rows,
                summary,
            });
        } catch (err) {
            setExcelError(true);
            setExcelMsg(`❌ ${err.message || "Error subiendo Excel."}`);
        } finally {
            setExcelLoading(false);
            if (fileExcelRef.current) fileExcelRef.current.value = "";
        }
    }

    function requestForceDuplicateConfirm({ count, details }) {
        return new Promise((resolve) => {
            forceConfirmResolveRef.current = resolve;
            setForceConfirm({ count, details });
        });
    }

    function resolveForceDuplicateConfirm(confirmed) {
        const resolve = forceConfirmResolveRef.current;
        forceConfirmResolveRef.current = null;
        setForceConfirm(null);
        if (resolve) resolve(confirmed);
    }

    async function confirmForceDuplicateAssignedUpload(originalRows, duplicateAssigned) {
        const duplicateRows = rowsFromDuplicateAssignedWarnings(originalRows, duplicateAssigned);
        if (!duplicateRows.length) return null;

        const details = formatDuplicateAssignedWarnings(duplicateAssigned, 6);
        const confirmed = await requestForceDuplicateConfirm({
            count: duplicateRows.length,
            details,
        });
        if (!confirmed) return null;

        return apiFetch(`/admin/accounts/bulk`, {
            method: "POST",
            body: JSON.stringify({
                rows: duplicateRows,
                allowAssignedDuplicateScreens: true,
            }),
        });
    }

    async function confirmExcelUpload() {
        if (!excelPreview?.rows?.length) return;

        setExcelLoading(true);
        setExcelMsg("");
        setExcelError(false);
        try {
            const out = await apiFetch(`/admin/accounts/bulk`, {
                method: "POST",
                body: JSON.stringify({ rows: excelPreview.rows }),
            });

            const duplicateAssigned = Array.isArray(out.duplicateAssigned) ? out.duplicateAssigned : [];
            const duplicateCount = Number(out.skipped_duplicate_assigned || duplicateAssigned.length || 0);
            const warnings = [];
            let forcedOut = null;
            if (duplicateCount > 0) {
                forcedOut = await confirmForceDuplicateAssignedUpload(excelPreview.rows, duplicateAssigned);
                if (!forcedOut) {
                    warnings.push(
                        `No se cargaron ${duplicateCount} pantalla(s) porque ya estaban asignadas y vigentes:\n${formatDuplicateAssignedWarnings(duplicateAssigned)}`
                    );
                }
            }
            if (Array.isArray(out.warning_missing_platforms) && out.warning_missing_platforms.length) {
                warnings.push(`Plataformas no encontradas: ${out.warning_missing_platforms.join(", ")}`);
            }
            const forcedInserted = Number(forcedOut?.inserted || 0);
            const baseInserted = Number(out.inserted || 0);
            const successLines = forcedOut
                ? [
                    `Excel cargado. Insertadas: ${baseInserted + forcedInserted}.`,
                    `Normales: ${baseInserted}. Forzadas por confirmacion: ${forcedInserted}.`,
                ]
                : [`Excel cargado. Insertadas: ${baseInserted}.`];
            setExcelMsg([...successLines, ...warnings].join("\n\n"));
            setExcelPreview(null);
        } catch (err) {
            const duplicateAssigned = Array.isArray(err.data?.duplicateAssigned) ? err.data.duplicateAssigned : [];
            if (duplicateAssigned.length) {
                let forcedOut = null;
                try {
                    forcedOut = await confirmForceDuplicateAssignedUpload(excelPreview.rows, duplicateAssigned);
                } catch (forceErr) {
                    setExcelError(true);
                    setExcelMsg(forceErr.message || "No se pudo hacer la carga forzada.");
                    return;
                }
                if (forcedOut) {
                    setExcelError(false);
                    setExcelMsg(`Carga confirmada. Insertadas forzadas: ${forcedOut.inserted || 0}.`);
                    setExcelPreview(null);
                    return;
                }
                setExcelError(false);
                setExcelMsg(`${err.message || "No se cargaron esas pantallas."}\n\n${formatDuplicateAssignedWarnings(duplicateAssigned)}`);
                return;
            }
            setExcelError(true);
            setExcelMsg(err.message || "Error subiendo Excel.");
        } finally {
            setExcelLoading(false);
        }
    }

    function onPickExcel(e) {
        processExcelFile(e.target.files?.[0]);
    }

    function handleDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processExcelFile(e.dataTransfer.files[0]);
        }
    }

    async function downloadTemplate() {
        const headers = [
            "plataformaId",
            "plataforma",
            "correo",
            "contrasena",
            "perfil",
            "pin",
            "tipoCosto",
            "valorCosto",
            "totalPantallas",
            "costoUnitarioCalculado",
        ];
        const exampleRows = [
            {
                plataformaId: 1,
                plataforma: "Netflix",
                correo: "cuenta.netflix@correo.com",
                contrasena: "Clave123",
                perfil: "1",
                pin: "1234",
                tipoCosto: "CUENTA",
                valorCosto: 54000,
                totalPantallas: 5,
                costoUnitarioCalculado: 10800,
            },
            {
                plataformaId: 1,
                plataforma: "Netflix",
                correo: "cuenta.netflix@correo.com",
                contrasena: "Clave123",
                perfil: "2",
                pin: "2345",
                tipoCosto: "CUENTA",
                valorCosto: 54000,
                totalPantallas: 5,
                costoUnitarioCalculado: 10800,
            },
            {
                plataformaId: 2,
                plataforma: "Prime Video",
                correo: "prime@correo.com",
                contrasena: "Prime123",
                perfil: "1",
                pin: "",
                tipoCosto: "PANTALLA",
                valorCosto: 9000,
                totalPantallas: "",
                costoUnitarioCalculado: 9000,
            },
        ];
        const XLSX = await loadXlsx();

        const wsCuentas = XLSX.utils.json_to_sheet([], { header: headers });
        wsCuentas["!cols"] = [
            { wch: 13 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 10 },
            { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 24 },
        ];
        const wsExamples = XLSX.utils.json_to_sheet(exampleRows, { header: headers });
        wsExamples["!cols"] = wsCuentas["!cols"];

        const instructions = [
            ["COMO REGISTRAR EL COSTO REAL"],
            [""],
            ["Si compras una pantalla/perfil:", "tipoCosto = PANTALLA", "valorCosto = lo que pagaste por esa pantalla", "totalPantallas se deja vacio"],
            ["Si compras una cuenta completa:", "tipoCosto = CUENTA", "valorCosto = precio total de la cuenta", "totalPantallas = cantidad de pantallas vendibles"],
            ["Ejemplo cuenta completa:", "54.000 / 5 pantallas = 10.800 de costo por cada venta"],
            [""],
            ["Cada fila representa una pantalla o acceso que puedes vender."],
            ["Cuando una cuenta completa tiene varios perfiles, repite el costo total y total de pantallas en cada fila."],
            ["La columna costoUnitarioCalculado es informativa; el sistema calcula nuevamente el valor al cargar."],
            ["Las cuentas sin costo se pueden cargar, pero no aportaran una utilidad neta exacta."],
            [""],
            ["UTILIDAD NETA"],
            ["El sistema calcula: precio de venta - costo unitario = utilidad neta."],
            ["Consulta el resultado en Admin > Analiticas, usando la moneda COP."],
        ];
        const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
        wsInstructions["!cols"] = [{ wch: 38 }, { wch: 28 }, { wch: 48 }, { wch: 32 }];

        const plataformasRows = platforms.map(p => ({
            "ID": p.id,
            "Plataforma": p.name
        }));
        const wsPlataformas = XLSX.utils.json_to_sheet(plataformasRows);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsCuentas, "Cuentas");
        XLSX.utils.book_append_sheet(wb, wsExamples, "EJEMPLOS");
        XLSX.utils.book_append_sheet(wb, wsInstructions, "COMO USAR");
        XLSX.utils.book_append_sheet(wb, wsPlataformas, "Plataformas");

        XLSX.writeFile(wb, "Plantilla_Cuentas_y_Costos_StreamingBox.xlsx");
    }

    useEffect(() => {
        void loadPlatforms();
    }, []);

    useEffect(() => {
        setPlatformName(selectedPlatform?.name || "");
    }, [selectedPlatform]);

    const inputStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 44, padding: "0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 12,
        fontSize: 14, fontWeight: 500, outline: "none", width: "100%", fontFamily: "var(--font)",
        transition: "all 0.2s"
    };
    const excelTone = excelError
        ? "error"
        : /No se cargaron|Plataformas no encontradas/i.test(excelMsg)
            ? "warning"
            : "success";
    const excelToneStyles = {
        error: {
            background: "rgba(239,68,68,0.1)",
            border: "rgba(239,68,68,0.3)",
            color: "#ef4444",
            shadow: "rgba(239,68,68,0.1)",
        },
        warning: {
            background: "rgba(245,158,11,0.12)",
            border: "rgba(245,158,11,0.35)",
            color: "#f59e0b",
            shadow: "rgba(245,158,11,0.12)",
        },
        success: {
            background: "rgba(16,185,129,0.1)",
            border: "rgba(16,185,129,0.3)",
            color: "#10b981",
            shadow: "rgba(16,185,129,0.1)",
        },
    }[excelTone];

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
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px", maxWidth: 1000, margin: "0 auto" }}>
                    {/* ── Page header ── */}
                    <MotionDiv
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32, gap: 20, flexWrap: "wrap", borderBottom: "1px solid var(--stroke)", paddingBottom: 24 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                                background: "linear-gradient(135deg, rgba(13,166,242,0.1) 0%, rgba(99,51,255,0.1) 100%)",
                                border: "1px solid rgba(13,166,242,0.3)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.15)",
                            }}>
                                📤
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.5px" }}>
                                    Cargar Cuentas
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Sube inventario masivamente usando Excel o agrega nuevas cuentas manualmente.
                                </p>
                            </div>
                        </div>

                        <button
                            className="btn-ghost"
                            style={{ height: 38, borderRadius: 10, fontSize: 13, gap: 8, display: "flex", alignItems: "center" }}
                            onClick={loadPlatforms}
                            disabled={loading}
                        >
                            <span style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>🔄</span>
                            {loading ? "Cargando..." : "Refrescar Plataformas"}
                        </button>
                    </MotionDiv>

                    {error && (
                        <MotionDiv initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="error" style={{ marginBottom: 20 }}>
                            {error}
                        </MotionDiv>
                    )}

                    {excelMsg && (
                        <MotionDiv
                            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            style={{
                                padding: "14px 20px", borderRadius: 12, marginBottom: 24, fontSize: 13, fontWeight: 600,
                                background: excelToneStyles.background,
                                border: `1px solid ${excelToneStyles.border}`,
                                color: excelToneStyles.color,
                                boxShadow: `0 4px 12px ${excelToneStyles.shadow}`,
                                whiteSpace: "pre-line",
                            }}
                        >
                            {excelMsg}
                        </MotionDiv>
                    )}

                    {/* ── EXCEL UPLOADER CARD ── */}
                    <MotionDiv
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px 28px", marginBottom: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Carga Masiva (Excel)</h3>
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                                    Usa la plantilla guiada para registrar credenciales y costo real en COP.
                                </p>
                            </div>
                            <button
                                className="btn-ghost"
                                onClick={downloadTemplate}
                                style={{ fontSize: 13, borderRadius: 10, padding: "0 16px", height: 38 }}
                            >
                                📄 Descargar Plantilla
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
                            <div style={{ padding: "12px 14px", borderLeft: "3px solid #10b981", background: "rgba(16,185,129,0.07)" }}>
                                <div style={{ color: "#10b981", fontWeight: 800, fontSize: 13 }}>Compraste una pantalla</div>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Tipo: PANTALLA · Valor: lo que pagaste por ese acceso.</div>
                            </div>
                            <div style={{ padding: "12px 14px", borderLeft: "3px solid #0da6f2", background: "rgba(13,166,242,0.07)" }}>
                                <div style={{ color: "#0da6f2", fontWeight: 800, fontSize: 13 }}>Compraste la cuenta completa</div>
                                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Tipo: CUENTA · Valor total y cantidad de pantallas.</div>
                            </div>
                        </div>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={openExcelPicker}
                            style={{
                                border: dragActive ? "2px dashed #0da6f2" : "2px dashed var(--stroke2)",
                                borderRadius: 16, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                                background: dragActive ? "rgba(13,166,242,0.08)" : "var(--bg0)",
                                transition: "all 0.2s ease"
                            }}
                        >
                            <div style={{ fontSize: 32, marginBottom: 12, opacity: dragActive ? 1 : 0.6 }}>{excelLoading ? "⏳" : "📊"}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: dragActive ? "#0da6f2" : "var(--text)" }}>
                                {excelLoading ? "Cargando archivo..." : "Haz clic para subir un Excel (.xlsx)"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                                O arrastra y suelta el archivo aquí
                            </div>
                        </div>

                        <input
                            ref={fileExcelRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: "none" }}
                            onChange={onPickExcel}
                        />

                        {excelPreview && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--stroke2)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ color: "var(--text)", fontWeight: 800, fontSize: 14 }}>Revisión antes de cargar</div>
                                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>{excelPreview.fileName}</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <span style={{ color: "#10b981", fontSize: 12, fontWeight: 800 }}>{excelPreview.summary.valid} válidas</span>
                                        <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 800 }}>{excelPreview.summary.withoutCost} sin costo</span>
                                        {!!excelPreview.summary.invalid && <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 800 }}>{excelPreview.summary.invalid} inválidas</span>}
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
                                    <div style={{ background: "var(--bg0)", padding: "12px 14px", border: "1px solid var(--stroke2)", borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Costo por pantalla</div>
                                        <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900, color: "#10b981" }}>{excelPreview.summary.screenCost}</div>
                                    </div>
                                    <div style={{ background: "var(--bg0)", padding: "12px 14px", border: "1px solid var(--stroke2)", borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Costo cuenta completa</div>
                                        <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900, color: "#0da6f2" }}>{excelPreview.summary.accountCost}</div>
                                    </div>
                                    <div style={{ background: "var(--bg0)", padding: "12px 14px", border: "1px solid var(--stroke2)", borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Costo incompleto</div>
                                        <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900, color: excelPreview.summary.invalidCost ? "#ef4444" : "var(--text)" }}>{excelPreview.summary.invalidCost}</div>
                                    </div>
                                </div>

                                {(excelPreview.summary.withoutCost > 0 || excelPreview.summary.invalidCost > 0) && (
                                    <div style={{ marginTop: 12, color: "#f59e0b", fontSize: 12, lineHeight: 1.45 }}>
                                        Las filas sin costo se pueden cargar, pero la utilidad neta de esas ventas aparecerá incompleta.
                                    </div>
                                )}

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                                    <button className="btn-ghost" onClick={() => setExcelPreview(null)} disabled={excelLoading} style={{ height: 40, padding: "0 16px" }}>
                                        Cancelar
                                    </button>
                                    <button className="btn" onClick={confirmExcelUpload} disabled={excelLoading || !!excelPreview.summary.invalid || !!excelPreview.summary.invalidCost} style={{ height: 40, padding: "0 20px", fontWeight: 800 }}>
                                        {excelLoading ? "Cargando..." : "Confirmar carga"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </MotionDiv>

                    {/* ── MANUAL ENTRY CARD ── */}
                    <MotionDiv
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "clamp(16px, 4vw, 24px) clamp(20px, 5vw, 28px)", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}
                    >
                        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Carga Manual (1x1)</h3>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Plataforma *
                                </label>
                                <div style={{ position: "relative", height: 44 }}>
                                    <CustomPlatformSelect
                                        value={platformId}
                                        onChange={(val) => setPlatformId(val)}
                                        platforms={platforms}
                                        selStyle={inputStyle}
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Nombre plataforma <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: Netflix Premium Custom"
                                    value={platformName}
                                    onChange={(e) => setPlatformName(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Email de la cuenta *
                                </label>
                                <input
                                    style={inputStyle}
                                    type="email"
                                    placeholder="correo@ejemplo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Contraseña *
                                </label>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="Contraseña de la cuenta"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Perfil <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: 1, 2, Kids..."
                                    value={profileNumber}
                                    onChange={(e) => setProfileNumber(e.target.value)}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Pin <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    placeholder="Ej: 1234"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                />
                            </div>

                            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    ¿Cómo compraste este acceso?
                                </label>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                                    {[
                                        { value: "screen", label: "Compré una pantalla", detail: "Escribe lo que pagaste por este acceso." },
                                        { value: "account", label: "Compré la cuenta completa", detail: "El sistema divide el total entre las pantallas." },
                                    ].map((option) => {
                                        const active = costMode === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setCostMode(option.value)}
                                                style={{
                                                    minHeight: 68,
                                                    padding: "12px 14px",
                                                    borderRadius: 8,
                                                    border: active ? "1px solid #0da6f2" : "1px solid var(--stroke)",
                                                    background: active ? "rgba(13,166,242,0.12)" : "var(--bg0)",
                                                    color: active ? "#0da6f2" : "var(--text)",
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{option.label}</span>
                                                <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--muted)", lineHeight: 1.35 }}>{option.detail}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    {costMode === "account" ? "Costo total de la cuenta (COP)" : "Costo de esta pantalla (COP)"} <span style={{ opacity: 0.5, fontWeight: 400 }}>(Opcional)</span>
                                </label>
                                <input
                                    style={inputStyle}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder={costMode === "account" ? "Ej: 54000" : "Ej: 10800"}
                                    value={motherCostTotal}
                                    onChange={(e) => setMotherCostTotal(e.target.value)}
                                />
                            </div>

                            {costMode === "account" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        Pantallas vendibles
                                    </label>
                                    <input
                                        style={inputStyle}
                                        type="number"
                                        min="1"
                                        step="1"
                                        placeholder="Ej: 5"
                                        value={motherProfilesTotal}
                                        onChange={(e) => setMotherProfilesTotal(e.target.value)}
                                    />
                                </div>
                            )}

                            <div style={{ gridColumn: "1 / -1", padding: "14px 16px", border: `1px solid ${manualCostIncomplete ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.28)"}`, background: manualCostIncomplete ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.07)", borderRadius: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Costo que se descontará en cada venta</div>
                                        <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: manualCostIncomplete ? "#ef4444" : "#10b981" }}>
                                            {manualUnitCost > 0 ? `$${manualUnitCost.toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP` : "Sin costo registrado"}
                                        </div>
                                    </div>
                                    <div style={{ maxWidth: 380, fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
                                        {manualCostIncomplete
                                            ? "Falta indicar la cantidad de pantallas para calcular el costo unitario."
                                            : "Utilidad neta = precio de venta menos este costo. La verás en Admin > Analíticas."}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--stroke2)" }}>
                            <button
                                className="btn"
                                style={{ width: "100%", maxWidth: 320, fontSize: 14, fontWeight: 800, height: 48 }}
                                onClick={createAccount}
                                disabled={saving || !platformId || !email || !password || manualCostIncomplete}
                            >
                                {saving ? "Guardando..." : "✅ Agregar Cuenta"}
                            </button>
                        </div>
                    </MotionDiv>

                    {forceConfirm && (
                        <div
                            role="presentation"
                            onClick={() => resolveForceDuplicateConfirm(false)}
                            style={{
                                position: "fixed",
                                inset: 0,
                                zIndex: 80,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 18,
                                background: "rgba(2, 6, 23, 0.72)",
                                backdropFilter: "blur(8px)",
                            }}
                        >
                            <MotionDiv
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="force-duplicate-title"
                                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: "min(680px, 100%)",
                                    maxHeight: "min(80vh, 680px)",
                                    overflow: "hidden",
                                    display: "flex",
                                    flexDirection: "column",
                                    background: "linear-gradient(180deg, rgba(30,42,82,0.98), rgba(20,30,58,0.98))",
                                    border: "1px solid rgba(245,158,11,0.45)",
                                    borderRadius: 14,
                                    boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
                                }}
                            >
                                <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <div id="force-duplicate-title" style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>
                                        Confirmar carga forzada
                                    </div>
                                    <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                                        Hay {forceConfirm.count} pantalla(s) que ya estan asignadas y vigentes. Si continuas, se crearan registros nuevos de esas mismas pantallas.
                                    </div>
                                </div>

                                <div style={{ padding: "16px 22px", overflowY: "auto" }}>
                                    <div
                                        style={{
                                            padding: "14px 16px",
                                            border: "1px solid rgba(245,158,11,0.35)",
                                            background: "rgba(245,158,11,0.1)",
                                            borderRadius: 10,
                                            color: "#fbbf24",
                                            fontSize: 12,
                                            lineHeight: 1.55,
                                            whiteSpace: "pre-line",
                                        }}
                                    >
                                        {forceConfirm.details}
                                    </div>
                                </div>

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => resolveForceDuplicateConfirm(false)}
                                        style={{ minWidth: 130, height: 42 }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => resolveForceDuplicateConfirm(true)}
                                        style={{ minWidth: 210, height: 42, fontWeight: 900, background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                                    >
                                        Cargar de todas formas
                                    </button>
                                </div>
                            </MotionDiv>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
