# دليل بناء تطبيق أندرويد (APK) لمشروع تنظيم المضخات

> هذا الدليل للتشغيل **على حاسوب** فيه Android Studio. منصة Mythex (حيث تُبنى الواجهة الآن) تبني وتنشر تطبيقات الويب فقط، ولا تُنشئ مشروع أندرويد ولا ملف APK — لذلك الخطوات هنا تُنفَّذ على حاسوبك أو حاسوب أي مطوّر أندرويد.

المشروع: `pump-management-app` — الواجهة React + Vite، والخادم Express + PostgreSQL على Railway:
`https://pump-management-app-production.up.railway.app`

---

## ١) ما تحتاجه على الحاسوب

| المتطلب | الحد الأدنى | ملاحظات |
|---|---|---|
| Node.js | **22 أو أحدث** (مطلوب لـ Capacitor 8) | `node --version` يجب أن يطبع v22 أو أعلى |
| Android Studio | **2025.2.1 أو أحدث** | يأتي معه **JDK** و**Gradle** تلقائيًا — **لا حاجة لتثبيت Java 17 يدويًا** |
| Android SDK | منصة API 24 أو أحدث (الأحدث API 36) | من `Tools → SDK Manager → SDK Platforms` |
| جهاز أندرويد أو محاكي | Android 7 (API 24) أو أحدث | يعمل على ~99% من الأجهزة |

نسخة Capacitor المستخدمة في هذا الدليل: **8.5.2** (نفس النسخة للحزم الثلاث — لا تخلط النسخ).

---

## ٢) تجهيز المشروع على الحاسوب

```bash
git clone https://github.com/salahamer801-ops/pump-management-app.git
cd pump-management-app
npm ci
```

تأكد أن المشروع سليم قبل أي شيء أندرويد:

```bash
npm run build          # يجب أن ينجح، ويُنشئ مجلد dist
npx tsc --noEmit       # اختياري: فحص الأنواع
```

---

## ٣) تثبيت Capacitor (نفس النسخة للحزم الثلاث)

```bash
npm i -D @capacitor/cli@8.5.2
npm i @capacitor/core@8.5.2 @capacitor/android@8.5.2
```

---

## ٤) إنشاء ملف الإعداد `capacitor.config.ts` في جذر المشروع

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appName: "تنظيم المضخات",
  appId: "com.pumpmanagement.app",
  webDir: "dist",
  android: {
    /* يمنع تحميل محتوى غير مشفّر داخل التطبيق */
    allowMixedContent: false,
  },
  server: {
    /* أصل التطبيق يصبح https://localhost — وهو مسموح في CORS على الخادم
       (الخادم يسمح لأصول WebView المحلية فقط: https://localhost و http://localhost
        و capacitor://localhost) */
    androidScheme: "https",
  },
};

export default config;
```

⚠️ **لا تضع أي سرّ** في هذا الملف (لا `DATABASE_URL` ولا توكن تيليجرام). كل الأسرار تبقى على الخادم، وتطبيق الجوال يتصل به عبر الـAPI فقط.

**العربية وRTL:** الواجهة تضبط `dir="rtl"` و`lang="ar"` على مستوى المستند، وتأكد أن مقطع التطبيق في
`android/app/src/main/AndroidManifest.xml` يحتوي:

```xml
<application android:supportsRtl="true" ... >
```

(قالب Capacitor يضعه افتراضيًا — تحقّق فقط.) اسم التطبيق على الجهاز يأتي من `appName` أعلاه.

---

## ٥) إضافة منصّة أندرويد (مرة واحدة)

```bash
npx cap add android
```

ينشئ هذا الأمر مجلد `android/` (مشروع Android Studio كامل). لا تعدّل ملفاته يدويًا إلا عند الضرورة.

---

## ٦) بناء الواجهة والمزامنة (تُكرَّر بعد كل تعديل في الواجهة)

```bash
npm run build -- --mode android
npx cap sync android
```

- **لماذا `--mode android`؟** لأن ملف `.env.android` في المشروع يحمل عنوان خادم Railway:
  `VITE_API_BASE_URL=https://pump-management-app-production.up.railway.app`
  فيصبح كل نداء داخل التطبيق: `https://pump-management-app-production.up.railway.app/api/...`
- `npm run build` وحده (بلا `--mode android`) **لا يقرأ** هذا الملف — لذلك يبقى الموقع العادي
  يستخدم `/api` النسبي كما هو تمامًا، ولا يتأثر بأي شيء من هذه الخطوات.
- بديل بلا ملف env: `VITE_API_BASE_URL=https://pump-management-app-production.up.railway.app npm run build && npx cap sync android`

---

## ٧) التحقّق قبل التشغيل (مهم جدًا)

**أ) ملفات الواجهة داخل التطبيق:**

```bash
ls android/app/src/main/assets/public/
# يجب أن تحتوي: index.html و assets/ و sw.js وأيقونات التطبيق
```

**ب) أن النداءات تذهب إلى Railway وليس إلى الجهاز نفسه:**

