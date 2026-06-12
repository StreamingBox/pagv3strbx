const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    saveManualTopupProof,
    getManualTopupProofPath,
    getProofContentType,
} = require("../src/utils/manualTopupProofStorage");

test("manual topup proofs use persistent backend storage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "topup-proofs-"));
    const previousDir = process.env.TOPUP_PROOFS_DIR;
    process.env.TOPUP_PROOFS_DIR = tempDir;

    try {
        const proofFileUrl = saveManualTopupProof({
            requestCode: "REC-TEST/unsafe",
            file: {
                mimetype: "image/jpeg",
                originalname: "receipt.jpg",
                buffer: Buffer.from("proof-content"),
            },
        });
        const storedPath = getManualTopupProofPath(proofFileUrl);

        assert.equal(proofFileUrl, "/topup-proofs/rec-test-unsafe.jpg");
        assert.equal(storedPath, path.join(tempDir, "rec-test-unsafe.jpg"));
        assert.equal(fs.readFileSync(storedPath, "utf8"), "proof-content");
        assert.equal(getProofContentType(storedPath), "image/jpeg");
    } finally {
        if (previousDir == null) delete process.env.TOPUP_PROOFS_DIR;
        else process.env.TOPUP_PROOFS_DIR = previousDir;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
