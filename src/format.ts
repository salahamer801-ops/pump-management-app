import type { Currency, EnergyType } from "./domain/types";

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  YER: "ر.ي",
  SAR: "ر.س",
  USD: "$",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  YER: "ريال يمني",
  SAR: "ريال سعودي",
  USD: "دولار أمريكي",
};

export const ENERGY_LABEL: Record<EnergyType, string> = {
  solar: "طاقة شمسية",
  diesel: "ديزل",
  hybrid: "شمسي + ديزل",
};

export function formatMoney(n: number, currency: Currency): string {
  const v = Math.round(n || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString("en-US")} ${CURRENCY_SYMBOL[currency]}`;
}

export function formatNumber(n: number): string {
  return (n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