```bash
grep -r "railway.app" android/app/src/main/assets/public/assets/*.js | head -3
grep -rc "railway.app/api/api" android/app/src/main/assets/public/assets/*.js   # يجب أن يكون 0
```

المتوقع: يظهر الرابط مرة واحدة (كأساس)، و**صفر** حالات `/api/api`.
إن لم يظهر الرابط إطلاقًا ⇒ البناء لم يُنفَّذ بوضع `android`، أعد الخطوة ٦.

---

## ٨) التشغيل والتجربة

```bash
npx cap open android      # يفتح Android Studio
# أو مباشرة على جهاز موصول:
npx cap run android
```

في Android Studio: اختر جهازك ثم اضغط ▶ Run. أول تشغيل قد يأخذ دقائق (تنزيل تبعيات Gradle).

اختبر: تسجيل الدخول من داخل التطبيق، ثم ظهور بياناتك (الديالات، اليوم الفعلي، الحسابات) — المزامنة تصل إلى Railway مثل الموقع تمامًا.

---

## ٩) إنشاء ملف APK وتوقيعه

من Android Studio: `Build → Generate Signed App Bundle / APK → APK`:

1. `Create new…` لإنشاء ملف توقيع (Keystore) واحفظه في مكان آمن مع كلمتَي المرور.
   **إن فُقد المفتاح لا يمكنك تحديث تطبيقك لاحقًا في المتجر أو على الأجهزة.**
2. اختر `release` ثم `Create` — ينتج ملف APK في:
   `android/app/build/outputs/apk/release/`
3. بعد كل تعديل: ارفع `versionCode` في `android/app/build.gradle` قبل إصدار نسخة جديدة.

---

## ١٠) ما يعمل وما لا يعمل داخل التطبيق المغلَّف

| الميزة | الحالة داخل تطبيق أندرويد |
|---|---|
| تسجيل الدخول، الحسابات، التقارير، المزامنة | ✅ تعمل (عبر الإنترنت إلى Railway) |
| العمل بلا إنترنت | ✅ الواجهة محمولة داخل التطبيق، والبيانات المحلية محفوظة — وتُزامَن عند عودة الاتصال |
| اختيار المظهر والكتابة (الوضع/الخلفية/اللون/الحجم) | ✅ يعمل |
| **الإشعارات الفورية (Web Push)** | ⚠️ لا تعمل داخل التغليف بلا Firebase/FCM — تحتاج إضافة `@capacitor/push-notifications` (خارج نطاق هذا الدليل) |
| **الطباعة** (كشف الحسابات) | ⚠️ `window.print()` لا يعمل داخل WebView — اطبع من الموقع في المتصفح |
| **تصدير/تنزيل ملفات النسخ الاحتياطي** | ⚠️ قد لا يعمل التنزيل المباشر — صدّر من الموقع قبل الاعتماد عليه |

---

## ١١) أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|---|---|---|
| `SDK location not found` | Android SDK غير معرَّف | افتح المشروع من Android Studio مرة (يُنشئ `local.properties`) أو اضبط `ANDROID_HOME` |
| `Unsupported class file major version` / Gradle sync failed | JDK/Gradle قديم | حدّث Android Studio إلى 2025.2.1+ ودع `JAVA_HOME` يشير إلى JDK الذي يوفّره |
| `npx cap sync` يقول لا يوجد منصّة | لم تُنفَّذ `cap add` | `npx cap add android` أولًا |
| التطبيق يفتح لكن «تعذّر الاتصال بالخادم» | البناء لم يُنفَّذ بوضع android (النداءات تذهب إلى `/api` على الجهاز) | أعد: `npm run build -- --mode android && npx cap sync android` وتحقّق بالخطوة ٧ |
| البيانات فارغة بعد الدخول | حساب مختلف أو لم تُزامَن بعد | اسحب للتحديث، وتأكد من الإنترنت |
| الأيقونة/الاسم غير عربي | الاسم يأتي من `appName` | تأكد أن `android/app/src/main/res/values/strings.xml` يحمل «تنظيم المضخات» |

---

## ١٢) قواعد لا تكسرها

- لا تغيّر `webDir` عن `dist`، ولا تحذف `.env.android`.
- لا تضع أسرارًا داخل التطبيق أو داخل `capacitor.config.ts`.
- لا تغيّر `appId` (`com.pumpmanagement.app`) بعد نشر أول نسخة.
- لا تغيّر قاعدة البيانات أو المصادقة أو خادم Railway لأجل التغليف — التطبيق يستعمل نفس الـAPI.

---

## مرجع سريع (نسخ/لصق لكل مرة)

```bash
npm i -D @capacitor/cli@8.5.2
npm i @capacitor/core@8.5.2 @capacitor/android@8.5.2
npx cap add android                 # مرة واحدة فقط
npm run build -- --mode android     # كل مرة بعد تعديل الواجهة
npx cap sync android                # كل مرة بعد البناء
npx cap doctor                      # فحص سريع للحزم
npx cap open android                # ثم Run من Android Studio
```
