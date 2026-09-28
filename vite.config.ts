import { defineConfig, type Plugin } from "vite";
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
 */
const CSP_META = [
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
].join("; ");

function contentSecurityMeta(): Plugin {
  return {
    name: "mythex-content-security-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />
    <meta name="referrer" content="no-referrer" />`
      );
    },
  };
}

export default defineConfig({
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
    contentSecurityMeta(),
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
});
