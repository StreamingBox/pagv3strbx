import { useState } from "react";

function SearchableSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    inputStyle,
    getSearchText,
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const selected = options.find((opt) => String(opt.value) === String(value));
    const selectedLabel = selected?.label || placeholder;

    const filteredOptions = options.filter((opt) => {
        const haystack = (getSearchText ? getSearchText(opt) : opt.label).toLowerCase();
        return haystack.includes(search.toLowerCase());
    });

    return (
        <div>
            <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 500 }}>
                {label}
            </label>
            <div style={{ position: "relative" }}>
                <button
                    type="button"
                    onClick={() => {
                        setOpen((prev) => !prev);
                        setSearch("");
                    }}
                    style={{
                        ...inputStyle,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        textAlign: "left",
                    }}
                >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
                    <span style={{ marginLeft: 12, fontSize: 10, color: "var(--muted)" }}>▼</span>
                </button>

                {open && (
                    <div style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        background: "var(--bg1)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 14,
                        boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                        zIndex: 120,
                        overflow: "hidden",
                    }}>
                        <div style={{ padding: 10, borderBottom: "1px solid var(--stroke2)" }}>
                            <input
                                autoFocus
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                style={{ ...inputStyle, height: 38, fontSize: 13 }}
                            />
                        </div>

                        <div style={{ maxHeight: 240, overflowY: "auto", padding: 6 }}>
                            {filteredOptions.map((opt) => {
                                const active = String(opt.value) === String(value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.value);
                                            setOpen(false);
                                            setSearch("");
                                        }}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            padding: "10px 12px",
                                            borderRadius: 10,
                                            border: active ? "1px solid rgba(13,166,242,0.35)" : "1px solid transparent",
                                            background: active ? "rgba(13,166,242,0.12)" : "transparent",
                                            color: active ? "var(--accent)" : "var(--text)",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            fontWeight: active ? 700 : 500,
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}

                            {!filteredOptions.length && (
                                <div style={{ padding: "14px 12px", color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
                                    Sin resultados
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SearchableSelect;
