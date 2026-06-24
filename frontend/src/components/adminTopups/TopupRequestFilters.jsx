import { STATUS_OPTIONS } from "./topupUtils.js";

export default function TopupRequestFilters({ status, setStatus, query, setQuery, pageSize, setPageSize, loadItems }) {
    return (

                            <section
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "220px minmax(260px, 1fr) 140px",
                                    gap: 12,
                                    alignItems: "end",
                                    marginBottom: 16,
                                    border: "1px solid var(--stroke)",
                                    borderRadius: 18,
                                    background: "linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,.015))",
                                    padding: 14,
                                }}
                            >
                                <label className="wallet-label" style={{ minWidth: 0 }}>
                                    <span>Estado</span>
                                    <select className="wallet-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                                        {STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="wallet-label" style={{ minWidth: 0 }}>
                                    <span>Buscar</span>
                                    <div
                                        className={`dash-search2 ${query.trim() ? "has-text" : ""}`}
                                        style={{
                                            width: "100%",
                                            height: 44,
                                            padding: "0 12px",
                                            borderRadius: 14,
                                            borderColor: query.trim() ? "rgba(124, 92, 255, .42)" : "rgba(255,255,255,.12)",
                                            boxShadow: query.trim() ? "0 0 0 1px rgba(124, 92, 255, .18)" : "none",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="dash-search2__btn"
                                            onClick={loadItems}
                                            aria-label="Buscar"
                                            title="Buscar"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                                <path
                                                    d="M10.5 18.5C14.9183 18.5 18.5 14.9183 18.5 10.5C18.5 6.08172 14.9183 2.5 10.5 2.5C6.08172 2.5 2.5 6.08172 2.5 10.5C2.5 14.9183 6.08172 18.5 10.5 18.5Z"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                />
                                                <path
                                                    d="M16.5 16.5L21.5 21.5"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                        </button>
                                        <input
                                            className="dash-search2__input"
                                            placeholder="Código, nombre, correo o método"
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    loadItems();
                                                }
                                            }}
                                        />
                                        {query.trim() ? (
                                            <button
                                                type="button"
                                                className="dash-search2__clear"
                                                onClick={() => {
                                                    setQuery("");
                                                    setTimeout(() => loadItems(), 0);
                                                }}
                                                aria-label="Limpiar búsqueda"
                                                title="Limpiar"
                                            >
                                                ×
                                            </button>
                                        ) : null}
                                    </div>
                                </label>

                                <label className="wallet-label" style={{ minWidth: 0 }}>
                                    <span>Mostrar</span>
                                    <select className="wallet-input" value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value) || 5)}>
                                        <option value="5">5</option>
                                        <option value="10">10</option>
                                        <option value="20">20</option>
                                    </select>
                                </label>
                            </section>
    );
}
