# تقرير فحص الجاهزية للتحويل إلى Android — مشروع «تنظيم المضخات»

الحالة: **فحص فقط (AUDIT ONLY)** — لم يُعدَّل أي ملف من ملفات التشغيل في هذه المرحلة.

---

## 1. حالة المشروع

| البند | النتيجة |
|---|---|
| Framework (واجهة) | React 19.1 + TypeScript 5.8 (strict) + Vite 6 + Tailwind 4 + lucide-react |
| PWA | نعم — `vite-plugin-pwa` (autoUpdate)، manifest عربي RTL، precache 8 ملفات ≈ 872 KiB |
| Backend | Node.js ≥ 20 + Express 4.21.2 في `server/src` (نفس الأصل، المسار `/api`) |
| Database | PostgreSQL عبر `pg` 8.13.1 — `DATABASE_URL`، المخطّط يُنشأ بـ`IF NOT EXISTS` وإضافات فقط (لا حذف) |
| Auth | جلسات خادم: رمز عشوائي، يُحفظ في القاعدة كـ`sha256`، صلاحية 30 يومًا، قابل للإلغاء + كلمات مرور بـ`scrypt` بملح عشوائي. ويوجد وضع محلي (بلا خادم) لحسابات الجهاز |
| Build Tool | Vite (`npm run build` → `dist`) + فحص أنواع `tsc --noEmit` |
| API client | عميل واحد `src/auth/api.ts` — `fetch` بمسار نسبي `/api/...` فقط، بلا `axios` وبلا WebSocket |

**نتائج البناء:** TypeScript ✅ · Build ✅ · الاختبارات ✅ (30 ناجح · 0 فاشل)

---

## 2. هل يمكن تحويله إلى Android؟

**الإجابة: BLOCKED — REQUIRES FIXES BEFORE ANDROID BUILD**

- بنية الواجهة **مناسبة** لـCapacitor (SPA بلا SSR، RTL متوافق مع الجوال، بلا اعتماد على ميزات سطح مكتب).
- لكن يوجد **ثلاثة عوائق حقيقية** (مصدر البيانات المحلي، عنوان API الإنتاجي، CORS) يجب معالجتها أولًا.
- **ملاحظة مهمة:** توليد ملف APK/AAB ومجلد `android/` لا يمكن تنفيذه داخل بيئة Mythex (هنا نبني وننشر تطبيقات ويب فقط). مراحل 3–7 تحتاج جهازًا عليه Android Studio، أو يبقى التطبيق PWA مثبّتًا على الهاتف.

---

## 3. المشاكل التي تمنع Android

### 1) مصدر البيانات الأساسي هو localStorage (مخالفة للقاعدة 14) — خطورة: حرجة
- **الملف:** `src/domain/storage.ts`، `src/store.tsx:2716–2757`، `src/shareholder/store.tsx:303–353`
- **المكان:** مفاتيح `pump-org-state-v2::<pumpId>` و`pump-org-shareholder-v2`
- **السبب:** بيانات التشغيل كلها (الديالات، الأيام، الأدوار، كشف الدوام الأساسي، المساهمون، الديون، الديزل، الرواسة، التنبيهات، سجل التغييرات، طابور المزامنة) محفوظة في متصفح الجهاز فقط. الخادم لا يملك واجهات لهذه البيانات إطلاقًا (فقط مضخات/عضويات/قرارات/تدقيق).
- **الحل المقترح:** جداول ومسارات على الخادم (`pumps → rounds → days → entries`, roster, finance) مقيّدة بـ`pumpId` وبدور المستخدم، ويصبح localStorage ذاكرة مؤقتة. هذا عمل كبير يُنفَّذ في Phase 2 موسّعة.

