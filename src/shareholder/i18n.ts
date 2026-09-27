import type { Language } from "./types";

export function tr(lang: Language, ar: string, en: string): string {
  return lang === "en" ? en : ar;
}
