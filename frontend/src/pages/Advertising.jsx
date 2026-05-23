import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import AdvertisingHeader from "../components/advertising/AdvertisingHeader.jsx";
import FolderGrid from "../components/advertising/FolderGrid.jsx";
import ImageGrid from "../components/advertising/ImageGrid.jsx";
import LightboxPreview from "../components/advertising/LightboxPreview.jsx";
import { startDownload } from "../components/advertising/utils.js";
import { apiGet } from "../api/api";
import "../styles/special-effects.css";
import useAppLogout from "../hooks/useAppLogout.js";

const MotionDiv = motion.div;

async function fetchFolders() {
    const response = await apiGet("/advertising/folders");
    if (!response.ok) throw new Error(response.data?.message || "Error cargando publicidad.");
    return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function fetchImages(folderId, page) {
    if (!folderId) return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
    const response = await apiGet(`/advertising/images/${folderId}?page=${page}&limit=10`);
    if (!response.ok) throw new Error(response.data?.message || "Error cargando imagenes.");
    return {
        data: Array.isArray(response.data?.data) ? response.data.data : [],
        pagination: response.data?.pagination || { page, limit: 10, total: 0, totalPages: 1 },
    };
}

export default function Advertising() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [imagePage, setImagePage] = useState(1);
    const [previewImage, setPreviewImage] = useState(null);
    const [dismissedError, setDismissedError] = useState(false);

    const foldersQuery = useQuery({
        queryKey: ["advertising", "folders"],
        queryFn: fetchFolders,
    });

    const imagesQuery = useQuery({
        queryKey: ["advertising", "images", selectedFolder?.id || "", imagePage],
        queryFn: () => fetchImages(selectedFolder?.id, imagePage),
        enabled: !!selectedFolder?.id,
        keepPreviousData: true,
    });

    const folders = foldersQuery.data || [];
    const images = imagesQuery.data?.data || [];
    const imagePagination = imagesQuery.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
    const error = foldersQuery.error?.message || imagesQuery.error?.message || "";

    function selectFolder(folder) {
        setSelectedFolder(folder);
        setPreviewImage(null);
        setImagePage(1);
        setDismissedError(false);
    }

    function goBackToFolders() {
        setSelectedFolder(null);
        setPreviewImage(null);
        setImagePage(1);
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
                    <AdvertisingHeader
                        title="Publicidad"
                        subtitle="Explora imagenes promocionales y descargalas con un clic."
                    />

                    <AnimatePresence>
                        {error && !dismissedError ? (
                            <MotionDiv
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onClick={() => setDismissedError(true)}
                            >
                                {error}
                            </MotionDiv>
                        ) : null}
                    </AnimatePresence>

                    {foldersQuery.isLoading ? (
                        <div style={{ padding: "80px 20px", textAlign: "center" }}>
                            <div style={{ width: 40, height: 40, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
                            <div style={{ color: "var(--muted)", fontSize: 14 }}>Cargando publicidad...</div>
                        </div>
                    ) : !selectedFolder ? (
                        <FolderGrid
                            folders={folders}
                            onSelect={selectFolder}
                            emptyTitle="No hay publicidad disponible"
                            emptySubtitle="Pronto tendremos contenido promocional para ti."
                        />
                    ) : (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                                <button
                                    onClick={goBackToFolders}
                                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "8px 14px", color: "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "var(--font)", display: "flex", alignItems: "center", gap: 6 }}
                                >
                                    Volver
                                </button>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{selectedFolder.name}</div>
                                <div style={{ fontSize: 13, color: "var(--muted)" }}>{images.length} imagenes</div>
                            </div>

                            {imagesQuery.isLoading ? (
                                <div style={{ padding: "60px 20px", textAlign: "center" }}>
                                    <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                </div>
                            ) : (
                                <>
                                    <ImageGrid
                                        images={images}
                                        onPreview={setPreviewImage}
                                        onDownload={startDownload}
                                        emptyTitle="No hay imagenes en esta carpeta"
                                    />
                                    {images.length ? (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
                                            <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>
                                                Mostrando {images.length} de {imagePagination.total || images.length} imagen(es)
                                            </span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <button className="btn-ghost" disabled={imagePage <= 1} onClick={() => setImagePage((page) => Math.max(1, page - 1))} style={{ height: 38, padding: "0 14px" }}>Anterior</button>
                                                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Pag. {imagePagination.page} / {imagePagination.totalPages}</span>
                                                <button className="btn-ghost" disabled={imagePage >= imagePagination.totalPages} onClick={() => setImagePage((page) => page + 1)} style={{ height: 38, padding: "0 14px" }}>Siguiente</button>
                                            </div>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </>
                    )}

                    <LightboxPreview image={previewImage} onClose={() => setPreviewImage(null)} />
                </main>
            </div>
        </div>
    );
}
