import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPwa } from "./pwa";
import { applyAppearance } from "./domain/appearance";
import { readManagerState } from "./domain/storage";

/* تسجيل العامل الخدمي والتقاط حدث التثبيت قبل تركيب React (الحدث يصل مبكرًا) */
initPwa();

/* المظهر والكتابة: تُطبَّق قبل أول رسم فتظهر شاشة الدخول بنفس ألوان المستخدم
   (وضع داكن/كتابة قوية/حجم خط) بلا وميض ولا تضارب مع وضع الجهاز */
const savedState = readManagerState();
if (savedState?.settings) applyAppearance(savedState.settings);

createRoot(document.getElementById("root")!).render(<App />);
