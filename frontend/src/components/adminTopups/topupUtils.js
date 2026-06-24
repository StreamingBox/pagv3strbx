export const STATUS_OPTIONS = [
    { value: "", label: "Todas" },
    { value: "submitted", label: "Enviadas" },
    { value: "reviewing", label: "Revisando" },
    { value: "approved", label: "Aprobadas" },
    { value: "rejected", label: "Rechazadas" },
];

export const STATUS_META = {
    submitted: { label: "Enviada", color: "#f59e0b" },
    reviewing: { label: "Revisando", color: "#0ea5e9" },
    approved: { label: "Aprobada", color: "#10b981" },
    rejected: { label: "Rechazada", color: "#ef4444" },
};

export const CURRENCY_OPTIONS = [
    { value: "COP", label: "COP" },
    { value: "USD", label: "USDT" },
    { value: "MXN", label: "MXN" },
];

export const ADMIN_FIELD_STYLE = {
    width: "100%",
    minWidth: 0,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid var(--input-stroke)",
    background: "var(--input-bg)",
    color: "var(--text)",
    outline: "none",
    fontSize: 14,
};

export const ADMIN_LABEL_STYLE = {
    display: "grid",
    gap: 8,
    color: "var(--muted)",
    fontSize: 12,
    fontWeight: 700,
};

let nextMethodRowId = 1;

export function resolveQrImageUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    try {
        if (input.startsWith("/")) {
            return `${window.location.origin}${input}`;
        }
        const url = new URL(input);
        if (url.hostname.includes("drive.google.com")) {
            const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
            const directId = fileMatch?.[1] || url.searchParams.get("id");
            if (directId) {
                return `https://drive.google.com/uc?export=view&id=${directId}`;
            }
        }
    } catch {
        return input;
    }

    return input;
}

export function displayTopupCurrency(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USD") return "USDT";
    return normalized || String(value || "").trim();
}

export function emptyMethod() {
    return {
        _rowId: `method-row-${nextMethodRowId++}`,
        key: "",
        label: "",
        currency: "USD",
        holderName: "",
        accountLabel: "",
        accountValue: "",
        accountAlias: "",
        accountType: "",
        qrImageUrl: "",
        minAmount: "0",
        instructions: "",
    };
}
