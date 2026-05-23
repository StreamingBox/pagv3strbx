import { motion } from "framer-motion";
import { formatSize } from "./utils.js";

const MotionDiv = motion.div;

export default function ImageGrid({
    images,
    minWidth = 220,
    onPreview,
    onDownload,
    renderActions,
    emptyTitle = "No hay imagenes en esta carpeta",
    admin = false,
}) {
    if (!images.length) {
        return (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>IMG</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{emptyTitle}</div>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: admin ? 12 : 16 }}>
            {images.map((img, idx) => (
                <MotionDiv
                    key={img.fileId || img.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    style={{
                        background: admin ? "var(--bg0)" : "var(--card)",
                        border: `1px solid ${img.isActive === false ? "rgba(239,68,68,0.25)" : "var(--stroke)"}`,
                        borderRadius: admin ? 12 : 16,
                        overflow: "hidden",
                        opacity: img.isActive === false ? 0.5 : 1,
                        position: "relative",
                        boxShadow: admin ? "none" : "0 4px 20px rgba(0,0,0,0.12)",
                    }}
                >
                    <div
                        style={{ position: "relative", aspectRatio: "16/10", background: "#111", cursor: onPreview ? "pointer" : "default", overflow: "hidden" }}
                        onClick={() => onPreview?.(img)}
                    >
                        <img
                            src={img.thumbnailLink || img.previewLink || img.downloadLink}
                            alt={img.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                            loading="lazy"
                            onMouseEnter={(e) => { if (!admin) e.currentTarget.style.transform = "scale(1.05)"; }}
                            onMouseLeave={(e) => { if (!admin) e.currentTarget.style.transform = "scale(1)"; }}
                        />
                        {img.isActive === false ? (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ background: "rgba(239,68,68,0.8)", color: "#fff", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}>OCULTA</span>
                            </div>
                        ) : null}
                    </div>
                    <div style={{ padding: admin ? "10px 12px" : "12px 14px" }}>
                        <div style={{ fontSize: admin ? 12 : 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={img.name}>
                            {img.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: admin ? 2 : 4, gap: 8 }}>
                            <span style={{ fontSize: admin ? 10 : 11, color: "var(--muted)" }}>{formatSize(img.size, admin ? "-" : "")}</span>
                            {!renderActions && onDownload ? (
                                <button
                                    type="button"
                                    onClick={() => onDownload(img.downloadLink)}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 5,
                                        padding: "6px 14px",
                                        borderRadius: 8,
                                        background: "linear-gradient(135deg, #0da6f2, #6333ff)",
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        fontFamily: "var(--font)",
                                        boxShadow: "0 4px 12px rgba(13,166,242,0.25)",
                                        border: "none",
                                        cursor: "pointer",
                                    }}
                                >
                                    Descargar
                                </button>
                            ) : null}
                        </div>
                        {renderActions ? <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>{renderActions(img)}</div> : null}
                    </div>
                </MotionDiv>
            ))}
        </div>
    );
}
