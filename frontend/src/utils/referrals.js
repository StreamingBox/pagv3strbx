export const STATUS_LABELS = { pending: "Pendiente", review: "En revisión", credited: "Acreditado", ineligible: "No elegible", expired: "Vencido", cancelled: "Cancelado", reversed: "Revertido" };
export const REASON_LABELS = {
    currency: "La recarga no está en COP.", expired: "El plazo terminó antes de alcanzar la meta.",
    user_not_eligible: "Revisa el estado, rol y moneda de ambos clientes.", wallet_currency: "La billetera del referente no está en COP.",
    monthly_limit: "Se alcanzó el límite mensual del referente.", monthly_budget: "Se alcanzó el presupuesto mensual.", admin_cancelled: "Cancelado por administración.",
    admin_reversed: "Premio revertido por administración.", source_changed: "La recarga vinculada cambió. Revisa el importe, moneda y aprobación.",
};
export const money = value => "$" + Number(value || 0).toLocaleString("es-CO") + " COP";
export const dateTime = value => value ? new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) : "-";
