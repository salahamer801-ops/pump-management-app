/** عميل الـAPI — الهوية تُثبت على الخادم برمز الجلسة، لا باسم المستخدم */

const TOKEN_KEY = "pump-org-token-v1";

/* ============================ عنوان واجهة البرمجة ============================
 * الموقع يعمل على نفس أصل الخادم، فلا يحتاج شيئًا: كل نداء يبقى نسبيًا "/api/...".
 * أما تطبيق أندرويد (Capacitor/WebView) فيعمل على أصل محلي، فالنداء النسبي يذهب
 * إلى الجهاز نفسه ويفشل — لذلك يُضبط وقت البناء:
 *
 *     VITE_API_BASE_URL=https://pump-management-app-production.up.railway.app
 *
 * فيصبح النداء: <الأساس>/api/auth/login
 * ولا يتكرر "/api" أبدًا: لو انتهى الأساس بـ "/api" نُنظّفه، ولو كان المسار بلا
 * "/api" نضيفه.
 * بلا هذا المتغيّر (المعاينة والنشر على الويب) لا يتغيّر أي سلوك.
 */
const RAW_API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();

/** الأساس النهائي: بلا شرطة أخيرة وبلا "/api" في آخره */
export const API_BASE = RAW_API_BASE.replace(/\/+$/, "").replace(/\/api$/i, "");

/** يحوّل مسار الـAPI إلى عنوان كامل عند وجود أساس، وإلا يعيده نسبيًا كما هو */
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  const raw = String(path ?? "").trim();
  /* عنوان كامل يُترك كما هو (لا نكرّر الأساس ولا "/api") */
  if (/^https?:\/\//i.test(raw)) return raw;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const withApi =
    withSlash === "/api" || withSlash.startsWith("/api/") ? withSlash : `/api${withSlash}`;
  return `${API_BASE}${withApi}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "تعذّر الاتصال بالخادم — تحقّق من الإنترنت وحاول مرة أخرى.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      err?.code ?? "error",
      err?.message ?? "تعذّر تنفيذ العملية — حاول مرة أخرى."
    );
  }

  return (payload ?? {}) as T;
}

/*
 * ============================ توجيه باقي نداءات /api ============================
 * شاشة الدخول، لوحة المسؤول، مزامنة الخادم، تيليجرام، والإشعارات تنادي
 * fetch("/api/...") مباشرة. عند تحديد أساس (بناء الأندرويد فقط) نحوّل هذه
 * النداءات النسبية إليه تلقائيًا — بلا تعديل أي ملف آخر.
 * وبلا أساس لا يعمل هذا التوجيه إطلاقًا، فيبقى سلوك الموقع والمعاينة كما هو.
 */
export function installApiBaseShim(): void {
  if (!API_BASE || typeof window === "undefined" || typeof window.fetch !== "function") return;

  const original = window.fetch.bind(window);
  const isApiPath = (url: string): boolean => url === "/api" || url.startsWith("/api/");

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && isApiPath(input)) {
      return original(apiUrl(input), init);
    }
    if (typeof input === "object" && input instanceof URL) {
      const sameOrigin = input.origin === window.location.origin;
      if (sameOrigin && isApiPath(input.pathname)) {
        return original(new URL(apiUrl(input.pathname + input.search)), init);
      }
    }
    return original(input as RequestInfo, init);
  }) as typeof window.fetch;
}

installApiBaseShim();
