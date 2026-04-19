'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
import { NNBtn, NNLogo } from '@/components/ui';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (!token) {
      setError('В ссылке нет токена. Запроси сброс пароля ещё раз.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'Ссылка устарела или неверна.');
      }
      setDone(true);
      setTimeout(() => router.replace('/auth/sign-in'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        width: 'min(420px, 100%)',
        background: 'var(--surface-1, #111517)',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: 20,
        padding: 28,
        boxShadow: 'var(--shadow-lg, 0 30px 80px rgba(0,0,0,0.5))',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <NNLogo />
        <span style={{ fontSize: 18, fontWeight: 600 }}>NeuroNexus</span>
      </div>
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Новый пароль</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        {done
          ? 'Готово. Сейчас отправим тебя на вход…'
          : 'Придумай новый пароль, минимум 8 символов.'}
      </p>

      {!done && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.3 }}>
              Новый пароль
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.3 }}>
              Повтори пароль
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>
        </>
      )}

      {error && (
        <div
          style={{
            color: '#ff8080',
            fontSize: 13,
            background: 'rgba(255, 128, 128, 0.08)',
            border: '1px solid rgba(255, 128, 128, 0.2)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          {error}
        </div>
      )}

      {!done && (
        <NNBtn type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? '…' : 'Сохранить пароль'}
        </NNBtn>
      )}

      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
        <Link href="/auth/sign-in" style={{ color: 'var(--lime-300)' }}>
          Назад к входу
        </Link>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2, #0b0f10)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text, #fff)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};
