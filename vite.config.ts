import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "brand/app-icon.webp",
      ],
      manifest: {
        name: "مشروع تنظيم المضخات",
        short_name: "تنظيم المضخات",
        description:
          "دفتر شخصي لإدارة حصص المياه الزراعية — المضخات والديالات والأدوار والحسابات.",
        lang: "ar",
        dir: "rtl",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
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
    }),
  ],
});
