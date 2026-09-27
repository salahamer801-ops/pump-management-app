# =============================================================================
#  تنظيم المضخات — خدمة واحدة تخدم الواجهة (React/Vite) وواجهة البرمجة (Express)
#
#  GET /            → تطبيق React المبنى (dist/index.html)
#  GET /login       → تطبيق React نفسه (SPA fallback) — لا 404
#  GET /api/...     → Express API
#  PostgreSQL       → عبر process.env.DATABASE_URL
#
#  يعمل على Mythex وعلى Railway بلا أي فرق: منفذ واحد process.env.PORT.
# =============================================================================

# -----------------------------------------------------------------------------
# المرحلة ١: بناء واجهة React/Vite  →  /web/dist
# -----------------------------------------------------------------------------
FROM node:20-alpine AS web-builder
WORKDIR /web

# ملفات الاعتماديات أولًا حتى تُخزَّن الطبقة ولا تُعاد إلا عند تغيّرها
COPY package.json package-lock.json ./
# npm ci مع lockfile، وإن كان غير متزامن نرجع إلى npm install (بلا تغيير نسخ)
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# بقية ملفات الواجهة المطلوبة للبناء فقط
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY brand ./brand

RUN npm run build

# -----------------------------------------------------------------------------
# المرحلة ٢: صورة التشغيل — Express + الواجهة المبنية (بلا أدوات البناء)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# اعتماديات الخادم للإنتاج فقط (express · pg · web-push)
COPY server/package.json server/package-lock.json ./
RUN (npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund) \
    && npm cache clean --force

# كود الخادم → /app/src  (فيصبح dist بجانبه في /app/dist)
COPY server/src ./src

# الواجهة المبنية من المرحلة الأولى → /app/dist
COPY --from=web-builder /web/dist ./dist

# المنفذ: Railway وMythex يمرّران PORT في متغيّرات البيئة
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
