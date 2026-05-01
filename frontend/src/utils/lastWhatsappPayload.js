export function saveLastWhatsappPayload({ message, orderCode, orderId, total, currency, count }) {
    try {
        const payload = {
            message: message || "",
            orderCode: orderCode || "",
            orderId: orderId ?? null,
            createdAt: new Date().toISOString(),
            total: total ?? null,
            currency: currency || "",
            count: count ?? null,
        };
        localStorage.setItem("lastWhatsappPayload", JSON.stringify(payload));
        window.dispatchEvent(new Event("lastWhatsappPayloadUpdated"));
    } catch {
        // ignore
    }
}
