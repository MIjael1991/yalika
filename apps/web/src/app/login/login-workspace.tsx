'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiError = {
  message?: string | string[];
};

function getMessage(payload: ApiError | null) {
  if (Array.isArray(payload?.message)) {
    return payload.message.join('. ');
  }

  return payload?.message ?? 'No se pudo iniciar sesión';
}

export function LoginWorkspace() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/orion/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as ApiError) : null;

      if (!response.ok) {
        throw new Error(getMessage(payload));
      }

      router.replace('/life');
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'No se pudo iniciar sesión',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
          ORION
        </p>
        <h1 className="mt-3 text-3xl font-bold">Bienvenido</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Ingresa para abrir tus espacios personales, familiares y de trabajo.
        </p>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={(event) => void login(event)} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">
            Correo
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="tu-correo@orion.local"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={10}
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="Mínimo 10 caracteres"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Verificando…' : 'Ingresar a ORION'}
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          ORION nunca guarda tu contraseña en texto. La sesión queda protegida
          en este navegador y puede cerrarse desde tu cuenta.
        </p>
      </section>
    </main>
  );
}
