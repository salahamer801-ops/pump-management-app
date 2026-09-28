/**
 * التطبيق المثبَّت (PWA) — بلا متجر تطبيقات:
 *  - تسجيل العامل الخدمي فورًا (يعمل بلا إنترنت للأصول الثابتة).
 *  - إشعار «نسخة جديدة متاحة — أعد التحميل» بدل التحديث الصامت.
 *  - التقاط `beforeinstallprompt` لعرض زر «ثبّت التطبيق» في أندرويد/كروم،
 *    وخطوات «إضافة إلى الشاشة الرئيسية» في آيفون.
 *
 * يُهيَّأ مرة واحدة قبل تركيب React (`initPwa()` في main.tsx) لأن حدث التثبيت
 * يصل مبكرًا؛ ثم تقرأه الواجهة عبر `usePwaState()`.
 */
import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let pendingRefresh = false;
let readyOffline = false;
let started = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((run) => run());

/** يُهيَّأ مرة واحدة عند بدء التطبيق */
export function initPwa(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  /* التحديث التلقائي يبقى مُطفأً: نُبلّغ المستخدم بدل أن نُعيد التحميل فوق عمله */
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      pendingRefresh = true;
      emit();
    },
    onOfflineReady() {
      readyOffline = true;
      emit();
    },
    onRegisteredSW() {
      emit();
    },
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

/** هل يفتح التطبيق الآن كتطبيق مثبَّت (بلا شريط متصفح)؟ */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  const media = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || media;
}

/** آيفون/آيباد — لا يدعم `beforeinstallprompt`، فالإرشاد يدوي */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iosDevice = /iPad|iPhone|iPod/.test(ua);
  const ipadDesktopUa = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return iosDevice || ipadDesktopUa;
}

/** أندرويد (جوال/تابلت) — فيه خيار «تثبيت التطبيق» في قائمة كروم */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaState {
  /** يمكن عرض زر التثبيت الآن (أندرويد/كروم) */
  canInstall: boolean;
  /** التطبيق مثبَّت ويعمل الآن كتطبيق */
  installed: boolean;
  /** آيفون — إرشاد يدوي */
  ios: boolean;
  /** أندرويد — يظهر «تثبيت التطبيق» في قائمة كروم */
  android: boolean;
  /** نسخة جديدة بانتظار إعادة التحميل */
  needRefresh: boolean;
  /** الأصول جاهزة للعمل بلا إنترنت */
  offlineReady: boolean;
  install: () => Promise<InstallOutcome>;
  reload: () => void;
  dismiss: () => void;
}

export function usePwaState(): PwaState {
  const [, force] = useState(0);

  useEffect(() => {
    const run = () => force((n) => n + 1);
    listeners.add(run);
    return () => {
      listeners.delete(run);
    };
  }, []);

  return {
    canInstall: deferredPrompt !== null,
    installed: isStandalone(),
    ios: isIos(),
    android: isAndroid(),
    needRefresh: pendingRefresh,
    offlineReady: readyOffline,
    install: async () => {
      if (!deferredPrompt) return "unavailable";
      const event = deferredPrompt;
      await event.prompt();
      const choice = await event.userChoice;
      deferredPrompt = null;
      emit();
      return choice?.outcome === "accepted" ? "accepted" : "dismissed";
    },
    reload: () => {
      if (applyUpdate) void applyUpdate(true);
      else window.location.reload();
    },
    dismiss: () => {
      pendingRefresh = false;
      emit();
    },
  };
}
