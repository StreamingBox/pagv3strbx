import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { apiGet } from "../api/api";
import "../styles/special-effects.css";
import useAppLogout from "../hooks/useAppLogout.js";

function formatSize(bytes) {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function Advertising() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [error, setError] = useState("");
    const [previewImage, setPreviewImage] = useState(null);

    const loadFolders = useCallback(async () => {
        setLoading(true);
        try {
            const r = await apiGet("/advertising/folders");
            if (r.ok) setFolders(Array.isArray(r.data) ? r.data : []);
        } catch { } finally {
            setLoading(false);
        }
    }, []);

    const loadImages = useCallback(async (folderId) => {
        setImagesLoading(true);
        setError("");
        try {
            const r = await apiGet(`/advertising/images/${folderId}`);
            if (!r.ok) throw new Error(r.data?.message || "Error");
            setImages(Array.isArray(r.data) ? r.data : []);
        } catch (e) {
            setError(e?.message || "Error cargando imágenes.");
        } finally {
            setImagesLoading(false);
        }
    }, []);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    function selectFolder(folder) {
        setSelectedFolder(folder);
        setImages([]);
        setPreviewImage(null);
        loadImages(folder.id);
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => {}}
                    onGoWallet={() => navigate("/topups")}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoCodes={() => navigate("/codes")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoAdvertising={() => navigate("/advertising")}
                    onGoHome={() => navigate("/dashboard")}
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
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Explora imágenes promocionales y descárgalas con un clic.</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Error ── */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onClick={() => setError("")}>
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Loading ── */}
                    {loading ? (
                        <div style={{ padding: "80px 20px", textAlign: "center" }}>
                            <div style={{ width: 40, height: 40, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
                            <div style={{ color: "var(--muted)", fontSize: 14 }}>Cargando publicidad...</div>
                        </div>
                    ) : folders.length === 0 ? (
                        <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)" }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>No hay publicidad disponible</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>Pronto tendremos contenido promocional para ti.</div>
                        </div>
                    ) : !selectedFolder ? (
                        /* ── Folder grid (selection) ── */
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                            {folders.map((f, idx) => (
                                <motion.div
                                    key={f.id}
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                                    onClick={() => selectFolder(f)}
                                    style={{
                                        background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16,
                                        padding: "24px 20px", cursor: "pointer", textAlign: "center",
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                                        transition: "all 0.2s",
                                    }}
                                    whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}
                                >
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{f.name}</div>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{f.imageCount} imagen(es)</div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        /* ── Images in folder ── */
                        <>
                            {/* Back button + folder name */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                                <button onClick={() => { setSelectedFolder(null); setImages([]); }}
                                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "8px 14px", color: "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "var(--font)", display: "flex", alignItems: "center", gap: 6 }}>
                                    ← Volver
                                </button>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>📂 {selectedFolder.name}</div>
                                <div style={{ fontSize: 13, color: "var(--muted)" }}>{images.length} imágenes</div>
                            </div>

                            {imagesLoading ? (
                                <div style={{ padding: "60px 20px", textAlign: "center" }}>
                                    <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                </div>
                            ) : images.length === 0 ? (
                                <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                    <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>No hay imágenes en esta carpeta</div>
                                </div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                                    {images.map((img, idx) => (
                                        <motion.div
                                            key={img.fileId || img.id}
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                                            style={{
                                                background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16,
                                                overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                                            }}
                                        >
                                            <div
                                                style={{ aspectRatio: "16/10", background: "#111", cursor: "pointer", overflow: "hidden" }}
                                                onClick={() => setPreviewImage(img)}
                                            >
                                                <img
                                                    src={img.thumbnailLink || img.previewLink || img.webViewLink || img.downloadLink}
                                                    alt={img.name}
                                                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                                                    loading="lazy"
                                                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                                                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                                                />
                                            </div>
                                            <div style={{ padding: "12px 14px" }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={img.name}>
                                                    {img.name}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatSize(img.size)}</span>
                                                    <a
                                                        href={img.downloadLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: "inline-flex", alignItems: "center", gap: 5,
                                                            padding: "6px 14px", borderRadius: 8,
                                                            background: "linear-gradient(135deg, #0da6f2, #6333ff)",
                                                            color: "#fff", fontSize: 12, fontWeight: 700,
                                                            textDecoration: "none", fontFamily: "var(--font)",
                                                            boxShadow: "0 4px 12px rgba(13,166,242,0.25)",
                                                        }}
                                                    >
                                                        ⬇ Descargar
                                                    </a>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Image Preview Modal ── */}
                    <AnimatePresence>
                        {previewImage && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", padding: 20 }}
                                onClick={() => setPreviewImage(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ maxWidth: "90vw", maxHeight: "90vh", position: "relative" }}
                                >
                                    <button onClick={() => setPreviewImage(null)}
                                        style={{ position: "absolute", top: -40, right: 0, background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", fontWeight: 700 }}>
                                        ✕
                                    </button>
                                    <img
                                        src={previewImage.previewLink || previewImage.webViewLink || previewImage.downloadLink}
                                        alt={previewImage.name}
                                        style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, color: "#fff" }}>
                                        <span style={{ fontSize: 14, fontWeight: 600 }}>{previewImage.name}</span>
                                        <a href={previewImage.downloadLink} target="_blank" rel="noopener noreferrer"
                                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg, #0da6f2, #6333ff)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "var(--font)" }}>
                                            ⬇ Descargar
                                        </a>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
