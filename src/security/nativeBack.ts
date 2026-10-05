import { useEffect } from "react";

export const NATIVE_BACK_EVENT = "nativebackbutton";

export function useNativeBack(onBack: () => boolean, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: Event) => {
      if (event.defaultPrevented) return;
      if (onBack()) event.preventDefault();
    };
    window.addEventListener(NATIVE_BACK_EVENT, handler);
    return () => window.removeEventListener(NATIVE_BACK_EVENT, handler);
  }, [enabled, onBack]);
}
