import { Capacitor, registerPlugin } from "@capacitor/core";

export interface BiometricAvailability {
  available: boolean;
  enrolled: boolean;
  reason?: string;
  code?: number;
}

interface BiometricLockPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  authenticate(): Promise<void>;
}

export const BiometricLock = registerPlugin<BiometricLockPlugin>("BiometricLock");

const LOCK_KEY = "pump-org-biometric-lock-v1";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isBiometricLockEnabled(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(LOCK_KEY, "1");
    else localStorage.removeItem(LOCK_KEY);
  } catch {
    /* لا نعطل التطبيق إذا كان التخزين المحلي غير متاح */
  }
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isNativeApp()) {
    return { available: false, enrolled: false, reason: "NATIVE_APP_REQUIRED" };
  }
  try {
    return await BiometricLock.isAvailable();
  } catch {
    return { available: false, enrolled: false, reason: "PLUGIN_UNAVAILABLE" };
  }
}

export async function authenticateWithBiometric(): Promise<void> {
  if (!isNativeApp()) throw new Error("NATIVE_APP_REQUIRED");
  await BiometricLock.authenticate();
}
