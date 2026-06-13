'use client';

import { useState } from 'react';
import Link from 'next/link';
// BetterAuth's endpoint name varies between versions — calling it via the
// SDK would lock us to a specific method name. A bare `fetch` to the REST
// path works on every version and needs zero type gymnastics.
const API_BASE =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';
import { NNBtn, NNLogo } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/reset-password`
          : '/auth/reset-password';
      const res = await fetch(`${API_BASE}/api/auth/forget-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), redirectTo }),
      });
      if (!res.ok && res.status !== 200 && res.status !== 204) {
        // Rate limit or validation — show a generic message so we don't leak
        // user-enumeration signals.
        if (res.status === 429) {
          throw new Error('Слишком много попыток. Подожди и попробуй ещё раз.');
        }
      }
      // Success is indistinguishable from "email doesn't exist" — intentional,
      // so we always show the sent-confirmation.
      setSent(true);
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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 28,
        boxShadow: 'var(--shadow-lg)',
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

      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Сброс пароля</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        {sent
          ? 'Если аккаунт с таким email существует, мы отправили ссылку для сброса. Проверь почту — письмо обычно приходит в течение минуты.'
          : 'Введи email, который ты использовал при регистрации. Мы пришлём ссылку для восстановления.'}
      </p>

      {!sent && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.3 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            style={inputStyle}
          />
        </label>
      )}

      {error && (
        <div
          style={{
            color: 'var(--rose-400)',
            fontSize: 13,
            background: 'var(--tone-rose-bg)',
            border: '1px solid var(--tone-rose-border)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          {error}
        </div>
      )}

      {!sent && (
        <NNBtn type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? '…' : 'Отправить ссылку'}
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
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};
