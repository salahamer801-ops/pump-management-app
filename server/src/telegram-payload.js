/**
 * تيليجرام — دوال خالصة (بلا شبكة وبلا قاعدة بيانات) لتُختبر آليًا.
 * كل ما يخصّ قراءة نصوص تيليجرام وبناء الرسائل العربية هنا.
 */
import { randomInt } from "node:crypto";

/** طول رمز الربط (يُكتب كحروف كبيرة وأرقام بلا لبس) */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;

/** توليد رمز ربط لا يُخمَّن (crypto) */
export function newLinkCode() {
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    out += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return out;
}

/** هل يُطلب الرمز من نص /start؟ يعيد الرمز أو null */
export function startPayload(text) {
  const value = String(text ?? "").trim();
  const match = /^\/start(?:@[\w_]+)?(?:\s+([A-Za-z0-9_-]{4,32}))?\s*$/.exec(value);
  if (!match) return null;
  return match[1] ? match[1].toUpperCase() : "";
}

/** صيغة رمز الربط صحيحة؟ */
export function isValidLinkCode(code) {
  const value = String(code ?? "").trim().toUpperCase();
  if (value.length !== LINK_CODE_LENGTH) return false;
  return [...value].every((ch) => LINK_CODE_ALPHABET.includes(ch));
}

/**
 * رقم الهاتف من «مشاركة جهة اتصال» في تيليجرام — بشرط أن يكون المُرسِل نفسه هو صاحبه.
 * هذا الشرط هو ما يجعل التحقّق حقيقيًا: لا يمكن مشاركة رقم شخص آخر.
 */
export function contactPhone(message) {
  const contact = message?.contact;
  if (!contact) return null;
  const fromId = message?.from?.id;
  if (contact.user_id === undefined || contact.user_id === null) return null;
  if (String(contact.user_id) !== String(fromId)) return null;
  const raw = String(contact.phone_number ?? "").trim();
  if (!raw) return null;
  return raw.startsWith("+") ? raw : `+${raw}`;
}

/** مقارنة رقمین بمقارنة آخر 9 أرقام (تتجاهل مفتاح الدولة وصفره) */
export function samePhone(a, b) {
  const digits = (v) => String(v ?? "").replace(/\D/g, "");
  const da = digits(a);
  const db = digits(b);
  if (da.length < 7 || db.length < 7) return false;
  return da.slice(-9) === db.slice(-9);
}

/** رسالة الرمز (RTL) */
export function otpMessage(code, purpose = "reset") {
  const title = purpose === "reset" ? "استعادة كلمة المرور" : "تأكيد رقم الجوال";
  return [
    `🔐 <b>${title}</b>`,
    "",
    `رمزك: <b>${String(code)}</b>`,
    "",
    "الرمز صالح 5 دقائق ويُستخدم مرة واحدة.",
    "لا تشارك هذا الرمز مع أي شخص — لا نطلبه منك في أي مكان آخر.",
  ].join("\n");
}

export const WELCOME_MESSAGE = [
  "أهلًا بك في بوت التحقّق ✅",
  "",
  "للتحقّق من رقمك اضغط الزر أسفل الرسالة «📱 شارك رقمي».",
  "سيتأكّد تيليجرام نفسه من الرقم، ثم يُوسم حسابك «رقم مُتحقَّق».",
].join("\n");

export const ASK_PHONE_MESSAGE = [
  "اضغط الزر أسفل الرسالة <b>«📱 شارك رقمي»</b> لإتمام التحقّق.",
  "تيليجرام وحده يتحقّق من الرقم — لا نطلب الرقم كتابةً.",
].join("\n");

export const HELP_MESSAGE = [
  "هذا بوت التحقّق الخاص بتطبيق إدارة المضخات.",
  "",
  "• للتحقّق من رقمك: افتح التطبيق → الإعدادات → «تحقّق من رقمي» ثم اضغط الرابط.",
  "• إن وصلك رمز استعادة كلمة المرور: اكتبه في التطبيق مباشرة.",
].join("\n");

/** زر مشاركة الرقم — لا يُطلب الرقم كتابةً أبدًا */
export function sharePhoneKeyboard() {
  return {
    keyboard: [[{ text: "📱 شارك رقمي", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function removeKeyboard() {
  return { remove_keyboard: true };
}

/** رسالة نتيجة الربط */
export function linkedMessage({ matched, accountName, maskedPhone }) {
  if (matched) {
    return [
      "✅ <b>تم التحقّق من رقمك</b>",
      `الحساب: ${accountName}`,
      `الرقم: ${maskedPhone}`,
      "",
      "يمكنك الآن استعادة كلمة المرور عبر رمز يصل هنا في تيليجرام.",
    ].join("\n");
  }
  return [
    "⚠️ <b>تم ربط تيليجرام، لكن الرقم مختلف</b>",
    "الرقم الذي شاركته لا يطابق الرقم المسجّل في حسابك، لذلك لم يُوسم الحساب «مُتحقَّق».",
    "",
    "إن كان لديك أكثر من رقم، اطلب من مسؤول المضخة تحديث رقمك ثم أعد المحاولة.",
  ].join("\n");
}

export const LINKED_ALREADY = "تم التحقّق من حسابك مسبقًا ✅ — لا حاجة لتكرار العملية.";

export const BAD_LINK_CODE = [
  "هذا الرابط غير صالح أو انتهت صلاحيته ⚠️",
  "افتح التطبيق → الإعدادات → «تحقّق من رقمي» ثم اضغط الرابط الجديد.",
].join("\n");

export const NO_ACCOUNT_CHAT = [
  "لم أتعرّف على حسابك 🔎",
  "افتح التطبيق → الإعدادات → «تحقّق من رقمي» ثم اضغط الرابط الذي يظهر لك.",
].join("\n");

export const CHAT_TAKEN = [
  "هذه المحادثة مربوطة بحساب آخر ⚠️",
  "استخدم محادثة تيليجرام أخرى، أو اطلب من مسؤول النظام إلغاء الربط السابق.",
].join("\n");

/** نص إشعار أمني بعد تغيير كلمة المرور */
export function passwordChangedMessage(accountName) {
  return [
    "🔒 <b>تم تغيير كلمة مرور حسابك</b>",
    `الحساب: ${accountName}`,
    "",
    "إن لم تكن أنت من فعل ذلك، تواصل فورًا مع مسؤول النظام.",
  ].join("\n");
}
