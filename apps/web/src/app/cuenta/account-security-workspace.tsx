"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SecurityStatus = {
  email?: string;
  emailDeliveryAvailable?: boolean;
  recoveryKeyConfigured?: boolean;
  recoveryKeyUpdatedAt?: string | null;
  passwordChangedAt?: string | null;
  passwordMinLength?: number;
};

type ApiError = { message?: string | string[] };

function messageOf(payload: ApiError | null, fallback: string) {
  if (Array.isArray(payload?.message)) return payload.message.join(". ");
  return payload?.message ?? fallback;
}

export function AccountSecurityWorkspace() {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [closeOtherSessions, setCloseOtherSessions] = useState(true);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadStatus() {
    const response = await fetch("/api/orion/auth/security", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageOf(payload, "No pudimos cargar tu cuenta."));
    setStatus(payload as SecurityStatus);
  }

  useEffect(() => {
    let active = true;

    fetch("/api/orion/auth/security", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(messageOf(payload, "No pudimos cargar tu cuenta."));
        }
        return payload as SecurityStatus;
      })
      .then((payload) => {
        if (active && payload) setStatus(payload);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "No pudimos cargar tu cuenta.");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword.length < 10) return setError("La nueva contraseña debe tener al menos 10 caracteres.");
    if (newPassword !== confirmPassword) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      const response = await fetch("/api/orion/auth/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword, closeOtherSessions }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "No pudimos cambiar la contraseña."));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(messageOf(payload, "Contraseña actualizada."));
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  async function generateRecoveryKey() {
    const ok = window.confirm(
      status?.recoveryKeyConfigured
        ? "Esto reemplazará tu clave de recuperación anterior. ¿Continuar?"
        : "Yaleka mostrará la clave una sola vez. ¿Generarla ahora?",
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    setRecoveryKey("");
    try {
      const response = await fetch("/api/orion/auth/recovery-key", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageOf(payload, "No pudimos crear la clave."));
      setRecoveryKey(String(payload?.recoveryKey ?? ""));
      setNotice(String(payload?.warning ?? "Guarda la clave en un lugar seguro."));
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear la clave.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryKey() {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setNotice("✓ Clave copiada. Guárdala fuera de este equipo.");
    } catch {
      setNotice("Mantén presionada la clave para copiarla manualmente.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-slate-100 sm:px-6">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Mi cuenta</p>
        <h1 className="mt-2 text-3xl font-black">Seguridad y acceso</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Cambia tu contraseña, cierra sesiones antiguas y guarda una clave de recuperación para no perder el acceso.
        </p>
      </div>

      {error ? <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div aria-live="polite" className="mb-5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">{notice}</div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-slate-400">Por seguridad debes escribir tu contraseña actual.</p>
          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <label className="block text-sm text-slate-300">
              Contraseña actual
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={currentPassword} disabled={busy} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" />
            </label>
            <label className="block text-sm text-slate-300">
              Nueva contraseña
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} disabled={busy} onChange={(e) => setNewPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" placeholder="Mínimo 10 caracteres" />
            </label>
            <label className="block text-sm text-slate-300">
              Confirmar nueva contraseña
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={confirmPassword} disabled={busy} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400" />
              {confirmPassword ? <span className={`mt-2 block text-xs ${newPassword === confirmPassword ? "text-emerald-300" : "text-amber-300"}`}>{newPassword === confirmPassword ? "✓ Las contraseñas coinciden" : "Las contraseñas no coinciden"}</span> : null}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="h-5 w-5" />
              Mostrar contraseñas mientras escribo
            </label>
            <label className="flex min-h-11 items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={closeOtherSessions} onChange={(e) => setCloseOtherSessions(e.target.checked)} className="mt-1 h-5 w-5" />
              <span><strong className="block text-slate-200">Cerrar sesión en otros dispositivos</strong><span className="text-slate-500">Recomendado si compartiste equipo o sospechas que alguien conoce tu contraseña.</span></span>
            </label>
            <button type="submit" disabled={busy || !currentPassword || newPassword.length < 10 || newPassword !== confirmPassword} className="h-12 w-full rounded-xl bg-cyan-400 font-semibold text-slate-950 disabled:opacity-50">
              {busy ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-xl font-bold">Recuperación de cuenta</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Guarda una clave fuera de Yaleka. Sirve como respaldo si pierdes acceso al correo.
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3"><dt className="text-slate-500">Correo</dt><dd className="break-all text-right text-slate-200">{status?.email ?? "…"}</dd></div>
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3"><dt className="text-slate-500">Recuperación por correo</dt><dd className="text-right text-slate-200">{status?.emailDeliveryAvailable ? "Disponible" : "Pendiente de configurar"}</dd></div>
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3"><dt className="text-slate-500">Clave de recuperación</dt><dd className="text-right text-slate-200">{status?.recoveryKeyConfigured ? "Configurada" : "No configurada"}</dd></div>
          </dl>

          {recoveryKey ? (
            <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Guárdala ahora</p>
              <code className="mt-3 block select-all break-all text-lg font-bold text-white">{recoveryKey}</code>
              <button type="button" onClick={() => void copyRecoveryKey()} className="mt-4 min-h-11 rounded-lg border border-amber-300/30 px-4 text-sm font-semibold text-amber-100">Copiar clave</button>
            </div>
          ) : null}

          <button type="button" disabled={busy} onClick={() => void generateRecoveryKey()} className="mt-5 min-h-12 w-full rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50">
            {status?.recoveryKeyConfigured ? "Generar una clave nueva" : "Crear clave de recuperación"}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">Si usas la clave para recuperar tu cuenta, se invalida y tendrás que crear otra después de entrar.</p>
        </section>
      </div>
    </main>
  );
}
