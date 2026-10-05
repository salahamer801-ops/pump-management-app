package com.pumpmanagement.app;

import android.os.Build;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BiometricLock")
public class BiometricLockPlugin extends Plugin {
    private final Executor executor = Executors.newSingleThreadExecutor();

    private int authenticators() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_STRONG;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int result = manager.canAuthenticate(authenticators());
        JSObject response = new JSObject();
        response.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        response.put("enrolled", result == BiometricManager.BIOMETRIC_SUCCESS);
        response.put("code", result);
        response.put("reason", reason(result));
        call.resolve(response);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("لا يمكن فتح نافذة أمان الجهاز الآن.", "NO_ACTIVITY");
            return;
        }

        activity.runOnUiThread(() -> {
            BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    call.resolve();
                }

                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    call.reject(errString.toString(), errorCode == BiometricPrompt.ERROR_USER_CANCELED ? "USER_CANCELED" : "AUTH_ERROR");
                }

                @Override
                public void onAuthenticationFailed() {
                    // Keep the native prompt open; Android controls the retry/lockout policy.
                }
            };

            BiometricPrompt prompt = new BiometricPrompt(activity, executor, callback);
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("فتح تطبيق تنظيم المضخات")
                    .setSubtitle("استخدم بصمة الهاتف أو رمز أمان الجهاز")
                    .setAllowedAuthenticators(authenticators())
                    .setConfirmationRequired(false)
                    .build();
            prompt.authenticate(promptInfo);
        });
    }

    private String reason(int result) {
        switch (result) {
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "NO_HARDWARE";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "HARDWARE_UNAVAILABLE";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "NOT_ENROLLED";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "SECURITY_UPDATE_REQUIRED";
            default:
                return "UNAVAILABLE";
        }
    }
}