### 2) لا يوجد عنوان API إنتاجي قابل للضبط — خطورة: حرجة لـAPK
- **الملف:** `src/auth/api.ts:49` · `src/components/LoginScreen.tsx:36` · `src/screens/LoginScreen.tsx:35`
- **السبب:** الاستدعاءات نسبية `/api/...`. داخل WebView الأصل هو `https://localhost`، فيتحول `/api` إلى تطبيق الواجهة نفسه ويفشل.
- **الحل:** متغير واحد `VITE_API_URL` يُقرأ في هذه المواضع الثلاثة فقط، ويبقى `/api` النسبي هو المستخدم في نسخة الويب.

### 3) لا يوجد CORS على الخادم — خطورة: حرجة لـAPK
- **الملف:** `server/src/index.js:19–24`
- **السبب:** تطبيق Android أصل مختلف (`https://localhost` / `capacitor://localhost`)، والمتصفح/WebView يمنع الردود بلا ترويسات CORS.
- **الحل:** قائمة أصول مسموح لها (أصل الموقع المنشور + أصل التطبيق) — لا تستخدم `*`.

### 4) تصدير/استيراد النسخة الاحتياطية عبر المتصفح — خطورة: متوسطة
- **الملف:** `src/manager/screens/SettingsScreen.tsx:56` · `src/shareholder/screens/AccountsScreen.tsx:45,56`
- **السبب:** `Blob` + `URL.createObjectURL` + وسم `<a download>` + `FileReader` — التنزيل داخل WebView لا يعمل بالشكل المتوقع.
- **الحل:** `@capacitor/filesystem` + `@capacitor/share` على Android مع إبقاء مسار الويب كما هو.

### 5) الطباعة `window.print()` — خطورة: متوسطة
- **الملف:** `src/manager/screens/ReportsScreen.tsx:114` · `src/shareholder/screens/AccountsScreen.tsx:82`
- **الحل:** إخفاء الزر في التطبيق الأصلي أو التصدير PDF/مشاركة.

### 6) `window.prompt()` لسبب الإلغاء — خطورة: منخفضة
- **الملف:** `src/manager/screens/FinanceScreen.tsx:646, 694, 748`
- **السبب:** نافذة المتصفح؛ تعمل في WebView لكنها غير متسقة وقد تُحجب.
- **الحل:** نافذة داخل التطبيق (كما في بقية الشاشات).

### 7) كلمة مرور الوضع المحلي — خطورة: متوسطة
- **الملف:** `src/lib/auth.ts:19–23` (`pump_users` في localStorage بملح ثابت `pump_salt_2026`)
- **السبب:** تجزئة ضعيفة لمقارنة محلية فقط، وقابلة للقراءة من الجهاز. ليست حماية للصلاحيات (الصلاحيات على الخادم).
- **الحل:** إبقاؤها للاستخدام دون إنترنت مع توضيح ذلك، أو تعطيل الحسابات المحلية في نسخة Android. ملاحظة: `crypto.subtle` يحتاج سياقًا آمنًا (`https://localhost` في Capacitor يعمل).

### 8) خطوط Google من الإنترنت — خطورة: تجميلية
- **الملف:** `index.html:7–10` — بلا إنترنت يظهر الخط الاحتياطي.

---

## 4. كل أماكن العناوين (localhost / IP داخلي / http / https)

| الملف | السطر | العنوان | نوع الاتصال | يعمل على Android؟ | الإصلاح المطلوب |
|---|---|---|---|---|---|
| `vite.config.ts` | 11 | `http://127.0.0.1:3001` | بروكسي تطوير لـ`/api` | لا (ولا يدخل في نسخة البناء) | يبقى للمعاينة فقط، لا يتغير |
| `server/src/index.js` | 60 | `0.0.0.0` | استماع الخادم | نعم (جهة الخادم) | لا شيء |
| `src/auth/api.ts` | 49 | `/api/...` نسبي | REST/JSON | لا داخل WebView | API base من `VITE_API_URL` |
| `src/components/LoginScreen.tsx` | 36 | `/api/settings/public` | REST/JSON | لا داخل WebView | نفس الـAPI base |
| `src/screens/LoginScreen.tsx` | 35 | `/api/settings/public` | REST/JSON | لا داخل WebView | نفس الـAPI base |
| `index.html` | 7–10 | `fonts.googleapis.com` / `gstatic` | خطوط https | نعم مع إنترنت | اختياري: تضمين الخط محليًا |

