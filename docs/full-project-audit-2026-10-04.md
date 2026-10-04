# تقرير الفحص الشامل — Pump Management

**التاريخ:** 2026-10-04  
**المستودع:** `salahamer801-ops/pump-management-app`  
**Commit:** `aad0cf88b5d09580083ba53ea8e4932fc725c35f`

## 1. نطاق الفحص

تمت مراجعة البنية الحالية للواجهة والخادم وطبقة PostgreSQL والمصادقة والمزامنة والتخزين المحلي وPWA وCapacitor وAndroid وإدارة الصلاحيات، مع البحث عن بيانات Demo والأسرار والكود التجريبي وعمليات الحذف الخطرة.

البنية الحالية هي React + TypeScript/Vite في الواجهة، Express + PostgreSQL في الخادم، مع طبقة مزامنة snapshot وPWA وCapacitor Android.

## 2. المشاكل التي وُجدت

### P0/P1 — مشاكل الاستقرار وسلامة البيانات

1. **المزامنة لم تكن تطبق رقم الإصدار لمنع الكتابة فوق تحديث أحدث.**
   كان العميل يرسل `version` لكن الخادم يسجلها فقط في التدقيق ثم يقبل الكتابة. كان ذلك يسمح لعميل قديم بإعادة رفع snapshot قديم فوق بيانات أحدث.
2. **`upsertCollection()` كان يفسر غياب العناصر كحذف ناعم حتى مع payload جزئي.**
   أي payload ناقص قد يؤدي إلى إخفاء سجلات موجودة على الخادم، خصوصًا مع `id = ANY([])`.
3. **سكربت `npm run verify` كان ينهار خارج Vite.**
   السبب هو القراءة المباشرة من `import.meta.env` عند تشغيل bundle بواسطة Node، حيث `import.meta.env` غير موجودة.
4. **Modal المشترك كان يضع التمرير على الحاوية كلها دون قفل تمرير الصفحة الخلفية أو إدارة ارتفاع الهاتف الحديث.**
   هذا يفسر احتمال اختفاء حقول أو أزرار في النوافذ الطويلة على الهاتف ولوحة المفاتيح.
5. **اعتماديات الخادم كانت تحتوي ثغرات audit عالية/متوسطة مرتبطة بإصدار Express القديم.**

### P2 — ملاحظات مهمة متبقية

1. **رمز الجلسة محفوظ في `localStorage`.** هذا يحقق تذكر الدخول، لكنه أقل أمانًا من HttpOnly Secure SameSite cookie ضد سرقة الرمز عند وجود XSS. لم أعد تصميم المصادقة كاملة حتى لا أكسر Capacitor/Android، ويجب اتخاذ قرار معماري قبل نقله إلى cookies.
2. **App Lock / Biometric غير مطبق حاليًا** في الشيفرة التي تمت مراجعتها؛ لا توجد طبقة credential آمنة أو plugin biometric. يحتاج هذا إلى اختيار plugin متوافق مع Capacitor 6 وAndroid API المستهدف واختبار على جهاز فعلي.
3. **Forgot Password في الوضع البديل يعرض OTP على الشاشة عندما لا يوجد Telegram.** هذا ليس OTP SMS حقيقيًا، ويجب في الإنتاج ربط مزود SMS أو تعطيل الاستعادة البديلة بدل اعتبارها استعادة قوية.
4. **Reset في الواجهة يغير الحالة المحلية فقط، بينما المزامنة الكاملة قد ترفع snapshot فارغًا إلى الخادم.** يلزم فصل واضح بين Reset محلي وReset رسمي للخادم مع endpoint مؤكد ومحدد النطاق، بدل ترك السلوك يعتمد على دورة المزامنة.
5. **لا يوجد اختبار backend تكاملي فعلي في هذه البيئة** لأن تشغيله يتطلب `DATABASE_URL` وقاعدة PostgreSQL مهيأة؛ يوجد سكربت `scripts/verify-phase2-api.mjs` لكنه لم يُشغّل ضد قاعدة حقيقية.
6. **بناء Android تعذر بعد تصحيح ملفات Capacitor بسبب غياب Android SDK في البيئة:** الخطأ النهائي هو عدم وجود `ANDROID_HOME` أو `android/local.properties` يشير إلى SDK.
7. **حجم bundle الرئيسي يقارب 910 kB قبل الضغط.** Vite أصدر تحذيرًا، ويستحسن لاحقًا code-splitting للشاشات الكبيرة.

## 3. الإصلاحات المنفذة

1. إضافة optimistic concurrency داخل transaction في `server/src/routes/operating.js`:
   - قراءة `pump_sync.version` مع `FOR UPDATE`.
   - رفض النسخة القديمة أو المفقودة برسالة `409 sync_conflict`.
   - منع سباق طلبين يحملان نفس الإصدار.
