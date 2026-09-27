/**
 * الإشعارات الفورية على الجوال (Web Push) — إخطار المساهم لحظة حفظ المسؤول لتعديل.
 *
 * ملاحظات صريحة:
 *  - يحتاج إذن المستخدم مرة واحدة.
 *  - يعمل في التطبيق المثبَّت/المتصفح الذي يدعم Web Push؛ على آيفون يلزم iOS 16.4+
 *    وأن يكون التطبيق مضافًا إلى الشاشة الرئيسية.
 *  - الإشعار يصل عبر خدمة إشعارات المتصفح، والتطبيق لا يجمع أي بيانات إضافية.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../auth/api";

export interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
  message: string;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  refresh: () => void;
}

export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    typeof Notification.requestPermission === "function"
  );
}

/** مفتاح VAPID (base64url) → بايتات يفهمها المتصفح */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function activeSubscription(): Promise<PushSubscription | null> {
  const reg = await swRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export function usePushState(pumpId: string | null): PushState {
  const supported = pushSupported();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void activeSubscription().then((sub) => {
      if (alive) setSubscribed(Boolean(sub));
    });
    return () => {
      alive = false;
    };
  }, [pumpId, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const enable = useCallback(async () => {
    if (!pumpId) {
      setMessage("اربط حسابك بمضخة أولًا — الإشعارات تخصّ مضخة محددة.");
      return;
    }
    if (!supported) {
      setMessage("هذا المتصفح لا يدعم الإشعارات الفورية — استخدم كروم على أندرويد أو سفاري المحدَّث.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setMessage("لم يُسمح بالإشعارات — يمكنك تفعيلها من إعدادات الموقع في المتصفح.");
        return;
      }

      const reg = await swRegistration();
      if (!reg) {
        setMessage("العامل الخدمي غير جاهز بعد — افتح التطبيق ثم حاول مرة أخرى.");
        return;
      }

      const key = await api<{ publicKey: string }>(`/api/pumps/${pumpId}/push/key`);
      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key.publicKey).buffer as ArrayBuffer,
        }));

      await api(`/api/pumps/${pumpId}/push/subscribe`, {
        method: "POST",
        body: { subscription: subscription.toJSON() },
      });
      setSubscribed(true);
      setMessage("تم — سيصلك إشعار عند أي تعديل من المسؤول.");
    } catch (err) {
      setMessage(
        err instanceof Error && err.message
          ? `تعذّر تفعيل الإشعارات: ${err.message}`
          : "تعذّر تفعيل الإشعارات — حاول مرة أخرى."
      );
    } finally {
      setBusy(false);
    }
  }, [pumpId, supported]);

  const disable = useCallback(async () => {
    if (!pumpId) return;
    setBusy(true);
    setMessage("");
    try {
      const sub = await activeSubscription();
      if (sub) {
        await api(`/api/pumps/${pumpId}/push/unsubscribe`, {
          method: "POST",
          body: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe().catch(() => undefined);
      } else {
        await api(`/api/pumps/${pumpId}/push/unsubscribe`, { method: "POST", body: {} }).catch(() => undefined);
      }
      setSubscribed(false);
      setMessage("أُوقفت الإشعارات على هذا الجهاز.");
    } catch {
      setMessage("تعذّر إيقاف الإشعارات — حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }, [pumpId]);

  return { supported, permission, subscribed, busy, message, enable, disable, refresh };
}
