package co.strbx.app;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK |
        BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager biometricManager = BiometricManager.from(getContext());
        int status = biometricManager.canAuthenticate(AUTHENTICATORS);

        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("status", mapStatus(status));
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (getActivity() == null) {
            call.reject("No se encontro la actividad Android.");
            return;
        }

        BiometricManager biometricManager = BiometricManager.from(getActivity());
        int status = biometricManager.canAuthenticate(AUTHENTICATORS);
        if (status != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("La biometria no esta disponible en este dispositivo.", mapStatus(status));
            return;
        }

        saveCall(call);
        String callbackId = call.getCallbackId();

        Executor executor = ContextCompat.getMainExecutor(getActivity());
        BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                PluginCall savedCall = getSavedCall(callbackId);
                if (savedCall == null) return;

                JSObject payload = new JSObject();
                payload.put("authenticated", true);
                savedCall.resolve(payload);
                releaseCall(savedCall);
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                PluginCall savedCall = getSavedCall(callbackId);
                if (savedCall == null) return;

                savedCall.reject(errString.toString(), String.valueOf(errorCode));
                releaseCall(savedCall);
            }

            @Override
            public void onAuthenticationFailed() {
                PluginCall savedCall = getSavedCall(callbackId);
                if (savedCall == null) return;

                JSObject payload = new JSObject();
                payload.put("authenticated", false);
                payload.put("message", "La verificacion biometrica no coincidio.");
                savedCall.resolve(payload);
                releaseCall(savedCall);
            }
        };

        BiometricPrompt biometricPrompt = new BiometricPrompt(getActivity(), executor, callback);
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(call.getString("title", "Acceso seguro"))
            .setSubtitle(call.getString("subtitle", "Verifica tu identidad"))
            .setDescription(call.getString("reason", "Usa tu huella para continuar"))
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build();

        biometricPrompt.authenticate(promptInfo);
    }

    private String mapStatus(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "available";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "no-hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "hardware-unavailable";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "not-enrolled";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "security-update-required";
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
                return "unsupported";
            case BiometricManager.BIOMETRIC_STATUS_UNKNOWN:
                return "unknown";
            default:
                return "unavailable";
        }
    }
}