2. جعل الحذف الناعم في `upsertCollection()` مشروطًا بوسم صريح `snapshot: true`.
   - payload الجزئي لا يحذف بقية السجلات.
   - عميل المزامنة الرسمي يرسل الآن `snapshot: true` لأنه يرسل الحالة الكاملة.
3. جعل `import.meta.env` آمنة عند تشغيل أدوات Node في `src/auth/api.ts`.
4. إعادة بناء `Modal` المشترك في `src/components/ui.tsx`:
   - قفل تمرير الصفحة الخلفية.
   - `100dvh` وsafe-area.
   - تمرير داخلي مستقل.
   - `overscroll-contain`.
   - رأس ثابت وزر الحفظ/المحتوى داخل منطقة تمرير واضحة.
   - الحفاظ على Escape وسلوك الإغلاق.
5. تحديث Express من `4.21.2` إلى `4.22.3` وتحديث lockfile؛ أصبح `npm audit --prefix server --audit-level=high` بلا ثغرات.
6. تشغيل `npx cap sync android` لتوليد ملفات Capacitor المفقودة.

## 4. الملفات المعدلة

- `server/src/routes/operating.js`
- `src/auth/api.ts`
- `src/components/ui.tsx`
- `src/domain/serverSync.ts`
- `server/package.json`
- `server/package-lock.json`
- `docs/full-project-audit-2026-10-04.md`

## 5. الملفات المحذوفة

لم يتم حذف أي ملف؛ لم توجد ضرورة آمنة للحذف أثناء هذه المرحلة، كما تم الحفاظ على migration/compatibility code إلى حين وجود دليل استخدام كامل.

## 6. قاعدة البيانات وMigrations

لم تُنفذ أي migration على قاعدة بيانات حقيقية، ولم تُحذف أو تُفرغ أي بيانات. التعديل الخاص بالمزامنة يعتمد على جدول `pump_sync` الموجود أصلًا ولا يغير المخطط.

## 7. Dependencies

تم تحديث dependency موجودة فقط:

- `express`: من `4.21.2` إلى `4.22.3` لمعالجة نتائج `npm audit` دون استخدام `--force`.

لم تتم إضافة مكتبة biometric أو SMS لأن اختيارها يتطلب قرارًا تشغيليًا واختبارًا على Android ومزودًا خارجيًا.

## 8. الاختبارات والنتائج

| الاختبار | النتيجة |
|---|---|
| `npm ci` للواجهة | ناجح |
| `npm run build` | ناجح |
| `npx tsc --noEmit` | ناجح |
| `npm run verify` | ناجح — 81 ناجح، 0 فاشل |
| `node --check` لكل ملفات الخادم | ناجح |
| `npm audit --omit=dev --audit-level=high` للواجهة | بلا ثغرات في الاعتماديات التشغيلية المفحوصة |
| `npm ci --prefix server` | ناجح |
| `npm audit --prefix server --audit-level=high` | ناجح — 0 ثغرات بعد تحديث Express |
| `git diff --check` | ناجح |
| `npx cap sync android` | ناجح |
| `./gradlew assembleDebug --no-daemon` | غير مكتمل بسبب غياب Android SDK، وليس خطأ كود |
| اختبار API ضد PostgreSQL حقيقي | لم يُنفذ لغياب `DATABASE_URL`/قاعدة مهيأة |

## 9. التدخل اليدوي المطلوب

1. لتشغيل اختبار backend الكامل: توفير قاعدة PostgreSQL اختبارية و`DATABASE_URL` ثم تشغيل `node scripts/verify-phase2-api.mjs` وفق إعداد المشروع.
2. لبناء Android: تثبيت Android SDK وضبط `ANDROID_HOME` أو إنشاء `android/local.properties` يحتوي `sdk.dir=...`، ثم إعادة `./gradlew assembleDebug`.
3. قبل الإنتاج: اختيار مزود SMS حقيقي أو تعطيل وضع OTP الظاهر على الشاشة.
4. قبل اعتماد App Lock: اختيار plugin biometric/secure storage واختباره على Android API 29+ وعلى جهاز بلا biometric.
5. قبل نشر Reset الرسمي: اعتماد قرار واضح هل العملية محلية فقط أم حذف ناعم رسمي للخادم، ثم إضافة اختبار تكاملي يغطي عدم عودة البيانات بعد إعادة فتح التطبيق.

## 10. الخلاصة

المشروع يبني بنجاح، وفحوص TypeScript والمنطق الحسابي وsyntax واعتماديات الخادم ناجحة. تم إصلاح أخطر مسار قابل لفقدان/إخفاء البيانات في المزامنة، وإضافة حماية التعارض، وتحسين Modal للهاتف، وإصلاح سكربت التحقق وتحديث Express.

لا يمكن اعتبار المشروع **Production Ready بالكامل** قبل إغلاق البنود المتبقية المتعلقة بـ App Lock، مزود SMS، Reset الرسمي، اختبار PostgreSQL الحقيقي، وبناء Android في بيئة تحتوي SDK.
