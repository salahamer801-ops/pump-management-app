/**
 * خادم واجهة البرمجة (API) لنظام تنظيم المضخات.
 * المصادقة والتصريح هنا — لا في الواجهة.
 */
import express from "express";
import { initSchema, q } from "./db.js";
import { HttpError, wrap } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { auditRouter, pumpsRouter } from "./routes/pumps.js";
import { adminRouter } from "./routes/admin.js";
import { operatingRouter } from "./routes/operating.js";
import { getSettings } from "./settings.js";

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


app.get(
  "/api/health/db",
  wrap(async (_req, res) => {
    const r = await q("SELECT now() AS now");
    res.json({ ok: true, db: r.rows[0].now });
  })
);

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
