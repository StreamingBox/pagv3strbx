import { motion } from "framer-motion";

const MotionDiv = motion.div;

export default function FolderGrid({
    folders,
    selectedFolder,
    onSelect,
    renderActions,
    minWidth = 200,
    emptyTitle = "No hay carpetas disponibles",
    emptySubtitle = "",
}) {
    if (!folders.length) {
        return (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>CARP</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{emptyTitle}</div>
                {emptySubtitle ? <div style={{ marginTop: 4 }}>{emptySubtitle}</div> : null}
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 16 }}>
            {folders.map((folder, idx) => {
                const isSelected = selectedFolder?.id === folder.id;
                return (
                    <MotionDiv
                        key={folder.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                        onClick={() => onSelect?.(folder)}
                        style={{
                            background: isSelected ? "rgba(13,166,242,0.1)" : "var(--card)",
                            border: isSelected ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                            borderRadius: 16,
                            padding: "24px 20px",
                            cursor: "pointer",
                            textAlign: "center",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                            transition: "all 0.2s",
                        }}
                        whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}
                    >
                        <div style={{ fontSize: 32, marginBottom: 12, color: "#0da6f2", fontWeight: 900 }}>DIR</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{folder.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{folder.imageCount || 0} imagen(es)</div>
                        {renderActions ? <div style={{ marginTop: 12 }}>{renderActions(folder)}</div> : null}
                    </MotionDiv>
                );
            })}
        </div>
    );
}
