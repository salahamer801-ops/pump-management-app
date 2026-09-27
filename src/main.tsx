import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPwa } from "./pwa";

/* تسجيل العامل الخدمي والتقاط حدث التثبيت قبل تركيب React (الحدث يصل مبكرًا) */
initPwa();

createRoot(document.getElementById("root")!).render(<App />);
