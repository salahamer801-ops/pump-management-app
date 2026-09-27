/**
 * شاشة دخول محلية (localStorage) — نسخة مستقلة عن شاشة الدخول العاملة على الخادم
 * (`src/screens/LoginScreen.tsx`). تستخدم `src/lib/auth.ts` فقط.
 *
 * تنبيه: هذه الشاشة غير مربوطة بأي مسار في التطبيق حتى الآن: من يستوردها هو من
 * يحدّد متى تظهر. لا تعمل في نفس وقت شاشة الدخول الخادمية على نفس الشاشة.
 */
import { useEffect, useState } from 'react';
import { loginUser, registerUser } from '../lib/auth';
import type { AuthSession } from '../types';

interface Props {
  onLogin: (session: AuthSession) => void;
}

type Mode = 'login' | 'register-manager' | 'register-user' | 'forgot';

export default function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  /** إعلان مسؤول النظام العام (إن وُجد اتصال) */
  const [announcement, setAnnouncement] = useState<{
    active: boolean;
    tone: 'info' | 'warn' | 'danger';
    text: string;
  } | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.announcement) setAnnouncement(data.announcement);
      })
      .catch(() => {
        /* بلا اتصال: الوضع المحلي يعمل كما هو */
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!phone || !password) {
      setError('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }
    setLoading(true);
    const result = await loginUser(phone, password);
    setLoading(false);
    if (result.success && result.session) {
      onLogin(result.session);
    } else {
      setError(result.error || 'خطأ في تسجيل الدخول');
    }
  };

  const handleRegister = async (accountType: 'manager' | 'shareholder') => {
    setError('');
    if (!name || !phone || !password || !confirmPassword) {
      setError('يرجى تعبئة جميع الحقول');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }
    if (!/^[0-9]{9,15}$/.test(phone)) {
      setError('رقم الهاتف غير صحيح');
      return;
    }
    setLoading(true);
    const result = await registerUser(name, phone, password, accountType);
    setLoading(false);
    if (result.success) {
      setSuccess('تم إنشاء الحساب بنجاح، يمكنك تسجيل الدخول الآن');
      setMode('login');
      setName('');
      setPassword('');
      setConfirmPassword('');
    } else {
      setError(result.error || 'خطأ في إنشاء الحساب');
    }
  };

  const reset = () => {
    setError('');
    setSuccess('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setName('');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6">
        <h1 className="text-2xl font-bold text-green-700 text-center mb-1">تنظيم المضخات</h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          {mode === 'login' && 'تسجيل الدخول'}
          {mode === 'register-manager' && 'إنشاء حساب مسؤول'}
          {mode === 'register-user' && 'إنشاء حساب مساهم'}
          {mode === 'forgot' && 'استعادة كلمة المرور'}
        </p>

        {announcement?.active && announcement.text.trim() ? (
          <div
            data-testid="local-announcement"
            className={`text-sm rounded-lg p-3 mb-4 text-center font-bold ${
              announcement.tone === 'danger'
                ? 'bg-red-50 text-red-700'
                : announcement.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-sky-50 text-sky-800'
            }`}
          >
            {announcement.text}
          </div>
        ) : null}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4 text-center">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4 text-center">{success}</div>
        )}

        {mode === 'login' && (
          <>
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-green-600 text-white rounded-lg p-3 font-bold mb-3 disabled:opacity-50"
            >
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
            <div className="flex justify-between text-sm text-green-700 mt-2">
              <button
                onClick={() => {
                  reset();
                  setMode('register-manager');
                }}
              >
                إنشاء حساب مسؤول
              </button>
              <button
                onClick={() => {
                  reset();
                  setMode('forgot');
                }}
              >
                نسيت كلمة المرور؟
              </button>
            </div>
            <div className="text-center mt-2">
              <button
                onClick={() => {
                  reset();
                  setMode('register-user');
                }}
                className="text-sm text-gray-500 underline"
              >
                إنشاء حساب مساهم
              </button>
            </div>
          </>
        )}

        {(mode === 'register-manager' || mode === 'register-user') && (
          <>
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="الاسم الكامل"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
            />
            <button
              onClick={() => handleRegister(mode === 'register-manager' ? 'manager' : 'shareholder')}
              disabled={loading}
              className="w-full bg-green-600 text-white rounded-lg p-3 font-bold mb-3 disabled:opacity-50"
            >
              {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
            </button>
            <button
              onClick={() => {
                reset();
                setMode('login');
              }}
              className="w-full text-sm text-gray-500 underline"
            >
              العودة لتسجيل الدخول
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className="text-gray-600 text-sm text-center mb-4">أدخل رقم هاتفك وسيتم التحقق من هويتك</p>
            <input
              className="w-full border rounded-lg p-3 mb-3 text-right"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
            <p className="text-xs text-gray-400 text-center mb-3">
              ميزة استعادة كلمة المرور ستكون متاحة بعد إضافة الـ Backend
            </p>
            <button
              onClick={() => {
                reset();
                setMode('login');
              }}
              className="w-full text-sm text-gray-500 underline"
            >
              العودة لتسجيل الدخول
            </button>
          </>
        )}
      </div>
    </div>
  );
}
