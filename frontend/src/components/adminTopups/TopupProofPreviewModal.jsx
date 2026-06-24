import { displayTopupCurrency } from "./topupUtils.js";

export default function TopupProofPreviewModal({ previewItem, onClose }) {
    if (!previewItem) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,.72)",
                backdropFilter: "blur(6px)",
                display: "grid",
                placeItems: "center",
                zIndex: 1200,
                padding: 24,
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: "min(1100px, 96vw)",
                    maxHeight: "90vh",
                    overflow: "auto",
                    borderRadius: 22,
                    border: "1px solid var(--stroke)",
                    background: "linear-gradient(180deg, var(--card), var(--card2))",
                    boxShadow: "0 24px 80px rgba(0,0,0,.45)",
                    padding: 18,
                    display: "grid",
                    gap: 16,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 900 }}>Comprobante de {previewItem.requestCode}</div>
                        <div style={{ color: "var(--muted)", marginTop: 4 }}>
                            {previewItem.userName || previewItem.userEmail} · {Number(previewItem.amount || 0).toLocaleString("es-CO")} {displayTopupCurrency(previewItem.currency || "COP")}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <button className="btn-ghost" style={{ width: "auto" }} onClick={() => previewItem?.viewerUrl && window.open(previewItem.viewerUrl, "_blank", "noopener,noreferrer")}>
                            Abrir aparte
                        </button>
                        <button className="btn-ghost" style={{ width: "auto" }} onClick={onClose}>
                            Cerrar
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        borderRadius: 18,
                        border: "1px solid var(--stroke)",
                        background: "rgba(15,23,42,.45)",
                        minHeight: "60vh",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                    }}
                >
                    {previewItem?.inlineUrl ? (
                        previewItem.inlineType.includes("pdf") ? (
                            <object
                                data={previewItem.inlineUrl}
                                type="application/pdf"
                                aria-label={`Comprobante ${previewItem.requestCode}`}
                                style={{ width: "100%", height: "70vh", background: "#fff" }}
                            >
                                <div style={{ padding: 18, color: "var(--muted)" }}>
                                    No se pudo mostrar el PDF aqui. Usa <b>Abrir aparte</b>.
                                </div>
                            </object>
                        ) : (
                            <img
                                src={previewItem.inlineUrl}
                                alt={`Comprobante ${previewItem.requestCode}`}
                                style={{ maxWidth: "100%", maxHeight: "70vh", width: "auto", height: "auto", display: "block", background: "#fff" }}
                            />
                        )
                    ) : null}
                </div>
            </div>
        </div>
    );
}
