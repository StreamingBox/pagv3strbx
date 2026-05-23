export function formatSize(bytes, emptyValue = "") {
    if (!bytes) return emptyValue;
    const mb = Number(bytes) / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(Number(bytes) / 1024).toFixed(0)} KB`;
}

export function startDownload(downloadLink) {
    const url = new URL(downloadLink, window.location.origin);
    window.location.href = url.toString();
}
