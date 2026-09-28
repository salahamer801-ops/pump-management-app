/**
 * خادم واجهة البرمجة (API) لنظام تنظيم المضخات.
 * المصادقة والتصريح هنا — لا في الواجهة.
 *
 * الخادم نفسه يخدم تطبيق React المبنى (dist) من نفس المنفذ ومن نفس الرابط:
 *   GET /            → dist/index.html
 *   GET /login ...   → dist/index.html  (يتولّى التطبيق عرض الصفحة)
 *   GET /api/...     → واجهة البرمجة
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { initSchema, q } from "./db.js";
import { HttpError, wrap } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { auditRouter, pumpsRouter } from "./routes/pumps.js";
import { adminRouter } from "./routes/admin.js";
import { operatingRouter } from "./routes/operating.js";
import { getSettings } from "./settings.js";
import { ensureWebhook, isConfigured as isTelegramConfigured } from "./telegram.js";
import { telegramRouter } from "./routes/telegram.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * مجلد الواجهة المبنية (dist) — بلا اعتماد على Current Working Directory:
 *  - صورة Docker:  src بجانب dist → /app/src و /app/dist
 *  - المشروع:      dist في جذر المستودع (والخادم داخل server/src)
 */
function findWebDir() {
  const candidates = [
    path.resolve(HERE, "../dist"),
    path.resolve(HERE, "../../dist"),
    path.resolve(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch {
      /* جرّب المسار التالي */
    }
  }
  return null;
}

const WEB_DIR = findWebDir();

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.disable("x-powered-by");
/* وسيط واحد موثوق (منصة النشر أو الاستضافة) — فيُحسب عنوان الزائر الحقيقي في req.ip */
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));

/*
 * ترويسات الحماية لكل رد، و«سياسة أمان المحتوى» على صفحات HTML فقط:
 *  - السكربتات من الموقع نفسه فقط (لا سكربت مضمّن ولا مورد خارجي).
 *  - الأنماط والخطوط: الموقع + خطوط Google (الخط المستخدم في الواجهة).
 *  - الطلبات (fetch/API/العامل الخدمي) من الموقع نفسه فقط.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (req.secure || String(req.headers["x-forwarded-proto"] ?? "").includes("https")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (req.method === "GET" || req.method === "HEAD") res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Cache-Control", "no-store");
  next();
});

/*
 * CORS — الحد الأدنى فقط:
 *  - الموقع (المعاينة أو المنشور) يعمل على نفس أصل الخادم، فلا يحتاج أي ترويسة.
 *  - تطبيق أندرويد (Capacitor/WebView) يعمل على أصل محلي، فيحتاج السماح له وحده
 *    حتى تصله ردود الـAPI من خادم منشور. لا نفتح "*" ولا أي أصل آخر.
 */
const APP_LOCAL_ORIGINS = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);

app.use((req, res, next) => {
  const origin = String(req.headers.origin ?? "");
  if (!APP_LOCAL_ORIGINS.has(origin)) return next();
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
  /* طلب تمهيدي (preflight) ينتهي هنا بلا لمس أي مسار */
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

app.get(["/health", "/api/health"], (_req, res) => res.json({ ok: true, service: "pump-api" }));

/* فحص قاعدة البيانات — عام مثل فحص الصحة (يُستخدم في فحوص الاستضافة) */
app.get(
  "/api/health/db",
  wrap(async (_req, res) => {
    const r = await q("SELECT now() AS now");
    res.json({ ok: true, db: r.rows[0].now });
  })
);

/* إعدادات عامة لشاشة الدخول (الإعلان وفتح التسجيل) — بلا بيانات شخصية ولا تفاصيل داخلية */
app.get(
  "/api/settings/public",
  wrap(async (_req, res) => {
    const s = await getSettings();
    /* ما تحتاجه شاشة الدخول فقط: الإعلان وحالة التسجيل */
    res.json({ announcement: s.announcement, registration: s.registration });
  })
);

app.use("/api/auth", authRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/pumps", pumpsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/admin", adminRouter);
/* بيانات التشغيل الرسمية (المرحلة الثانية) — نفس الخادم ونفس قاعدة البيانات */
app.use("/api", operatingRouter);

/* ---------------------------------------------------------------------------
 * الواجهة المبنية (React) — تُخدَم من نفس الخادم ونفس الرابط.
 * ترتيب مهم: مسارات /api أعلاه تبقى كما هي، ثم ملفات الواجهة، ثم SPA fallback.
 * ------------------------------------------------------------------------- */

if (WEB_DIR) {
  app.use(
    express.static(WEB_DIR, {
      index: false, // الصفحة الرئيسية يخدمها الـ fallback أدناه بترويسة كاش صحيحة
      etag: true,
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath);
        /* لا كاش للصفحة والعامل الخدمي وبيان التطبيق: يظهر أي تحديث فورًا */
        if (
          name === "index.html" ||
          name === "sw.js" ||
          name === "push-sw.js" ||
          name.endsWith("manifest.webmanifest")
        ) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
          return;
        }
        /* الأصول ذات البصمة في الاسم تُخزَّن طويلًا (assets/index-<hash>.js) */
        if (/[-.][A-Za-z0-9_]{8,}\.(?:js|css|woff2?)$/.test(name)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    })
  );

  /* أي مسار واجهة (login · dashboard · pump/... · settings) يعيد index.html
     ليتولّى React عرض الصفحة — أما /api فتبقى للخادم ولا تُخدَم كصفحة. */
  app.get("*", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.join(WEB_DIR, "index.html"), (err) => (err ? next(err) : undefined));
  });

  console.log(`[web] يخدم الواجهة المبنية من ${WEB_DIR}`);
} else {
  console.log("[web] لا توجد نسخة مبنية (dist) — الخادم يخدم واجهة البرمجة فقط");
}

app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "المسار غير موجود." } }));

app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "server_error";
  const message =
    err instanceof HttpError ? err.message : "حدث خطأ غير متوقع في الخادم — حاول مرة أخرى.";
  if (status >= 500) console.error("[api]", err);
  res.status(status).json({ error: { code, message } });
});

async function start() {
  app.listen(PORT, "0.0.0.0", () => console.log(`[api] يعمل على المنفذ ${PORT}`));
  try {
    await initSchema();
    console.log("[api] المخطّط جاهز");
  } catch (err) {
    console.error("[api] تعذّر تهيئة المخطّط:", err.message);
  }
  /* تثبيت webhook تيليجرام مرة واحدة عند الإقلاع — بلا تعطيل الإقلاع إن فشل */
  try {
    if (isTelegramConfigured()) {
      const hook = await ensureWebhook();
      console.log(hook.ok ? `[telegram] webhook مثبّت على ${hook.url}` : `[telegram] تعذّر تثبيت webhook: ${hook.error}`);
    } else {
      console.log("[telegram] بلا توكن — التحقّق يعمل بالطريقة البديلة (رمز على الشاشة)");
    }
  } catch (err) {
    console.error("[telegram] خطأ غير متوقع عند الإقلاع:", err.message);
  }
}

start();
