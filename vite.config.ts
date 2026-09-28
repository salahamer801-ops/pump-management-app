import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/*
 * سياسة أمان المحتوى داخل الصفحة نفسها.
 * السبب: المنصة تقدّم الملفات الثابتة كما هي، فملف public/_headers لا يُترجَم إلى
 * ترويسات HTTP فعلية. وسم <meta http-equiv="Content-Security-Policy"> يُحترَم من
 * المتصفح داخل المستند — ويُضاف وقت البناء فقط حتى لا يعطّل خادم التطوير (يستخدم
 * سكربتًا داخليًا لتحديث React اللحظي).
 * ملاحظة: frame-ancestors و X-Frame-Options لا يعملان في وسم meta — يحتاجان ترويسة،
 * ويبقى ملف _headers جاهزًا لأي مستضيف يطبّقه.
 *
 * connect-src: الموقع يتصل بخادمه على نفس الأصل ('self'). وأما تطبيق أندرويد
 * (Capacitor) فيعمل على أصل محلي ويتصل بخادم منشور، فيُضاف عنوان ذلك الخادم
 * وقت البناء فقط إذا كان VITE_API_BASE_URL مضبوطًا — وبلا ضبطه تبقى السياسة كما هي.
 */
function buildCsp(connectSrc: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** أصل الخادم من VITE_API_BASE_URL: بلا شرطة أخيرة وبلا "/api" — وإلا فراغ */
function apiOriginFromEnv(raw: string): string {
  const base = raw.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
  return /^https?:\/\//i.test(base) ? base : "";
}

function contentSecurityMeta(apiOrigin: string): Plugin {
  const csp = buildCsp(apiOrigin ? `'self' ${apiOrigin}` : "'self'");
  return {
    name: "mythex-content-security-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="referrer" content="no-referrer" />`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  /* قيم .env الخاصة بالوضع الحالي (بلا بادئة VITE_ حتى نقرأها هنا أيضًا) */
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = apiOriginFromEnv(String(env.VITE_API_BASE_URL ?? ""));

  return {
    /* الواجهة تصل إلى خدماتها عبر مسار نسبي /api — نفس الأصل في المعاينة والمنشور */
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: false,
        },
      },
    },
    plugins: [
      contentSecurityMeta(apiOrigin),
      react(),
      tailwindcss(),
      VitePWA({
        /*
         * "prompt": لا يُعاد تحميل الصفحة فوق عمل المستخدم. تُسجَّل النسخة الجديدة
         * بالانتظار ويظهر شريط «نسخة جديدة متاحة — أعد التحميل» (UpdateNotice).
         */
        registerType: "prompt",
        includeAssets: [
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/apple-touch-icon.png",
          "brand/app-icon.webp",
          "push-sw.js",
        ],
        manifest: {
          id: "/",
          scope: "/",
          name: "مشروع تنظيم المضخات",
          short_name: "تنظيم المضخات",
          description:
            "دفتر شخصي لإدارة حصص المياه الزراعية — المضخات والديالات والأدوار والحسابات.",
          lang: "ar",
          dir: "rtl",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          start_url: "/",
          categories: ["productivity", "utilities"],
          background_color: "#032a4c",
          theme_color: "#032a4c",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          /* معالج الإشعارات الفورية: يُستورد داخل العامل الخدمي */
          importScripts: ["push-sw.js"],
          /* لا يُخدَم أي نداء API من الكاش: البيانات الرسمية تأتي من الخادم دائمًا */
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