لا يوجد في المشروع أي `VITE_*` أو `NEXT_PUBLIC_*` أو `API_URL` أو `axios` أو WebSocket/Socket.IO، ولا `localhost` في كود الواجهة.

---

## 5. Authentication

**الموجود:** Register / Login / Logout / Me / Change password / Forgot password / Reset password (بلا بريد: رقم الهاتف + الاسم + رمز استعادة)، وجلسات خادم قابلة للإلغاء (`sessions` مع `revoked_at`)، وحساب موقوف لا يدخل.

**الفصل بين الأدوار (مطلوب في القاعدة 17) — محقَّق:**
- `users.account_type` = `manager | user` فقط (مسؤول المضخة أو مستخدم).
- `users.is_admin` = مسؤول النظام، منفصل تمامًا.
- `pumps.manager_id` = مسؤول المضخة فقط، ولا يمنح أي صلاحية نظام.

**مشاكل/ملاحظات للتوافق مع Android:**
- رمز الجلسة محفوظ في localStorage (`pump-org-token-v1`) — مقبول، لكن يُعبَّر عنه كبيانات اعتماد: يُمسح عند الخروج، ويمكن إبطاله من الخادم.
- `crypto.subtle` المستخدم في الوضع المحلي يحتاج سياقًا آمنًا (متوفر في Capacitor على `https://localhost`).
- لا يوجد أي اعتماد على Cookie أو SameSite (الرمز في ترويسة `Authorization: Bearer`) — أفضل للتوافق مع Android.

---

## 6. الصلاحيات (مُحقّقة على الخادم، لا في الواجهة)

| المسار | الحارس |
|---|---|
| `POST /api/auth/register|login|forgot-password|reset-password` | عام + تحديد معدّل |
| `POST /api/auth/logout`, `GET/PATCH /api/auth/me`, `change-password` | `requireAuth` |
| `POST /api/pumps` (إنشاء مضخة) | `requireAuth` + `account_type = manager` |
| `PATCH /api/pumps/:id` (تعديل المضخة) | `manager_id === req.user.id` |
| `GET /api/pumps/:id` | `requirePumpAccess` = مسؤول المضخة أو عضوية **معتمدة** |
| `POST /api/pumps/join` | `requireAuth` — ينشئ عضوية `pending` فقط، ولا يُعيد أي بيانات مضخة قبل القبول |
| `GET /requests`، `GET /members`، `decision`، `PATCH /members/:id`، `remove`، `GET /audit` | `managerOwnsPump` (مالك المضخة فقط) |
| `GET /api/audit/me` | `requireAuth` (سجل الفاعل نفسه) |
| كل `/api/admin/*` | `requireAuth` + `requireAdmin` على مستوى الموجِّه |

**Manager:** يدير مضخته فقط (الكشف، الدوام الفعلي، المساهمون، البيانات) — ولا يصل لمضخة مسؤول آخر، ولا يمنح نفسه صلاحية نظام.
**Shareholder:** ينشئ حسابه، يدخل، يطلب الربط برقم تعريف المضخة، ينتظر الموافقة، ثم يطّلع فقط (لا تعديل على المضخة أو الكشوف أو المساهمين أو بيانات أي مستخدم).
**System Admin:** لوحة منفصلة (مستخدمون، مضخات، طلبات، عضويات، إعدادات، سجل تدقيق) — وبلا صلاحيات تشغيلية على الديالات.

**فجوة يجب سدّها مع البند 1:** بيانات التشغيل (الديالة/الكشوف/الحسابات) لا تمرّ بالخادم اليوم، فلا يوجد ما يُحمى أصلًا؛ وعند نقلها إلى الخادم يجب أن تحمل نفس الحراس أعلاه.

---

## 7. بيانات localStorage — تصنيف

