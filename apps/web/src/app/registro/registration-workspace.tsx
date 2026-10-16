'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

type ApiError = { message?: string | string[] };

function safeInternalReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}
type RegisterResponse = ApiError & {
  ok?: boolean;
  user?: { email?: string };
};

function messageFrom(payload: ApiError | null) {
  if (Array.isArray(payload?.message)) return payload.message.join('. ');
  return payload?.message ?? 'No pudimos crear la cuenta.';
}

export function RegistrationWorkspace() {
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginHref, setLoginHref] = useState('/login');

  useEffect(() => {
    const next = safeInternalReturnPath(
      new URLSearchParams(window.location.search).get('next'),
    );
    if (next) {
      setLoginHref('/login?next=' + encodeURIComponent(next));
    }
  }, []);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseÃ±as no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/yalika/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          organizationName: organizationName.trim(),
          email: email.trim(),
          password,
          confirmPassword,
          acceptTerms,
        }),
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as RegisterResponse) : null;

      if (!response.ok) throw new Error(messageFrom(payload));
      setCreated(true);
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : 'No pudimos crear la cuenta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-emerald-500/20 bg-slate-900 p-7 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Yalika</p>
          <h1 className="mt-3 text-3xl font-bold">Cuenta creada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Ya puedes ingresar y abrir el mÃ³dulo de Encuestas. Desde la misma cuenta iremos activando otros mÃ³dulos de Yalika cuando correspondan.
          </p>
          <Link
            href={loginHref}
            className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-cyan-400 px-4 font-semibold text-slate-950 hover:bg-cyan-300"
          >
            Ingresar a Yalika
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Yalika</p>
        <h1 className="mt-3 text-3xl font-bold">Crear cuenta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          RegÃ­strate para crear, publicar y consultar tus encuestas en lÃ­nea.
        </p>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={(event) => void register(event)} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">
            Tu nombre
            <input
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              value={name}
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="Ej. Daniel Serrato"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Negocio, organizaciÃ³n o proyecto
            <input
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              value={organizationName}
              disabled={submitting}
              onChange={(event) => setOrganizationName(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="Ej. Proyecto comunitario"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Correo
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="tu-correo@ejemplo.com"
            />
          </label>

          <label className="block text-sm text-slate-300">
            ContraseÃ±a
            <input
              id="yalika-register-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="10 caracteres o mÃ¡s"
            />
          </label>

          <label className="block text-sm text-slate-300">
            Confirmar contraseÃ±a
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              disabled={submitting}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
              placeholder="Repite tu contraseÃ±a"
            />
          </label>

          <button
            type="button"
            aria-controls="yalika-register-password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
          >
            {showPassword ? 'Ocultar contraseÃ±as' : 'Mostrar contraseÃ±as'}
          </button>

          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
            <input
              type="checkbox"
              required
              checked={acceptTerms}
              disabled={submitting}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>Acepto crear una cuenta Yalika y soy responsable de la informaciÃ³n que capture en mis encuestas.</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Creando cuentaâ€¦' : 'Crear cuenta Yalika'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          Â¿Ya tienes cuenta?{' '}
          <Link href={loginHref} className="font-semibold text-cyan-300 hover:text-cyan-200">
            Ingresar
          </Link>
        </p>
      </section>
    </main>
  );
}

