export function onlyDigits(value, maxLength) {
    return String(value || "").replace(/\D/g, "").slice(0, maxLength);
}

export function formatTvCode(value) {
    const digits = onlyDigits(value, 8);
    return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
