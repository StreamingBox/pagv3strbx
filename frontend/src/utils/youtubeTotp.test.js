// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { generateTotpCode } from "./youtubeTotp.js";

afterEach(() => vi.unstubAllGlobals());

describe("YouTube Authenticator code generator", () => {
    it("matches the RFC 6238 SHA-1 vector and reports the 30-second expiry", async () => {
        vi.stubGlobal("crypto", webcrypto);

        const result = await generateTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000);

        expect(result).toEqual({ code: "287082", expiresAt: 60_000 });
    });

    it("accepts an otpauth URI and ignores Base32 spacing", async () => {
        vi.stubGlobal("crypto", webcrypto);
        const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

        const fromSecret = await generateTotpCode("GEZD GNBV-GY3TQOJQGEZDGNBVGY3TQOJQ====", 59_000);
        const fromUri = await generateTotpCode(`otpauth://totp/Google:test?secret=${secret}&issuer=Google`, 59_000);

        expect(fromSecret.code).toBe(fromUri.code);
    });
});
