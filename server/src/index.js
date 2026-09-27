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
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
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

/* إعدادات عامة لشاشة الدخول (الإعلان وفتح التسجيل) — بلا بيانات شخصية */
app.get(
  "/api/settings/public",
  wrap(async (_req, res) => res.json(await getSettings()))
);

app.use("/api/auth", authRouter);
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
}

start();