| المفتاح | المحتوى | التصنيف |
|---|---|---|
| `pump-org-state-v2::<pumpId>` (+ `pump-organization-state-v1`) | ديالات، أيام، أدوار، كشف أساسي، مساهمون، ديون/دفعات/ديزل/رواسة، تنبيهات، سجل تغييرات، طابور مزامنة | **B — يجب أن يكون على الخادم** |
| `pump-org-shareholder-v2` (+ v1) | سجل المستخدم الشخصي (أدوار، ديالات، مدفوعات) | **B — يجب أن يكون على الخادم** |
| `pump_users` | حسابات الوضع المحلي + تجزئة كلمة المرور | **D — حساس** |
| `pump-org-token-v1` | رمز جلسة الخادم | **D — بيانات اعتماد** (يُمسح عند الخروج) |
| `pump-session` / `pump-org-session-v1` | علامة جلسة الوضع المحلي | C — واجهة |
| `pump-org-active-pump-v1` | المضخة المختارة في الواجهة | C — واجهة |
| `pump-org-user-link-v1` | ربط هذا الجهاز بشخص معيّن (للاطلاع) | C — لا يمنح أي صلاحية على الخادم |
| `pump-announcement-dismissed::*` | إغلاق الإعلان العام | C — واجهة |

لا يوجد `sessionStorage` ولا `IndexedDB` ولا Cookies. **لا شيء يُحذف في هذه المرحلة.**

---

## 8. Capacitor

**ممكن تقنيًا:** نعم — مشروع SPA بلا SSR، وبناء `dist` ثابت، واتصال API نسبي يمكن جعله مطلقًا بمتغير واحد.

**المتطلبات المقترحة (Capacitor 7 — تُأكَّد من الوثائق الرسمية وقت التنفيذ):**
Node 20+ · JDK 21 · Android Studio (Ladybug أو أحدث) · Android SDK 35 · Gradle 8.11.x · minSdk 23 · targetSdk 35.
**Package ID مقترح:** `com.pumpmanagement.app` (لا يُغيَّر قبل اعتماد التقرير).

**الإضافات المطلوبة فقط:** `@capacitor/core` + `@capacitor/cli` + `@capacitor/android`، و`@capacitor/filesystem` + `@capacitor/share` لتصدير/استيراد النسخة الاحتياطية، و`@capacitor/clipboard` اختياري. **Firebase غير مطلوب** (لا حاجة إشعارات Push في النطاق الحالي).

---

## 9. سلوك بلا إنترنت (وصف الحالة الراهنة فقط)

- **فتح التطبيق بلا إنترنت:** الواجهة تفتح (Service Worker يخزّن هيكل التطبيق مسبقًا) — بيانات المضخة/المستخدم محليًا تظهر كاملة.
- **انقطاع أثناء حفظ محلي:** لا خطر — الحفظ إلى localStorage فوري ومتزامن.
- **انقطاع أثناء عملية خادم (دخول، طلب ربط، قرار إداري):** تفشل برسالة «تعذّر الاتصال بالخادم» ولا يوجد أي طابور إعادة إرسال للمزامنة الخلفية.
- **Timeout:** رسالة خطأ واضحة، وإعادة المحاولة يدوية.
- **عودة الإنترنت:** لا مزامنة تلقائية لأي عملية خادم فشلت سابقًا.
- **ملاحظة Android مهمة:** بيانات localStorage داخل WebView تُمسح إذا مسح المستخدم بيانات التطبيق أو أعاد التثبيت — بلا نسخة احتياطية على الخادم (البند 1).

---

## 10. الملفات التي تحتاج تعديلًا

