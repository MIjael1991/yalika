'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  role: { name: string } | null;
  /** Permisos extra que le dio el administrador. */
  permissions?: string[];
};

/** Lo que el administrador puede activar a cada cajero, además de vender y cobrar. */
const EXTRA_PERMISSIONS = [
  { id: 'returns', label: 'Devoluciones y cambios' },
  { id: 'refunds', label: 'Reembolsos (devolver dinero)' },
  { id: 'discounts', label: 'Descuentos escritos a mano' },
  { id: 'reports', label: 'Reportes de ventas e inventario' },
] as const;

function messageOf(payload: unknown) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return 'No fue posible completar la operación';
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const text = await response.text();
  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) throw new Error(messageOf(payload));
  return payload as T;
}

function isCashier(member: TeamMember) {
  return (member.role?.name ?? '').trim().toLowerCase() === 'cajero';
}

function formatDate(value: string | null) {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400';

export function TeamWorkspace({
  currentUserId,
  initialMembers,
  initialError,
}: {
  currentUserId: string;
  initialMembers: TeamMember[];
  initialError: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [passwordFor, setPasswordFor] = useState<TeamMember>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  async function refresh() {
    setMembers(await apiRequest<TeamMember[]>('team'));
  }

  async function run(action: () => Promise<void>, success: string) {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createCashier(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiRequest('team/cashiers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ name: '', email: '', password: '', confirmPassword: '' });
    }, 'Cajero creado. Ya puede iniciar sesión con su correo y contraseña.');
  }

  async function setStatus(member: TeamMember, status: 'active' | 'inactive') {
    await run(
      () =>
        apiRequest(`team/cashiers/${member.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }).then(() => undefined),
      status === 'inactive'
        ? `${member.name} ya no puede entrar. Sus sesiones abiertas se cerraron.`
        : `${member.name} puede entrar de nuevo.`,
    );
  }

  async function togglePermission(member: TeamMember, permission: string) {
    const current = member.permissions ?? [];
    const next = current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission];

    await run(
      () =>
        apiRequest(`team/cashiers/${member.id}/permissions`, {
          method: 'PATCH',
          body: JSON.stringify({ permissions: next }),
        }).then(() => undefined),
      `Permisos de ${member.name} actualizados.`,
    );
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordFor) return;
    const target = passwordFor;

    await run(async () => {
      await apiRequest(`team/cashiers/${target.id}/password`, {
        method: 'POST',
        body: JSON.stringify({
          password: newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      setPasswordFor(undefined);
      setNewPassword('');
      setConfirmNewPassword('');
    }, `Contraseña de ${target.name} cambiada. Sus sesiones anteriores se cerraron.`);
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              Yalika / Punto de venta
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Equipo y cajeros</h1>
          </div>
          <Link
            href="/pos"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 hover:border-cyan-400/50"
          >
            ← Regresar a Punto de venta
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1100px] gap-5 p-4 md:p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={createCashier}
          className="h-fit rounded-3xl border border-slate-800 bg-slate-900/70 p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Nuevo cajero
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            El cajero vende y cobra. No puede cambiar productos, inventario ni
            promociones. Después de crearlo puedes darle permisos extra, uno por
            uno: devoluciones, reembolsos, descuentos o reportes.
          </p>

          <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="cashierName">
            Nombre
          </label>
          <input
            id="cashierName"
            required
            minLength={2}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="cashierEmail">
            Correo (con el que entrará)
          </label>
          <input
            id="cashierEmail"
            type="email"
            required
            autoComplete="off"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="cashierPassword">
            Contraseña (mínimo 10 caracteres)
          </label>
          <input
            id="cashierPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className={inputClass}
          />

          <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="cashierConfirm">
            Repite la contraseña
          </label>
          <input
            id="cashierConfirm"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) =>
              setForm({ ...form, confirmPassword: event.target.value })
            }
            className={inputClass}
          />

          <button
            type="submit"
            disabled={saving}
            className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            Crear cajero
          </button>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Personas con acceso</h2>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
              {members.length}
            </span>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" role="status">
              {notice}
            </p>
          ) : null}

          <ul className="mt-4 divide-y divide-slate-800">
            {members.map((member) => {
              const cashier = isCashier(member);
              const active = member.status === 'active';

              return (
                <li key={member.id} className="flex flex-col gap-3 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.name}
                      {member.id === currentUserId ? (
                        <span className="ml-2 text-xs text-slate-500">(tú)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-slate-400">{member.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {cashier ? 'Cajero' : (member.role?.name ?? 'Administrador')}
                      {' · '}
                      {active ? 'Activo' : 'Desactivado'}
                      {' · Último acceso: '}
                      {formatDate(member.lastLoginAt)}
                    </p>
                  </div>

                  {cashier ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setPasswordFor(member);
                          setError('');
                          setNotice('');
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50 disabled:opacity-60"
                      >
                        Cambiar contraseña
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setStatus(member, active ? 'inactive' : 'active')}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-amber-400/50 disabled:opacity-60"
                      >
                        {active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  ) : null}
                  </div>

                  {cashier ? (
                    <fieldset
                      className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3"
                      disabled={saving}
                    >
                      <legend className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Permisos extra de {member.name}
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {EXTRA_PERMISSIONS.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm text-slate-200"
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-cyan-400"
                              checked={(member.permissions ?? []).includes(
                                permission.id,
                              )}
                              onChange={() =>
                                void togglePermission(member, permission.id)
                              }
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {passwordFor ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={resetPassword}
            className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <h2 className="text-xl font-semibold">Nueva contraseña</h2>
            <p className="mt-2 text-sm text-slate-400">
              Para {passwordFor.name}. Sus sesiones abiertas se cerrarán.
            </p>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Mínimo 10 caracteres"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              className={inputClass}
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPasswordFor(undefined)}
                className="h-12 flex-1 rounded-xl border border-slate-700 text-slate-200 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-12 flex-1 rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
