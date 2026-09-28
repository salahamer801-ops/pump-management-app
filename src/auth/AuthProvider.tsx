import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api, getToken, setToken } from "./api";
import type { AccountType, AccountUser, AuthResponse, AuthSession } from "./types";

export interface OtpRequestResult {
  channel: "telegram" | "screen";
  code: string | null;
  warning: string;
  hint: string;
  expiresInMinutes: number;
}

interface AuthValue {
  session: AuthSession | null;
  user: AccountUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<AuthSession>;
  register: (input: {
    name: string;
    phone: string;
    password: string;
    confirmPassword: string;
    accountType: AccountType;
  }) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<string>;
  /** طلب رمز تحقّق: يصل على تيليجرام إن كان الحساب مربوطًا، وإلا يظهر على الشاشة */
  requestOtp: (phone: string, name?: string) => Promise<OtpRequestResult>;
  /** التحقّق من الرمز ⇒ تذكرة قصيرة الاستخدام لتعيين كلمة المرور */
  verifyOtp: (phone: string, code: string) => Promise<{ ticket: string; expiresInMinutes: number }>;
  resetPassword: (input: {
    phone: string;
    ticket?: string;
    code?: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<string>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const applyResponse = useCallback((res: AuthResponse) => {
    setToken(res.token);
    const next: AuthSession = {
      user: res.user,
      announcement: res.announcement,
      managedPumps: res.managedPumps ?? [],
      memberships: res.memberships ?? [],
      pendingRequests: res.pendingRequests ?? 0,
    };
    setSession(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setSession(null);
      return;
    }
    try {
      const res = await api<AuthSession>("/api/auth/me");
      setSession({
        user: res.user,
        announcement: res.announcement,
        managedPumps: res.managedPumps ?? [],
        memberships: res.memberships ?? [],
        pendingRequests: res.pendingRequests ?? 0,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setToken(null);
        setSession(null);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      login: async (phone, password) => {
        const res = await api<AuthResponse>("/api/auth/login", {
          method: "POST",
          body: { phone, password },
          auth: false,
        });
        return applyResponse(res);
      },
      register: async (input) => {
        const res = await api<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: input,
          auth: false,
        });
        return applyResponse(res);
      },
      logout: async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } catch {
          /* حتى لو فشل الاتصال: الجلسة المحلية تُلغى */
        }
        setToken(null);
        setSession(null);
      },
      refresh,
      updateName: async (name) => {
        const res = await api<AuthSession>("/api/auth/me", { method: "PATCH", body: { name } });
        setSession({
          user: res.user,
          managedPumps: res.managedPumps ?? [],
          memberships: res.memberships ?? [],
          pendingRequests: res.pendingRequests ?? 0,
        });
      },
      changePassword: async (input) => {
        const res = await api<{ message: string }>("/api/auth/change-password", {
          method: "POST",
          body: input,
        });
        setToken(null);
        setSession(null);
        return res.message ?? "تم تغيير كلمة المرور — سجّل الدخول من جديد.";
      },
      requestOtp: async (phone, name = "") => {
        const res = await api<OtpRequestResult>("/api/auth/otp/request", {
          method: "POST",
          body: { phone, name },
          auth: false,
        });
        return {
          channel: res.channel === "telegram" ? "telegram" : "screen",
          code: res.code ?? null,
          warning: res.warning ?? "",
          hint: res.hint ?? "",
          expiresInMinutes: res.expiresInMinutes ?? 5,
        };
      },
      verifyOtp: async (phone, code) => {
        const res = await api<{ ticket: string; expiresInMinutes: number }>("/api/auth/otp/verify", {
          method: "POST",
          body: { phone, code },
          auth: false,
        });
        return { ticket: res.ticket, expiresInMinutes: res.expiresInMinutes ?? 10 };
      },
      resetPassword: async (input) => {
        const res = await api<{ message: string }>("/api/auth/reset-password", {
          method: "POST",
          body: input,
          auth: false,
        });
        return res.message ?? "تم تعيين كلمة مرور جديدة — سجّل الدخول بها.";
      },
    }),
    [session, loading, applyResponse, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
