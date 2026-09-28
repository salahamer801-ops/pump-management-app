/**
 * رموز التحقّق — دوال خالصة (بلا قاعدة بيانات وبلا شبكة) لتُختبر آليًا.
 */
import { randomBytes, randomInt } from "node:crypto";

/** صلاحية الرمز بالدقائق */
export const OTP_MINUTES = 5;
/** صلاحية تذكرة التعيين بعد نجاح التحقّق (تُستهلك مرة واحدة) */
export const TICKET_MINUTES = 10;
/** أقصى عدد محاولات للرمز الواحد */
export const MAX_ATTEMPTS = 5;
/** أقل مدة بين رمز ورمز لنفس الحساب */
export const RESEND_COOLDOWN_SECONDS = 60;

export function newOtpCode() {
  return String(randomInt(100000, 1000000));
}

export function newTicket() {
  return randomBytes(32).toString("base64url");
}

/** الرمز ستة أرقام فقط */
export function codeShapeProblem(code) {
  return /^\d{6}$/.test(String(code ?? "").trim()) ? null : "الرمز ستة أرقام.";
}

/** الثواني المتبقية قبل السماح بإرسال رمز جديد (0 = يمكن الآن) */
export function cooldownLeft(lastSentAt, now = Date.now()) {
  if (!lastSentAt) return 0;
  const since = (now - new Date(lastSentAt).getTime()) / 1000;
  if (!Number.isFinite(since) || since >= RESEND_COOLDOWN_SECONDS) return 0;
  return Math.max(1, Math.ceil(RESEND_COOLDOWN_SECONDS - since));
}

/** هل بلغنا السقف اليومي؟ (0 = بلا سقف) */
export function dailyLimitHit(count, limit) {
  const max = Number(limit);
  if (!Number.isFinite(max) || max <= 0) return false;
  return Number(count) >= max;
}

/** رسالة الوضع البديل: الرمز على الشاشة (تُستخدم فقط حين لا يوجد ربط تيليجرام) */
export const SCREEN_WARNING =
  "لم يكن هذا الحساب مربوطًا بتيليجرام، لذلك ظهر الرمز هنا. اربط تيليجرام من الإعدادات ليصل الرمز على جوالك فقط.";

/** تلميح شاشة التحقّق عبر تيليجرام */
export const TELEGRAM_HINT = "أرسلنا رمزًا إلى محادثتك في تيليجرام — اكتبه هنا.";
