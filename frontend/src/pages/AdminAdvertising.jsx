import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { apiDelete, apiFetch, apiGet, apiPost, apiPostFormData } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

const inputStyle = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

function formatSize(bytes) {
    if (!bytes) return "—";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminAdvertising() {
    const { user } = useAuth();
    const fileInputRef = useRef(null);

    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [images, setImages] = useState([]);
    const [imagePage, setImagePage] = useState(1);
    const [imageLimit, setImageLimit] = useState(10);
    const [imagePagination, setImagePagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Crear carpeta
    const [newFolderName, setNewFolderName] = useState("");
    const [creatingFolder, setCreatingFolder] = useState(false);

    // Renombrar carpeta
    const [renamingFolder, setRenamingFolder] = useState(null);
    const [renameValue, setRenameValue] = useState("");

    // Subir imágenes
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    // Confirmación de eliminación
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [isNarrow, setIsNarrow] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth <= 980 : false
    );

    const logout = useAppLogout();

    const loadFolders = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const r = await apiGet("/admin/advertising/folders");
            if (!r.ok) throw new Error(r.data?.message || "Error cargando carpetas.");
            setFolders(Array.isArray(r.data?.data) ? r.data.data : []);
        } catch (e) {
            setError(e?.message || "Error cargando carpetas.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadImages = useCallback(async (folderId, page = imagePage, limit = imageLimit) => {
        if (!folderId) return;
        setImagesLoading(true);
        setError("");
        try {
            const r = await apiGet(`/admin/advertising/images/${folderId}?page=${page}&limit=${limit}`);
            if (!r.ok) throw new Error(r.data?.message || "Error cargando imágenes.");
            setImages(Array.isArray(r.data?.data) ? r.data.data : []);
            setImagePagination(r.data?.pagination || { page, limit, total: 0, totalPages: 1 });
            setImagePage(r.data?.pagination?.page || page);
        } catch (e) {
            setError(e?.message || "Error cargando imágenes.");
        } finally {
            setImagesLoading(false);
        }
    }, [imageLimit, imagePage]);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    useEffect(() => {
        const onResize = () => setIsNarrow(typeof window !== "undefined" && window.innerWidth <= 980);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    async function createFolder() {
        if (!newFolderName.trim()) return;
        setCreatingFolder(true);
        setError("");
        try {
            const r = await apiPost("/admin/advertising/folders", { name: newFolderName.trim() });
            if (!r.ok) throw new Error(r.data?.message || "Error creando carpeta.");
            setNewFolderName("");
            setSuccessMsg(`✅ Carpeta "${newFolderName.trim()}" creada.`);
            setTimeout(() => setSuccessMsg(""), 3000);
            await loadFolders();
        } catch (e) {
            setError(e?.message || "Error.");
        } finally {
            setCreatingFolder(false);
        }
    }

    async function startRename(folder) {
        setRenamingFolder(folder.id);
        setRenameValue(folder.name);
    }

    async function submitRename() {
        if (!renameValue.trim() || !renamingFolder) return;
        setError("");
        try {
            const r = await apiFetch(`/admin/advertising/folders/${renamingFolder}`, {
                method: "PUT",
                body: JSON.stringify({ name: renameValue.trim() }),
            });
            if (!r.ok) throw new Error(r.data?.message || "Error renombrando.");
            setRenamingFolder(null);
            setSuccessMsg("✅ Carpeta renombrada.");
            setTimeout(() => setSuccessMsg(""), 3000);
            await loadFolders();
            if (selectedFolder?.id === renamingFolder) {
                setSelectedFolder(prev => ({ ...prev, name: renameValue.trim() }));
            }
        } catch (e) {
            setError(e?.message || "Error.");
        }
    }

    async function deleteFolderConfirm(folder) {
        setConfirmDelete({ type: "folder", id: folder.id, name: folder.name });
    }

    async function toggleFolderActive(folder) {
        setError("");
        try {
            const r = await apiFetch(`/admin/advertising/folders/${folder.id}/toggle`, {
                method: "PATCH",
                body: JSON.stringify({ name: folder.name }),
            });
            if (!r.ok) throw new Error(r.data?.message || "Error actualizando carpeta.");
            const nextActive = Boolean(r.data?.is_active);
            setFolders(prev => prev.map(item => item.id === folder.id ? { ...item, isActive: nextActive } : item));
            if (selectedFolder?.id === folder.id) {
                setSelectedFolder(prev => prev ? { ...prev, isActive: nextActive } : prev);
            }
        } catch (e) {
            setError(e?.message || "Error actualizando carpeta.");
        }
    }

    async function executeDelete() {
        if (!confirmDelete) return;
        setError("");
        try {
            if (confirmDelete.type === "folder") {
                const r = await apiDelete(`/admin/advertising/folders/${confirmDelete.id}`);
                if (!r.ok) throw new Error(r.data?.message || "Error eliminando carpeta.");
                if (selectedFolder?.id === confirmDelete.id) {
                    setSelectedFolder(null);
                    setImages([]);
                }
                setSuccessMsg(`🗑️ Carpeta "${confirmDelete.name}" eliminada.`);
            } else if (confirmDelete.type === "image") {
                const r = await apiDelete(`/admin/advertising/images/${confirmDelete.id}`);
                if (!r.ok) throw new Error(r.data?.message || "Error eliminando imagen.");
                setSuccessMsg(`🗑️ Imagen "${confirmDelete.name}" eliminada.`);
                if (selectedFolder) await loadImages(selectedFolder.id);
            }
            setTimeout(() => setSuccessMsg(""), 3000);
            setConfirmDelete(null);
            await loadFolders();
        } catch (e) {
            setError(e?.message || "Error.");
            setConfirmDelete(null);
        }
    }

    function selectFolder(folder) {
        setSelectedFolder(folder);
        setImages([]);
        setImagePage(1);
        loadImages(folder.id, 1, imageLimit);
    }

    async function uploadImages(filesInput) {
        const files = Array.from(filesInput || []).filter((file) =>
            String(file?.type || "").toLowerCase().startsWith("image/")
        );
        if (!files.length) return;
        if (!selectedFolder) {
            setError("Selecciona una carpeta primero.");
            return;
        }
        setUploading(true);
        setError("");
        try {
            const formData = new FormData();
            for (const file of files) {
                formData.append("images", file);
            }
            formData.append("folder_name", selectedFolder.name);
            formData.append("folder_id", selectedFolder.id);

            const r = await apiPostFormData("/admin/advertising/images/" + selectedFolder.id, formData);
            if (!r.ok) throw new Error(r.data?.message || "Error subiendo imágenes.");
            const json = r.data;
            setSuccessMsg(json?.message || `${json?.data?.length || files.length} imagen(es) subida(s).`);
            setTimeout(() => setSuccessMsg(""), 4000);
            setImagePage(1);
            await loadImages(selectedFolder.id, 1, imageLimit);
            await loadFolders();
        } catch (e) {
            setError(e?.message || "Error de conexión.");
        } finally {
            setUploading(false);
            setDragActive(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function handleUploadFiles(e) {
        await uploadImages(e.target.files);
    }

    function handleDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        if (uploading || !selectedFolder) return;
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }

    async function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (uploading || !selectedFolder) return;
        setDragActive(false);
        await uploadImages(e.dataTransfer?.files);
    }

    async function toggleImageActive(fileId) {
        try {
            const r = await apiFetch(`/admin/advertising/images/${fileId}/toggle`, { method: "PATCH" });
            if (!r.ok) throw new Error(r.data?.message || "Error.");
            setImages(prev => prev.map(img =>
                img.fileId === fileId ? { ...img, isActive: r.data.is_active } : img
            ));
        } catch (e) {
            setError(e?.message || "Error.");
        }
    }

    async function deleteImage(image) {
        setConfirmDelete({ type: "image", id: image.fileId, name: image.name });
    }

    // Calcular tamaño total de imágenes en la carpeta seleccionada
    const totalSize = images.reduce((sum, img) => sum + (Number(img.size) || 0), 0);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc={LOGO_URL} logoOk={true}
                    setLogoOk={() => {}} uploadingLogo={false}
                    onOpenLogoPicker={() => {}}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    {/* ── Header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)", flexShrink: 0 }}>📢</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Publicidad</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Administra imágenes publicitarias en Google Drive. Organiza por carpetas y controla visibilidad.</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Carpetas</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: "#0da6f2" }}>{folders.length}</span>
                            </div>
                            <button className="btn-ghost" onClick={loadFolders} disabled={loading} style={{ height: 36, padding: "0 14px", fontSize: 13, borderRadius: 10 }}>
                                <span style={{ display: "inline-block", animation: loading ? "spin 0.8s linear infinite" : "none" }}>⟳</span> Refrescar
                            </button>
                        </div>
                    </motion.div>

                    {/* ── Messages ── */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onClick={() => setError("")}>
                                {error} <span style={{ opacity: 0.6, float: "right" }}>✕</span>
                            </motion.div>
                        )}
                        {successMsg && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                                {successMsg}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "320px 1fr", gap: 20, alignItems: "start" }}>
                        {/* ── Left Panel: Folders ── */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", order: isNarrow ? 2 : 1 }}>
                            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--stroke)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                    <span style={{ fontSize: 15 }}>📁</span>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Carpetas en Drive</h3>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input style={{ ...inputStyle, height: 36, fontSize: 13, flex: 1 }}
                                        placeholder="Nueva carpeta..."
                                        value={newFolderName}
                                        onChange={e => setNewFolderName(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && createFolder()}
                                    />
                                    <button className="btn" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}
                                        style={{ height: 36, padding: "0 14px", fontSize: 12, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap" }}>
                                        {creatingFolder ? "..." : "+ Crear"}
                                    </button>
                                </div>
                            </div>
                            <div style={{ maxHeight: isNarrow ? "none" : "calc(100vh - 320px)", overflowY: isNarrow ? "visible" : "auto" }}>
                                {loading ? (
                                    <div style={{ padding: "40px 20px", textAlign: "center" }}>
                                        <div style={{ width: 28, height: 28, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                    </div>
                                ) : folders.length === 0 ? (
                                    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                                        No hay carpetas. Crea una nueva.
                                    </div>
                                ) : folders.map(f => (
                                    <div key={f.id}
                                        onClick={() => selectFolder(f)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 10,
                                            padding: "12px 18px", cursor: "pointer",
                                            borderBottom: "1px solid var(--stroke2)",
                                            background: selectedFolder?.id === f.id ? "rgba(13,166,242,0.1)" : "transparent",
                                            borderLeft: selectedFolder?.id === f.id ? "3px solid #0da6f2" : "3px solid transparent",
                                            transition: "all 0.15s",
                                        }}
                                        onMouseEnter={e => { if (selectedFolder?.id !== f.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                                        onMouseLeave={e => { if (selectedFolder?.id !== f.id) e.currentTarget.style.background = "transparent"; }}
                                    >
                                        <span style={{ fontSize: 20 }}>📁</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {renamingFolder === f.id ? (
                                                <input style={{ ...inputStyle, height: 30, fontSize: 12, padding: "0 8px" }}
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") submitRename();
                                                        if (e.key === "Escape") setRenamingFolder(null);
                                                    }}
                                                    onClick={e => e.stopPropagation()}
                                                    autoFocus
                                                />
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{f.imageCount || 0} imágenes</div>
                                                </>
                                            )}
                                        </div>
                                        {renamingFolder === f.id ? (
                                            <>
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button onClick={(e) => { e.stopPropagation(); submitRename(); }}
                                                    style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                                                    OK
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setRenamingFolder(null); }}
                                                    style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                                                    ✕
                                                </button>
                                            </div>
                                            </>
                                        ) : (
                                            <div style={{ display: "flex", gap: 4, opacity: 1, transition: "opacity 0.15s" }}
                                                >
                                                <button onClick={(e) => { e.stopPropagation(); toggleFolderActive(f); }}
                                                    style={{ background: f.isActive === false ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.12)", border: `1px solid ${f.isActive === false ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.28)"}`, color: f.isActive === false ? "#ef4444" : "#10b981", cursor: "pointer", fontSize: 10, padding: "3px 7px", borderRadius: 999, fontWeight: 800 }}
                                                    title={f.isActive === false ? "Mostrar a usuarios" : "Ocultar a usuarios"}>{f.isActive === false ? "Oculta" : "Visible"}</button>
                                                <button onClick={(e) => { e.stopPropagation(); startRename(f); }}
                                                    style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 2 }}
                                                    title="Renombrar">✎</button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteFolderConfirm(f); }}
                                                    style={{ background: "transparent", border: "none", color: "#ef444488", cursor: "pointer", fontSize: 13, padding: 2 }}
                                                    title="Eliminar carpeta">🗑</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* ── Right Panel: Images ── */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", order: 1 }}>
                            {!selectedFolder ? (
                                <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)" }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Selecciona una carpeta</div>
                                    <div style={{ fontSize: 13 }}>Elige una carpeta del panel izquierdo para ver y administrar sus imágenes.</div>
                                </div>
                            ) : (
                                <>
                                    {/* ── Folder header + upload ── */}
                                    <div
                                        onDragEnter={handleDrag}
                                        onDragOver={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDrop={handleDrop}
                                        style={{
                                            padding: "16px 20px",
                                            borderBottom: "1px solid var(--stroke)",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            flexWrap: "wrap",
                                            gap: 12,
                                            transition: "background .2s ease, border-color .2s ease, box-shadow .2s ease",
                                            background: dragActive ? "rgba(13,166,242,0.08)" : "transparent",
                                            boxShadow: dragActive ? "inset 0 0 0 1px rgba(13,166,242,0.45)" : "none",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 22 }}>📂</span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{selectedFolder.name}</h3>
                                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                                    {images.length} imágenes · {formatSize(totalSize)}
                                                </span>
                                                <div style={{ fontSize: 12, color: dragActive ? "#38bdf8" : "var(--muted)", marginTop: 6, fontWeight: dragActive ? 700 : 500 }}>
                                                    {dragActive ? "Suelta las imágenes para cargarlas en esta carpeta." : "También puedes arrastrar varias imágenes aquí."}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                style={{ display: "none" }}
                                                onChange={handleUploadFiles}
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                                style={{
                                                    background: "linear-gradient(135deg, #0da6f2, #6333ff)",
                                                    color: "#fff", border: "none",
                                                    padding: "0 18px", height: 38, borderRadius: 10,
                                                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                                                    fontFamily: "var(--font)",
                                                    boxShadow: "0 4px 12px rgba(13,166,242,0.3)",
                                                    display: "flex", alignItems: "center", gap: 6,
                                                }}
                                            >
                                                {uploading ? "⏳ Subiendo..." : "⬆ Subir imágenes"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Image grid ── */}
                                    <div style={{ padding: 16, maxHeight: isNarrow ? "none" : "calc(100vh - 320px)", overflowY: isNarrow ? "visible" : "auto" }}>
                                        {imagesLoading ? (
                                            <div style={{ padding: "60px 20px", textAlign: "center" }}>
                                                <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                            </div>
                                        ) : images.length === 0 ? (
                                            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                                                <div style={{ fontSize: 14, fontWeight: 600 }}>Esta carpeta está vacía</div>
                                                <div style={{ fontSize: 13, marginTop: 4 }}>Sube imágenes usando el botón de arriba.</div>
                                            </div>
                                        ) : (
                                            <>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                                                {images.map((img, idx) => (
                                                    <motion.div
                                                        key={img.fileId}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                                                        style={{
                                                            background: "var(--bg0)", border: `1px solid ${img.isActive ? "var(--stroke)" : "rgba(239,68,68,0.25)"}`,
                                                            borderRadius: 12, overflow: "hidden",
                                                            opacity: img.isActive ? 1 : 0.5,
                                                            position: "relative",
                                                        }}
                                                    >
                                                        <div style={{ position: "relative", aspectRatio: "16/10", background: "#111", overflow: "hidden" }}>
                                                            <img
                                                                src={img.thumbnailLink || img.previewLink || img.downloadLink}
                                                                alt={img.name}
                                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                loading="lazy"
                                                            />
                                                            {!img.isActive && (
                                                                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                    <span style={{ background: "rgba(239,68,68,0.8)", color: "#fff", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}>OCULTA</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ padding: "10px 12px" }}>
                                                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={img.name}>
                                                                {img.name}
                                                            </div>
                                                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{formatSize(img.size)}</div>
                                                            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                                                                <button
                                                                    onClick={() => toggleImageActive(img.fileId)}
                                                                    style={{
                                                                        flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 10, fontWeight: 700,
                                                                        background: img.isActive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                                                                        color: img.isActive ? "#10b981" : "#ef4444",
                                                                        border: `1px solid ${img.isActive ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                                                                        cursor: "pointer", fontFamily: "var(--font)",
                                                                    }}
                                                                >
                                                                    {img.isActive ? "● Visible" : "○ Ocultar"}
                                                                </button>
                                                                <a href={img.downloadLink} target="_blank" rel="noopener noreferrer"
                                                                    style={{
                                                                        padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                                                                        background: "rgba(13,166,242,0.1)", color: "#0da6f2",
                                                                        border: "1px solid rgba(13,166,242,0.3)", cursor: "pointer",
                                                                        textDecoration: "none", fontFamily: "var(--font)",
                                                                    }}
                                                                    title="Descargar"
                                                                >
                                                                    ⬇
                                                                </a>
                                                                <button
                                                                    onClick={() => deleteImage(img)}
                                                                    style={{
                                                                        padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                                                                        background: "rgba(239,68,68,0.08)", color: "#ef4444",
                                                                        border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", fontFamily: "var(--font)",
                                                                    }}
                                                                    title="Eliminar"
                                                                >
                                                                    🗑
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                                                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                                                    Mostrando {images.length} de {imagePagination.total || images.length} imagen(es)
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                    <select
                                                        value={imageLimit}
                                                        onChange={(e) => {
                                                            const nextLimit = Number(e.target.value);
                                                            setImageLimit(nextLimit);
                                                            setImagePage(1);
                                                            loadImages(selectedFolder.id, 1, nextLimit);
                                                        }}
                                                        style={{ ...inputStyle, width: 86, height: 36 }}
                                                    >
                                                        <option value={10}>10</option>
                                                        <option value={20}>20</option>
                                                        <option value={30}>30</option>
                                                    </select>
                                                    <button className="btn-ghost" disabled={imagePagination.page <= 1} onClick={() => loadImages(selectedFolder.id, imagePagination.page - 1, imageLimit)} style={{ height: 36, padding: "0 12px" }}>Anterior</button>
                                                    <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Pág. {imagePagination.page} / {imagePagination.totalPages}</span>
                                                    <button className="btn-ghost" disabled={imagePagination.page >= imagePagination.totalPages} onClick={() => loadImages(selectedFolder.id, imagePagination.page + 1, imageLimit)} style={{ height: 36, padding: "0 12px" }}>Siguiente</button>
                                                </div>
                                            </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                </main>
            </div>

            {/* ── Confirm Delete Modal ── */}
            <AnimatePresence>
                {confirmDelete && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                        onClick={() => setConfirmDelete(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: "var(--bg0)", border: "1px solid var(--stroke)", borderRadius: 20, width: "100%", maxWidth: 420, padding: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                <span style={{ fontSize: 32 }}>⚠️</span>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>¿Eliminar?</h2>
                            </div>
                            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
                                {confirmDelete.type === "folder"
                                    ? `Se eliminará la carpeta "${confirmDelete.name}" y TODO su contenido de Google Drive permanentemente.`
                                    : `Se eliminará la imagen "${confirmDelete.name}" de Google Drive permanentemente.`}
                            </p>
                            <p style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
                                Esta acción no se puede deshacer.
                            </p>
                            <div style={{ display: "flex", gap: 12 }}>
                                <button onClick={() => setConfirmDelete(null)}
                                    style={{ flex: 1, height: 44, borderRadius: 12, background: "transparent", border: "1px solid var(--stroke)", color: "var(--text)", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                                    Cancelar
                                </button>
                                <button onClick={executeDelete}
                                    style={{ flex: 1, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "var(--font)", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}>
                                    Eliminar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
