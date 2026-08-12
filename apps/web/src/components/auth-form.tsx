'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, signUp } from '@/lib/auth';
import { NNBtn, NNLogo } from './ui';
import { AppLink, useAppNavigation } from './navigation';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useAppNavigation();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignIn = mode === 'sign-in';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignIn) {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
      } else {
        const res = await signUp.email({ email, password, name: name || email.split('@')[0] });
        if (res.error) throw new Error(res.error.message);
      }
      const next = searchParams.get('next') || '/';
      router.replace(next);
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
        borderRadius: 'var(--r-lg, 20px)',
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

      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
        {isSignIn ? 'С возвращением' : 'Создай аккаунт'}
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        {isSignIn
          ? 'Войди, чтобы продолжить выращивать свой сад знаний.'
          : 'Начни с нуля — пара полей, и карточки ждут тебя.'}
      </p>

      {!isSignIn && (
        <Field
          label="Имя"
          type="text"
          value={name}
          onChange={setName}
          placeholder="Как тебя звать"
          autoComplete="name"
        />
      )}
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <Field
        label="Пароль"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={isSignIn ? '••••••••' : 'Минимум 8 символов'}
        autoComplete={isSignIn ? 'current-password' : 'new-password'}
        required
        minLength={8}
      />

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

      <NNBtn type="submit" variant="primary" size="lg" disabled={loading}>
        {loading ? '…' : isSignIn ? 'Войти' : 'Зарегистрироваться'}
      </NNBtn>

      <div
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {isSignIn ? (
          <>
            <span>
              Нет аккаунта?{' '}
              <AppLink href="/auth/sign-up" style={{ color: 'var(--accent-300)' }}>
                Создать
              </AppLink>
            </span>
            <AppLink
              href="/auth/forgot-password"
              style={{ color: 'var(--text-dim)', fontSize: 12 }}
            >
              Забыл пароль?
            </AppLink>
          </>
        ) : (
          <span>
            Уже есть аккаунт?{' '}
            <AppLink href="/auth/sign-in" style={{ color: 'var(--accent-300)' }}>
              Войти
            </AppLink>
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.3 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 12px',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
          transition: 'border-color 120ms ease',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-400)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </label>
  );
}
