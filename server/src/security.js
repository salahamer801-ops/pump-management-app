/**
 * الأمن: تشفير كلمات المرور (scrypt)، رموز الجلسات، التحقق من المدخلات، حدود المحاولات.
 * لا تُخزَّن كلمة المرور ولا تُرسل ولا يُخزَّن رمز الجلسة كنص صريح.
 */
import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { q } from "./db.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function newResetCode() {
  return String(randomInt(100000, 1000000));
}

/* ------------------------- التحقق من المدخلات ------------------------- */

export function normalizePhone(input) {
  const raw = String(input ?? "").trim();
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return digits.replace(/\D/g, "");
}

export function isValidPhone(phone) {
  return /^\d{7,15}$/.test(phone);
}

export function maskPhone(phone) {
  const p = String(phone ?? "");
  if (p.length <= 5) return "*****";
  return `${p.slice(0, 3)}${"*".repeat(Math.max(3, p.length - 6))}${p.slice(-3)}`;
}

/** سياسة كلمة المرور: 8 خانات على الأقل، حرف ورقم */
export function passwordProblem(password) {
  const value = String(password ?? "");
  if (value.length < 8) return "كلمة المرور يجب أن تكون 8 خانات على الأقل.";
  if (value.length > 128) return "كلمة المرور طويلة جدًا.";
  if (!/[A-Za-z\u0600-\u06FF]/.test(value)) return "كلمة المرور يجب أن تحتوي حرفًا واحدًا على الأقل.";
  if (!/\d/.test(value)) return "كلمة المرور يجب أن تحتوي رقمًا واحدًا على الأقل.";
  return null;
}

export function accountTypeProblem(type) {
  return type === "manager" || type === "user" ? null : "نوع الحساب غير صالح.";
}

export function nameProblem(name) {
  const value = String(name ?? "").trim();
  if (value.length < 2) return "الاسم قصير جدًا.";
  if (value.length > 80) return "الاسم طويل جدًا.";
  return null;
}

/* --------------------------- حدود المحاولات --------------------------- */

const buckets = new Map();

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

/* ------------------------------ الجلسات ------------------------------ */

const SESSION_DAYS = 30;

export async function createSession(userId, source = "web") {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await q(
    `INSERT INTO sessions (user_id, token_hash, expires_at, source) VALUES ($1, $2, $3, $4)`,
    [userId, sha256(token), expires.toISOString(), source]
  );
  return token;
}

export async function revokeSession(token) {
  if (!token) return;
  await q(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    sha256(token),
  ]);
}

export async function revokeAllSessions(userId) {
  await q(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export function bearerToken(req) {
  const header = String(req.headers.authorization ?? "");
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    accountType: row.account_type,
    status: row.status,
    /* مسؤول النظام: صلاحية إدارة اللوحة — تُقرأ من القاعدة لا من الواجهة */
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "";
}
