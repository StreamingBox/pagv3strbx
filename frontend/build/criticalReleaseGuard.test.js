import { describe, expect, it } from "vitest";
import { assertCriticalReleaseFeatures } from "./criticalReleaseGuard.js";

const requiredChunks = {
    "AdminAccounts-abc.js": {
        type: "chunk",
        modules: { "C:/app/src/pages/AdminAccounts.jsx": {} },
        code: "Nombre del canal de YouTube * YouTube Music y YouTube 3 meses requieren la columna",
    },
    "Codes-abc.js": {
        type: "chunk",
        modules: { "C:/app/src/pages/Codes.jsx": {} },
        code: "¿Solicitar el código? El código es válido por 30 segundos. Como administrador, puedes volver a solicitar el código cuando lo necesites.",
    },
    "AdminProviders-abc.js": {
        type: "chunk",
        modules: { "C:/app/src/pages/AdminProviders.jsx": {} },
        code: "Top 5 proveedores Recordatorio de renovación",
    },
};

describe("critical frontend release guard", () => {
    it("accepts a bundle containing the critical YouTube, codes, and providers features", () => {
        expect(() => assertCriticalReleaseFeatures(requiredChunks)).not.toThrow();
    });

    it("blocks publication when a critical component or feature is missing", () => {
        const incompleteBundle = {
            ...requiredChunks,
            "Codes-abc.js": {
                ...requiredChunks["Codes-abc.js"],
                code: "¿Solicitar el código?",
            },
        };

        expect(() => assertCriticalReleaseFeatures(incompleteBundle)).toThrow(/30 segundos/);
    });
});
