/**
 * شارات الحالة المشتركة بين الشاشات — مكوّن واحد بدل تعريف داخل كل شاشة.
 */
import { Pill } from "./ui";

const DAY_STATUS: Record<string, { tone: "green" | "amber" | "blue" | "gray" | "red"; label: string }> = {
  scheduled: { tone: "gray", label: "مجدول" },
  draft: { tone: "amber", label: "مسودة" },
  in_progress: { tone: "blue", label: "جارٍ التنفيذ" },
  completed: { tone: "green", label: "مكتمل" },
  closed: { tone: "green", label: "مغلق" },
  revised: { tone: "amber", label: "معدّل" },
};

/** حالة اليوم الفعلي: مجدول · مسودة · جارٍ التنفيذ · مكتمل · مغلق · معدّل */
export function DayStatusPill({ status }: { status: string }) {
  const item = DAY_STATUS[status] ?? { tone: "gray" as const, label: status };
  return <Pill tone={item.tone}>{item.label}</Pill>;
}

/** حالة الدفع/التسديد: مدفوع · جزئي · غير مدفوع */
export function PaidPill({ paid, partial = false }: { paid: boolean; partial?: boolean }) {
  if (paid) return <Pill tone="green">مسدد</Pill>;
  if (partial) return <Pill tone="amber">جزئي</Pill>;
  return <Pill tone="red">غير مسدد</Pill>;
}
