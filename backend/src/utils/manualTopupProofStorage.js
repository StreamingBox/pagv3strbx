const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "..", "..");

function getProofStorageDir() {
    const configured = String(process.env.TOPUP_PROOFS_DIR || "").trim();
    return configured
        ? path.resolve(BACKEND_ROOT, configured)
        : path.join(BACKEND_ROOT, "storage", "topup-proofs");
}

function getProofExtension(file) {
    const mime = String(file?.mimetype || "").toLowerCase();
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "application/pdf") return ".pdf";
    return path.extname(String(file?.originalname || "")).toLowerCase() || ".bin";
}

function saveManualTopupProof({ file, requestCode }) {
    const storageDir = getProofStorageDir();
    fs.mkdirSync(storageDir, { recursive: true });

    const safeCode = String(requestCode || "proof")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-");
    const filename = `${safeCode}${getProofExtension(file)}`;
    fs.writeFileSync(path.join(storageDir, filename), file.buffer);
    return `/topup-proofs/${filename}`;
}

function getManualTopupProofPath(proofFileUrl) {
    const filename = path.basename(String(proofFileUrl || "").trim());
    if (!filename) return null;

    const candidates = [path.join(getProofStorageDir(), filename)];
    return candidates.find(filePath => fs.existsSync(filePath)) || null;
}

function getProofContentType(filePath) {
    const ext = String(path.extname(filePath || "")).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".pdf") return "application/pdf";
    return "application/octet-stream";
}

module.exports = {
    getProofStorageDir,
    saveManualTopupProof,
    getManualTopupProofPath,
    getProofContentType,
};
