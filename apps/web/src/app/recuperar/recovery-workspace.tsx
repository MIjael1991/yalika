"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type ApiPayload = {
  message?: string | string[];
  emailDeliveryAvailable?: boolean;
};

function messageOf(payload: ApiPayload | null, fallback: string) {
  if (Array.isArray(payload?.message)) return payload.message.join(". ");
  return payload?.message ?? fallback;
}

export function RecoveryWorkspace({ initialToken = "" }: { initialToken?: string }) {
  const [mode, setMode] = useState<"email" | "key">(initialToken ? "email" : "email");
  const [token] = useState(initialToken);
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(Boolean(initialToken));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  const passwordsMatch = useMemo(
    () => Boolean(confirmPassword) && newPassword === confirmPassword,
    [newPassword, confirmPassword],
  );

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/orion/auth/password/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;
      if (!response.ok) throw new Error(messageOf(payload, "No pudimos iniciar la recuperación."));
      setSent(true);
      setNotice(
        payload?.emailDeliveryAvailable === false
          ? "El correo automático todavía no está conectado. Si guardaste una clave de recuperación, usa esa opción; de lo contrario contacta al administrador de tu cuenta."
          : messageOf(payload, "Si el correo corresponde a una cuenta activa, recibirás instrucciones."),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar la recuperación.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword.length < 10) return setError("La nueva contraseña debe tener al menos 10 caracteres.");
    if (newPassword !== confirmPassword) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      const response = await fetch("/api/orion/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: token || undefined,
          email: token ? undefined : email.trim(),
          recoveryKey: token ? undefined : recoveryKey.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;
      if (!response.ok) throw new Error(messageOf(payload, "No pudimos cambiar la contraseña."));
      setDone(true);
      setNotice(messageOf(payload, "Contraseña actualizada. Ya puedes entrar a Yaleka."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-emerald-500/25 bg-slate-900 p-7">
          <div className="text-4xl" aria-hidden="true">✓</div>
          <h1 className="mt-4 text-2xl font-bold">Contraseña actualizada</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">{notice}</p>
          <Link href="/login" className="mt-6 flex h-12 items-center justify-center rounded-xl bg-cyan-400 font-semibold text-slate-950">
            Entrar a Yaleka
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Yaleka</p>
        <h1 className="mt-3 text-3xl font-bold">Recuperar acceso</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Puedes usar el enlace enviado a tu correo o la clave de recuperación que guardaste desde Mi cuenta.
        </p>

        {!token ? (
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
            <button type="button" onClick={() => { setMode("email"); setError(""); setNotice(""); }} className={`h-11 rounded-lg text-sm font-semibold ${mode === "email" ? "bg-cyan-400 text-slate-950" : "text-slate-300"}`}>
              Por correo
            </button>
            <button type="button" onClick={() => { setMode("key"); setError(""); setNotice(""); }} className={`h-11 rounded-lg text-sm font-semibold ${mode === "key" ? "bg-cyan-400 text-slate-950" : "text-slate-300"}`}>
              Con clave guardada
            </button>
          </div>
        ) : null}

        {error ? <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {notice ? <div aria-live="polite" className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">{notice}</div> : null}

        {!token && mode === "email" && !sent ? (
          <form onSubmit={requestReset} className="mt-6 space-y-4">
            <label className="block text-sm text-slate-300">
              Correo de tu cuenta
              <input type="email" autoComplete="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="nombre@correo.com" />
            </label>
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 disabled:opacity-60">
              {busy ? "Enviando…" : "Enviar instrucciones"}
            </button>
          </form>
        ) : null}

        {token || mode === "key" ? (
          <form onSubmit={resetPassword} className="mt-6 space-y-4">
            {!token ? (
              <>
                <label className="block text-sm text-slate-300">
                  Correo de tu cuenta
                  <input type="email" autoComplete="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" />
                </label>
                <label className="block text-sm text-slate-300">
                  Clave de recuperación
                  <input autoComplete="off" required value={recoveryKey} disabled={busy} onChange={(e) => setRecoveryKey(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 font-mono outline-none focus:border-cyan-400" placeholder="YALEKA-XXXX-XXXX-XXXX-XXXX-XXXX" />
                </label>
              </>
            ) : null}

            <label className="block text-sm text-slate-300">
              Nueva contraseña
              <div className="mt-2 flex rounded-xl border border-slate-700 bg-slate-950 focus-within:border-cyan-400">
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} disabled={busy} onChange={(e) => setNewPassword(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent px-4 outline-none" placeholder="Mínimo 10 caracteres" />
                <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)} className="min-w-16 px-3 text-sm font-semibold text-cyan-300">
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Confirmar contraseña
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} disabled={busy} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="Escríbela otra vez" />
              {confirmPassword ? <span className={`mt-2 block text-xs ${passwordsMatch ? "text-emerald-300" : "text-amber-300"}`}>{passwordsMatch ? "✓ Las contraseñas coinciden" : "Las contraseñas todavía no coinciden"}</span> : null}
            </label>
            <button type="submit" disabled={busy || !passwordsMatch} className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 disabled:opacity-50">
              {busy ? "Actualizando…" : "Cambiar contraseña"}
            </button>
          </form>
        ) : null}

        {!token && mode === "email" && sent ? (
          <div className="mt-5 text-sm text-slate-400">
            Revisa tu correo. Si no recibes nada y guardaste una clave de recuperación, puedes usarla.
          </div>
        ) : null}

        <Link href="/login" className="mt-7 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-300">← Volver a iniciar sesión</Link>
      </section>
    </main>
  );
}
