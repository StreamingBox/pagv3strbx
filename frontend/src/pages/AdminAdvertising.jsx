import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    Eye,
    EyeOff,
    Folder,
    Image as ImageIcon,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { apiDelete, apiFetch, apiGet, apiPost, apiPostFormData } from "../api/api";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import AdvertisingHeader from "../components/advertising/AdvertisingHeader.jsx";
import ImageGrid from "../components/advertising/ImageGrid.jsx";
import { formatSize } from "../components/advertising/utils.js";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";
const MotionDiv = motion.div;

const smallIconButton = {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--stroke2)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--muted)",
    cursor: "pointer",
};

const inputStyle = {
    appearance: "none",
    height: 42,
    padding: "0 14px",
    background: "var(--bg0)",
    color: "var(--text)",
    border: "1px solid var(--stroke)",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    width: "100%",
    fontFamily: "var(--font)",
    transition: "border-color 0.2s",
};

async function fetchFolders() {
    const response = await apiGet("/admin/advertising/folders");
    if (!response.ok) throw new Error(response.data?.message || "Error cargando carpetas.");
    return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function fetchImages(folderId, page, limit) {
    if (!folderId) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    const response = await apiGet(`/admin/advertising/images/${folderId}?page=${page}&limit=${limit}`);
    if (!response.ok) throw new Error(response.data?.message || "Error cargando imagenes.");
    return {
        data: Array.isArray(response.data?.data) ? response.data.data : [],
        pagination: response.data?.pagination || { page, limit, total: 0, totalPages: 1 },
    };
}

export default function AdminAdvertising() {
    const { user } = useAuth();
    const logout = useAppLogout();
    const queryClient = useQueryClient();
    const fileInputRef = useRef(null);

    const [selectedFolder, setSelectedFolder] = useState(null);
    const [imagePage, setImagePage] = useState(1);
    const [imageLimit, setImageLimit] = useState(10);
    const [newFolderName, setNewFolderName] = useState("");
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [renamingFolder, setRenamingFolder] = useState(null);
    const [renameValue, setRenameValue] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");
    const [actionError, setActionError] = useState("");
    const [isNarrow, setIsNarrow] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth <= 980 : false
    );

    const foldersQuery = useQuery({
        queryKey: ["admin-advertising", "folders"],
        queryFn: fetchFolders,
    });

    const imagesQuery = useQuery({
        queryKey: ["admin-advertising", "images", selectedFolder?.id || "", imagePage, imageLimit],
        queryFn: () => fetchImages(selectedFolder?.id, imagePage, imageLimit),
        enabled: !!selectedFolder?.id,
        keepPreviousData: true,
    });

    const folders = foldersQuery.data || [];
    const images = imagesQuery.data?.data || [];
    const imagePagination = imagesQuery.data?.pagination || { page: 1, limit: imageLimit, total: 0, totalPages: 1 };
    const error = actionError || foldersQuery.error?.message || imagesQuery.error?.message || "";
    const totalSize = images.reduce((sum, img) => sum + (Number(img.size) || 0), 0);

    useEffect(() => {
        const onResize = () => setIsNarrow(typeof window !== "undefined" && window.innerWidth <= 980);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    function showSuccess(message, timeout = 3000) {
        setSuccessMsg(message);
        window.setTimeout(() => setSuccessMsg(""), timeout);
    }

    async function refreshAdvertisingQueries(folderId = selectedFolder?.id) {
        await queryClient.invalidateQueries({ queryKey: ["admin-advertising", "folders"] });
        if (folderId) {
            await queryClient.invalidateQueries({ queryKey: ["admin-advertising", "images", folderId] });
        }
    }

    function selectFolder(folder) {
        setSelectedFolder(folder);
        setImagePage(1);
        setActionError("");
    }

    async function createFolder() {
        if (!newFolderName.trim()) return;
        setCreatingFolder(true);
        setActionError("");
        try {
            const folderName = newFolderName.trim();
            const response = await apiPost("/admin/advertising/folders", { name: folderName });
            if (!response.ok) throw new Error(response.data?.message || "Error creando carpeta.");
            setNewFolderName("");
            showSuccess(`Carpeta "${folderName}" creada.`);
            await refreshAdvertisingQueries();
        } catch (err) {
            setActionError(err?.message || "Error creando carpeta.");
        } finally {
            setCreatingFolder(false);
        }
    }

    function startRename(folder) {
        setRenamingFolder(folder.id);
        setRenameValue(folder.name);
    }

    async function submitRename() {
        if (!renameValue.trim() || !renamingFolder) return;
        setActionError("");
        try {
            const response = await apiFetch(`/admin/advertising/folders/${renamingFolder}`, {
                method: "PUT",
                body: JSON.stringify({ name: renameValue.trim() }),
            });
            if (!response.ok) throw new Error(response.data?.message || "Error renombrando.");
            setRenamingFolder(null);
            if (selectedFolder?.id === renamingFolder) {
                setSelectedFolder((folder) => ({ ...folder, name: renameValue.trim() }));
            }
            showSuccess("Carpeta renombrada.");
            await refreshAdvertisingQueries(renamingFolder);
        } catch (err) {
            setActionError(err?.message || "Error renombrando carpeta.");
        }
    }

    async function toggleFolderActive(folder) {
        setActionError("");
        try {
            const response = await apiFetch(`/admin/advertising/folders/${folder.id}/toggle`, {
                method: "PATCH",
                body: JSON.stringify({ name: folder.name }),
            });
            if (!response.ok) throw new Error(response.data?.message || "Error actualizando carpeta.");
            if (selectedFolder?.id === folder.id) {
                setSelectedFolder((current) => current ? { ...current, isActive: Boolean(response.data?.is_active) } : current);
            }
            await refreshAdvertisingQueries(folder.id);
        } catch (err) {
            setActionError(err?.message || "Error actualizando carpeta.");
        }
    }

    async function executeDelete() {
        if (!confirmDelete) return;
        setActionError("");
        try {
            if (confirmDelete.type === "folder") {
                const response = await apiDelete(`/admin/advertising/folders/${confirmDelete.id}`);
                if (!response.ok) throw new Error(response.data?.message || "Error eliminando carpeta.");
                if (selectedFolder?.id === confirmDelete.id) {
                    setSelectedFolder(null);
                }
                showSuccess(`Carpeta "${confirmDelete.name}" eliminada.`);
            } else {
                const response = await apiDelete(`/admin/advertising/images/${confirmDelete.id}`);
                if (!response.ok) throw new Error(response.data?.message || "Error eliminando imagen.");
                showSuccess(`Imagen "${confirmDelete.name}" eliminada.`);
            }
            const folderId = selectedFolder?.id;
            setConfirmDelete(null);
            await refreshAdvertisingQueries(folderId);
        } catch (err) {
            setConfirmDelete(null);
            setActionError(err?.message || "Error eliminando.");
        }
    }

    async function uploadImages(filesInput) {
        const files = Array.from(filesInput || []).filter((file) =>
            String(file?.type || "").toLowerCase().startsWith("image/")
        );
        if (!files.length) return;
        if (!selectedFolder) {
            setActionError("Selecciona una carpeta primero.");
            return;
        }

        setUploading(true);
        setActionError("");
        try {
            const formData = new FormData();
            for (const file of files) {
                formData.append("images", file);
            }
            formData.append("folder_name", selectedFolder.name);
            formData.append("folder_id", selectedFolder.id);

            const response = await apiPostFormData(`/admin/advertising/images/${selectedFolder.id}`, formData);
            if (!response.ok) throw new Error(response.data?.message || "Error subiendo imagenes.");
            showSuccess(response.data?.message || `${files.length} imagen(es) subida(s).`, 4000);
            setImagePage(1);
            await refreshAdvertisingQueries(selectedFolder.id);
        } catch (err) {
            setActionError(err?.message || "Error de conexion.");
        } finally {
            setUploading(false);
            setDragActive(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function toggleImageActive(fileId) {
        setActionError("");
        try {
            const response = await apiFetch(`/admin/advertising/images/${fileId}/toggle`, { method: "PATCH" });
            if (!response.ok) throw new Error(response.data?.message || "Error.");
            await refreshAdvertisingQueries(selectedFolder?.id);
        } catch (err) {
            setActionError(err?.message || "Error actualizando imagen.");
        }
    }

    function handleDrag(event) {
        event.preventDefault();
        event.stopPropagation();
        if (uploading || !selectedFolder) return;
        setDragActive(event.type === "dragenter" || event.type === "dragover");
    }

    async function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        if (uploading || !selectedFolder) return;
        setDragActive(false);
        await uploadImages(event.dataTransfer?.files);
    }

    function renderFolderRow(folder) {
        const isSelected = selectedFolder?.id === folder.id;
        const isRenaming = renamingFolder === folder.id;
        return (
            <div
                key={folder.id}
                onClick={() => selectFolder(folder)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 18px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--stroke2)",
                    background: isSelected ? "rgba(13,166,242,0.1)" : "transparent",
                    borderLeft: isSelected ? "3px solid #0da6f2" : "3px solid transparent",
                    transition: "all 0.15s",
                }}
            >
                <span style={{ flexShrink: 0, color: isSelected ? "#38bdf8" : "var(--muted)", display: "inline-flex" }}>
                    <Folder size={19} strokeWidth={1.9} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {isRenaming ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void submitRename();
                                if (event.key === "Escape") setRenamingFolder(null);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            style={{ ...inputStyle, height: 32, fontSize: 12 }}
                        />
                    ) : (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{folder.imageCount || 0} imagen(es)</div>
                        </>
                    )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
                    {isRenaming ? (
                        <>
                            <button
                                type="button"
                                onClick={submitRename}
                                style={{ ...smallIconButton, color: "#10b981", borderColor: "rgba(16,185,129,0.28)" }}
                                title="Guardar nombre"
                            >
                                <Check size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setRenamingFolder(null)}
                                style={{ ...smallIconButton, color: "#ef4444", borderColor: "rgba(239,68,68,0.24)" }}
                                title="Cancelar"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => toggleFolderActive(folder)}
                                style={{ background: folder.isActive === false ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.12)", border: `1px solid ${folder.isActive === false ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.28)"}`, color: folder.isActive === false ? "#ef4444" : "#10b981", cursor: "pointer", fontSize: 10, padding: "3px 7px", borderRadius: 999, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4 }}
                                title={folder.isActive === false ? "Mostrar a usuarios" : "Ocultar a usuarios"}
                            >
                                {folder.isActive === false ? <EyeOff size={12} /> : <Eye size={12} />}
                                {folder.isActive === false ? "Oculta" : "Visible"}
                            </button>
                            <button onClick={() => startRename(folder)} style={smallIconButton} title="Renombrar">
                                <Pencil size={14} />
                            </button>
                            <button onClick={() => setConfirmDelete({ type: "folder", id: folder.id, name: folder.name })} style={{ ...smallIconButton, color: "#ef4444", borderColor: "rgba(239,68,68,0.24)" }} title="Eliminar carpeta">
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
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
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => {}}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    <AdvertisingHeader
                        title="Publicidad"
                        subtitle="Administra imagenes publicitarias en Google Drive. Organiza por carpetas y controla visibilidad."
                    >
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                                <Folder size={16} color="#38bdf8" />
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Carpetas</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: "#0da6f2" }}>{folders.length}</span>
                            </div>
                            <button className="btn-ghost" onClick={() => refreshAdvertisingQueries()} disabled={foldersQuery.isLoading} style={{ height: 36, padding: "0 14px", fontSize: 13, borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 7 }}>
                                <RefreshCw size={14} />
                                Refrescar
                            </button>
                        </div>
                    </AdvertisingHeader>

                    <AnimatePresence>
                        {error ? (
                            <MotionDiv initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onClick={() => setActionError("")}>
                                {error}
                            </MotionDiv>
                        ) : null}
                        {successMsg ? (
                            <MotionDiv initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                                {successMsg}
                            </MotionDiv>
                        ) : null}
                    </AnimatePresence>

                    <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "320px 1fr", gap: 20, alignItems: "start" }}>
                        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", order: isNarrow ? 2 : 1 }}>
                            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--stroke)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                    <Folder size={17} color="#38bdf8" />
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Carpetas en Drive</h3>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        style={{ ...inputStyle, height: 36, fontSize: 13, flex: 1 }}
                                        placeholder="Nueva carpeta..."
                                        value={newFolderName}
                                        onChange={(event) => setNewFolderName(event.target.value)}
                                        onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }}
                                    />
                                    <button className="btn" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()} style={{ height: 36, padding: "0 14px", fontSize: 12, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <Plus size={14} />
                                        {creatingFolder ? "Creando" : "Crear"}
                                    </button>
                                </div>
                            </div>
                            <div style={{ maxHeight: isNarrow ? "none" : "calc(100vh - 320px)", overflowY: isNarrow ? "visible" : "auto" }}>
                                {foldersQuery.isLoading ? (
                                    <div style={{ padding: "40px 20px", textAlign: "center" }}>
                                        <div style={{ width: 28, height: 28, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                    </div>
                                ) : folders.length === 0 ? (
                                    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                                        <Folder size={34} strokeWidth={1.8} style={{ marginBottom: 8, color: "#38bdf8" }} />
                                        No hay carpetas. Crea una nueva.
                                    </div>
                                ) : folders.map(renderFolderRow)}
                            </div>
                        </MotionDiv>

                        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", order: 1 }}>
                            {!selectedFolder ? (
                                <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)" }}>
                                    <ImageIcon size={38} strokeWidth={1.7} style={{ marginBottom: 16, color: "#38bdf8" }} />
                                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Selecciona una carpeta</div>
                                    <div style={{ fontSize: 13 }}>Elige una carpeta del panel izquierdo para ver y administrar sus imagenes.</div>
                                </div>
                            ) : (
                                <>
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
                                            <span style={{ width: 38, height: 38, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(13,166,242,0.12)", border: "1px solid rgba(13,166,242,0.25)", color: "#38bdf8", flexShrink: 0 }}>
                                                <Folder size={20} strokeWidth={1.9} />
                                            </span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{selectedFolder.name}</h3>
                                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                                    {images.length} imagenes - {formatSize(totalSize, "-")}
                                                </span>
                                                <div style={{ fontSize: 12, color: dragActive ? "#38bdf8" : "var(--muted)", marginTop: 6, fontWeight: dragActive ? 700 : 500 }}>
                                                    {dragActive ? "Suelta las imagenes para cargarlas en esta carpeta." : "Tambien puedes arrastrar varias imagenes aqui."}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(event) => uploadImages(event.target.files)} />
                                            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: "linear-gradient(135deg, #0da6f2, #6333ff)", color: "#fff", border: "none", padding: "0 18px", height: 38, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)", boxShadow: "0 4px 12px rgba(13,166,242,0.3)", display: "flex", alignItems: "center", gap: 7 }}>
                                                <UploadCloud size={16} />
                                                {uploading ? "Subiendo..." : "Subir imagenes"}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ padding: 16, maxHeight: isNarrow ? "none" : "calc(100vh - 320px)", overflowY: isNarrow ? "visible" : "auto" }}>
                                        {imagesQuery.isLoading ? (
                                            <div style={{ padding: "60px 20px", textAlign: "center" }}>
                                                <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                            </div>
                                        ) : (
                                            <>
                                                <ImageGrid
                                                    admin
                                                    images={images}
                                                    minWidth={180}
                                                    emptyTitle="Esta carpeta esta vacia"
                                                    renderActions={(img) => (
                                                        <>
                                                            <button onClick={() => toggleImageActive(img.fileId)} style={{ flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 10, fontWeight: 700, background: img.isActive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: img.isActive ? "#10b981" : "#ef4444", border: `1px solid ${img.isActive ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, cursor: "pointer", fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                                                {img.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                                                                {img.isActive ? "Visible" : "Oculta"}
                                                            </button>
                                                            <a href={img.downloadLink} target="_blank" rel="noopener noreferrer" style={{ width: 28, height: 24, borderRadius: 6, background: "rgba(13,166,242,0.1)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.3)", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Descargar">
                                                                <Download size={13} />
                                                            </a>
                                                            <button onClick={() => setConfirmDelete({ type: "image", id: img.fileId, name: img.name })} style={{ width: 28, height: 24, borderRadius: 6, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Eliminar">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                />
                                                {images.length ? (
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                                                        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                                                            Mostrando {images.length} de {imagePagination.total || images.length} imagen(es)
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                            <select
                                                                value={imageLimit}
                                                                onChange={(event) => {
                                                                    const nextLimit = Number(event.target.value);
                                                                    setImageLimit(nextLimit);
                                                                    setImagePage(1);
                                                                }}
                                                                style={{ ...inputStyle, width: 86, height: 36 }}
                                                            >
                                                                <option value={10}>10</option>
                                                                <option value={20}>20</option>
                                                                <option value={30}>30</option>
                                                            </select>
                                                            <button className="btn-ghost" disabled={imagePagination.page <= 1} onClick={() => setImagePage((page) => Math.max(1, page - 1))} style={{ height: 36, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 5 }}><ChevronLeft size={14} />Anterior</button>
                                                            <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Pag. {imagePagination.page} / {imagePagination.totalPages}</span>
                                                            <button className="btn-ghost" disabled={imagePagination.page >= imagePagination.totalPages} onClick={() => setImagePage((page) => page + 1)} style={{ height: 36, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>Siguiente<ChevronRight size={14} /></button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </MotionDiv>
                    </div>
                </main>
            </div>

            <AnimatePresence>
                {confirmDelete ? (
                    <MotionDiv
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", padding: 20 }}
                        onClick={() => setConfirmDelete(null)}
                    >
                        <MotionDiv
                            initial={{ scale: 0.95, y: 15 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 15 }}
                            onClick={(event) => event.stopPropagation()}
                            style={{ background: "var(--bg0)", border: "1px solid var(--stroke)", borderRadius: 20, width: "100%", maxWidth: 420, padding: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
                        >
                            <h3 style={{ margin: "0 0 8px", color: "var(--text)", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                                <Trash2 size={18} color="#ef4444" />
                                Confirmar eliminacion
                            </h3>
                            <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                                Esta accion eliminara {confirmDelete.type === "folder" ? "la carpeta" : "la imagen"} "{confirmDelete.name}".
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                <button className="btn-ghost" onClick={() => setConfirmDelete(null)} style={{ height: 36, padding: "0 14px" }}>Cancelar</button>
                                <button className="btn" onClick={executeDelete} style={{ height: 36, padding: "0 14px", background: "#ef4444" }}>Eliminar</button>
                            </div>
                        </MotionDiv>
                    </MotionDiv>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