| الملف | سبب التعديل | نوع التعديل |
|---|---|---|
| `src/auth/api.ts` | إضافة API base من `VITE_API_URL` مع إبقاء `/api` النسبي للويب | تعديل صغير |
| `src/components/LoginScreen.tsx` | استخدام نفس API base لطلب الإعدادات العامة | تعديل صغير |
| `src/screens/LoginScreen.tsx` | نفس السبب | تعديل صغير |
| `server/src/index.js` | إضافة CORS بقائمة أصول مسموحة | تعديل صغير |
| `src/manager/screens/SettingsScreen.tsx` | تصدير النسخة الاحتياطية عبر Filesystem/Share على Android | تعديل متوسط |
| `src/shareholder/screens/AccountsScreen.tsx` | تصدير/استيراد + إخفاء الطباعة في التطبيق الأصلي | تعديل متوسط |
| `src/manager/screens/ReportsScreen.tsx` | الطباعة في التطبيق الأصلي | تعديل صغير |
| `src/manager/screens/FinanceScreen.tsx` | استبدال `window.prompt` بنافذة داخلية | تعديل صغير |
| `src/manager/screens/PumpAccountsScreen.tsx` | نسخ رقم المضخة عبر Clipboard plugin | تعديل صغير |
| `index.html` | اختياري: تضمين الخط بدل الإنترنت | تعديل صغير |
| **جديد (خارج Mythex):** `capacitor.config.ts` + `android/` + `.env.production` | مشروع Android وتهيئة العنوان الإنتاجي | ملفات جديدة |

---

## 11. الملفات التي لا يجب تعديلها

`src/domain/rules.ts` · `src/shareholder/calc.ts` · `src/domain/migrate.ts` (ترقيات حالة البيانات) · `src/domain/types.ts` · `src/manager/screens/DialaScreen.tsx` + `ActualDayScreen.tsx` (منطق الديالات والدوام) · `src/shareholder/selectors.ts` + `pumpView.ts` (قراءة فقط) · `server/src/db.js` (المخطّط) · `server/src/security.js` (التجزئة والجلسات) · `server/src/audit.js` · وكل كتابة سجل التدقيق.

---

## 12. خطة التحويل

- **Phase 1 — Preparation (جاهز):** تجميد الويب الحالي، إبقاء البناء أخضر، تحديد مضيف API الإنتاجي، وإغلاق قرار: هل تُنقل بيانات التشغيل إلى الخادم؟
- **Phase 2 — API/Production:** (أ) API base بمتغير واحد، (ب) CORS، (ج) نوافذ/ملفات متوافقة مع التطبيق الأصلي، (د) النقل التدريجي لبيانات التشغيل إلى PostgreSQL مع نفس حراس الصلاحيات.
- **Phase 3 — Capacitor:** `@capacitor/core` + `cli` + `android`، `npx cap init`، `npx cap add android`، الإضافات، `npx cap sync` — **خارج Mythex**.
- **Phase 4 — Android project:** فتح `android/` في Android Studio، أيقونات/اسم/أذونات، ربط API الإنتاجي، `minSdk 23`، `targetSdk 35`.
- **Phase 5 — Android testing:** جهاز حقيقي: دخول، انقطاع شبكة، تصدير/استيراد، صلاحيات المستخدم مقابل المسؤول، شاشات RTL.
- **Phase 6 — APK:** `./gradlew assembleDebug` للتثبيت المباشر.
- **Phase 7 — AAB / Google Play:** توقيع الإصدار، `bundleRelease`، Play Console، الخصوصية والأذونات.

---

## الخلاصة النهائية

الفحص اكتمل. المشروع **قابل تقنيًا** لـCapacitor، لكنه **لا** جاهز لبدء مرحلة التطبيق الآن لثلاثة أسباب حقيقية:
1. بيانات التشغيل مصدرها localStorage لا الخادم (يخالف القاعدة 14).
2. لا يوجد عنوان API إنتاجي قابل للضبط (الاستدعاءات نسبية `/api`).
3. لا يوجد CORS على الخادم لتطبيق بأصل مختلف.

وإضافة إلى ذلك: توليد APK/AAB ومجلد `android/` لا يمكن تنفيذه داخل بيئة Mythex — يحتاج جهازًا عليه Android Studio.

**BLOCKED — REQUIRES FIXES BEFORE ANDROID BUILD**
