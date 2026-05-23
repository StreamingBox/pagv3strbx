import { motion, AnimatePresence } from "framer-motion";
import { startDownload } from "./utils.js";

const MotionDiv = motion.div;

export default function LightboxPreview({ image, onClose }) {
    return (
        <AnimatePresence>
            {image ? (
                <MotionDiv
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", padding: 20 }}
                    onClick={onClose}
                >
                    <MotionDiv
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.9 }}
                        onClick={(event) => event.stopPropagation()}
                        style={{ maxWidth: "90vw", maxHeight: "90vh", position: "relative" }}
                    >
                        <button
                            onClick={onClose}
                            style={{ position: "absolute", top: -40, right: 0, background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", fontWeight: 700 }}
                        >
                            x
                        </button>
                        <img
                            src={image.previewLink || image.downloadLink}
                            alt={image.name}
                            style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, color: "#fff", gap: 16 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.name}</span>
                            <button
                                type="button"
                                onClick={() => startDownload(image.downloadLink)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg, #0da6f2, #6333ff)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "var(--font)", border: "none", cursor: "pointer", flexShrink: 0 }}
                            >
                                Descargar
                            </button>
                        </div>
                    </MotionDiv>
                </MotionDiv>
            ) : null}
        </AnimatePresence>
    );
}
