import { Capacitor, registerPlugin } from "@capacitor/core";

const BiometricAuth = registerPlugin("BiometricAuth");

const BIOMETRIC_USER_KEY = "sb-biometric-user-id";

export function isNativeAndroidApp() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function getStoredBiometricUserId() {
    try {
        return localStorage.getItem(BIOMETRIC_USER_KEY) || "";
    } catch {
        return "";
    }
}

export function isBiometricEnabledForUser(userId) {
    if (!userId) return false;
    return String(getStoredBiometricUserId()) === String(userId);
}

export function enableBiometricForUser(userId) {
    if (!userId) return;
    try {
        localStorage.setItem(BIOMETRIC_USER_KEY, String(userId));
    } catch {
        // ignore storage failures
    }
}

export function clearBiometricPreference() {
    try {
        localStorage.removeItem(BIOMETRIC_USER_KEY);
    } catch {
        // ignore storage failures
    }
}

export async function getBiometricAvailability() {
    if (!isNativeAndroidApp()) {
        return { available: false, status: "not-native" };
    }

    try {
        const result = await BiometricAuth.isAvailable();
        return { available: !!result?.available, status: result?.status ?? "unknown" };
    } catch {
        return { available: false, status: "error" };
    }
}

export async function authenticateWithBiometrics(options = {}) {
    if (!isNativeAndroidApp()) {
        return { ok: false, message: "Biometría no disponible en esta plataforma." };
    }

    try {
        const result = await BiometricAuth.authenticate({
            title: options.title || "Acceso seguro",
            subtitle: options.subtitle || "Verifica tu identidad",
            reason: options.reason || "Usa tu huella para entrar a Streaming Box",
        });

        return { ok: !!result?.authenticated, message: "" };
    } catch (error) {
        return {
            ok: false,
            message: error?.message || "No se pudo validar tu identidad.",
        };
    }
}
