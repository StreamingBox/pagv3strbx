import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_PROMO_COLOR, deviceRuleEnabled, inputStyle, normalizePromoColor, selStyle } from "./platformUtils.js";

export default function PlatformEditModal({ editingPlatform, setEditingPlatform, saveEditedPlatform, activeCategories, saving }) {
    return (
        <>
                    {/* Modal Editar Plataforma */}
                    <AnimatePresence>
                        {editingPlatform && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                                onClick={() => setEditingPlatform(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ background: "var(--bg0)", border: "1px solid var(--stroke)", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
                                >
                                    <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 20 }}>Editar Plataforma</h2>
                                    <form onSubmit={saveEditedPlatform} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Nombre</label>
                                            <input style={inputStyle} value={editingPlatform.name || ""} onChange={e => setEditingPlatform({ ...editingPlatform, name: e.target.value })} required />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Slug</label>
                                            <input style={{ ...inputStyle, fontFamily: "monospace" }} value={editingPlatform.slug || ""} onChange={e => setEditingPlatform({ ...editingPlatform, slug: e.target.value })} required />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Categoría</label>
                                            <select style={selStyle} value={editingPlatform.category_id || ""} onChange={e => setEditingPlatform({ ...editingPlatform, category_id: e.target.value })}>
                                                <option value="">Sin categoría</option>
                                                {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Modo</label>
                                            <select style={selStyle} value={editingPlatform.type || "normal"} onChange={e => setEditingPlatform({ ...editingPlatform, type: e.target.value })}>
                                                <option value="normal">Normal (Control de stock)</option>
                                                <option value="correo">A Correo (Sin Stock, Automático)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Ficha del producto</label>
                                            <textarea
                                                style={{ ...inputStyle, height: 130, padding: "12px 14px", resize: "vertical", lineHeight: 1.5 }}
                                                value={editingPlatform.product_details || ""}
                                                onChange={e => setEditingPlatform({ ...editingPlatform, product_details: e.target.value })}
                                                maxLength={5000}
                                                placeholder="Una característica o condición por línea"
                                            />
                                            <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>El cliente deberá revisar estas condiciones antes de finalizar la compra.</div>
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Regla 1 dispositivo</label>
                                            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 42, padding: "0 14px", borderRadius: 10, border: `1px solid ${deviceRuleEnabled(editingPlatform.show_device_rule) ? "rgba(16,185,129,0.34)" : "var(--stroke)"}`, background: deviceRuleEnabled(editingPlatform.show_device_rule) ? "rgba(16,185,129,0.10)" : "var(--bg0)", cursor: "pointer" }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: deviceRuleEnabled(editingPlatform.show_device_rule) ? "#10b981" : "var(--muted)" }}>{deviceRuleEnabled(editingPlatform.show_device_rule) ? "Se muestra en entregas" : "No se muestra"}</span>
                                                <input type="checkbox" checked={deviceRuleEnabled(editingPlatform.show_device_rule)} onChange={e => setEditingPlatform({ ...editingPlatform, show_device_rule: e.target.checked ? 1 : 0 })} />
                                            </label>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Promoción</label>
                                                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 42, padding: "0 14px", borderRadius: 10, border: `1px solid ${(editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? `${editingPlatform.promo_color || DEFAULT_PROMO_COLOR}66` : "var(--stroke)"}`, background: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? `${editingPlatform.promo_color || DEFAULT_PROMO_COLOR}14` : "var(--bg0)", boxShadow: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? `0 0 18px ${(editingPlatform.promo_color || DEFAULT_PROMO_COLOR)}22` : "none", cursor: "pointer" }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? (editingPlatform.promo_color || DEFAULT_PROMO_COLOR) : "var(--text)" }}>Activar promo</span>
                                                    <input type="checkbox" checked={editingPlatform.is_promo === 1 || editingPlatform.is_promo === true} onChange={e => setEditingPlatform({ ...editingPlatform, is_promo: e.target.checked ? 1 : 0, promo_color: e.target.checked ? normalizePromoColor(editingPlatform.promo_color || DEFAULT_PROMO_COLOR) : editingPlatform.promo_color })} />
                                                </label>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Color Neon</label>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 10px", background: "var(--bg0)", border: `1px solid ${(editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? `${editingPlatform.promo_color || DEFAULT_PROMO_COLOR}88` : "var(--stroke)"}`, borderRadius: 10, boxShadow: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? `0 0 16px ${(editingPlatform.promo_color || DEFAULT_PROMO_COLOR)}22 inset` : "none", opacity: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? 1 : 0.5 }}>
                                                    <input type="color" disabled={!(editingPlatform.is_promo === 1 || editingPlatform.is_promo === true)} value={normalizePromoColor(editingPlatform.promo_color || DEFAULT_PROMO_COLOR)} onChange={e => setEditingPlatform({ ...editingPlatform, promo_color: e.target.value.toUpperCase() })} style={{ width: 34, height: 24, padding: 0, border: "none", background: "transparent", cursor: (editingPlatform.is_promo === 1 || editingPlatform.is_promo === true) ? "pointer" : "not-allowed" }} />
                                                    <input style={{ ...inputStyle, height: 30, padding: "0 10px", border: "none", background: "transparent", boxShadow: "none" }} disabled={!(editingPlatform.is_promo === 1 || editingPlatform.is_promo === true)} value={editingPlatform.promo_color || DEFAULT_PROMO_COLOR} onChange={e => setEditingPlatform({ ...editingPlatform, promo_color: e.target.value.toUpperCase() })} placeholder="#22D3EE" />
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                                            <button type="button" onClick={() => setEditingPlatform(null)} style={{ flex: 1, height: 44, borderRadius: 12, background: "transparent", border: "1px solid var(--stroke)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                                            <button type="submit" disabled={saving} style={{ flex: 1, height: 44, borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,166,242,0.3)" }}>{saving ? "Guardando..." : "Guardar Cambios"}</button>
                                        </div>
                                    </form>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
        </>
    );
}
