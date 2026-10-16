'use client';
import Link from "next/link";
import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiError = {
  message?: string | string[];
};

function safeInternalReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}
type LoginResponse = ApiError & {
  user?: {
    modules?: string[];
    homePath?: string;
  };
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [registerHref, setRegisterHref] = useState('/registro');

  useEffect(() => {
    const next = safeInternalReturnPath(
      new URLSearchParams(window.location.search).get('next'),
    );
    if (next) {
      setRegisterHref('/registro?next=' + encodeURIComponent(next));
    }
  }, []);
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
      let payload: LoginResponse | null = null;
      try { payload = text ? JSON.parse(text) as LoginResponse : null; } catch {
        throw new Error('El acceso no respondió correctamente. Reintenta; si continúa, revisa la conexión con Yaleka.');
      }
      if (response.ok && !payload?.user) throw new Error('No se pudo confirmar la sesión. Reintenta.');

      if (!response.ok) {
        throw new Error(getMessage(payload));
      }

      const requestedPath =
        typeof window === 'undefined'
          ? null
          : safeInternalReturnPath(
              new URLSearchParams(window.location.search).get('next'),
            );

      router.replace(requestedPath || (payload?.user?.modules?.includes('all') ? '/inicio' : payload?.user?.homePath) || '/');
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
          Yaleka
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
              placeholder="tu@correo.com"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Contraseña
            <input
              id="yaleka-login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="Tu contraseña"
            />
          </label>

          <div className="-mt-2 flex min-h-11 flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-controls="yaleka-login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
            >
              {showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            </button>
            <a href="/recuperar" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Verificando…' : 'Ingresar a Yaleka'}
          </button>
        </form>

        <section data-yaleka-register-cta="true" className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4 text-center">
          <p className="text-sm font-semibold text-slate-100">¿Primera vez en Yaleka?</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Crea una sola cuenta Yaleka y entra a los módulos que tengas disponibles.</p>
          <Link
            href={registerHref}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl border border-cyan-300/40 bg-slate-950 px-4 font-semibold text-cyan-200 transition hover:border-cyan-200 hover:bg-slate-900"
          >
            Crear cuenta gratis
          </Link>
        </section>


        <p className="mt-5 text-xs leading-5 text-slate-500">
          Yaleka nunca guarda tu contraseña en texto. La sesión queda protegida
          en este navegador y puede cerrarse desde tu cuenta.
        </p>
      </section>
    </main>
  );
}

