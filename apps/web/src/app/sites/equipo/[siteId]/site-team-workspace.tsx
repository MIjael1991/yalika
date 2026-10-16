'use client';

import { FormEvent, useMemo, useState } from 'react';

type Member = {
  id: string;
  role: string;
  status: string;
  userId: string;
  user: { id: string; name: string; email: string; status: string } | null;
};

type TeamData = {
  site: { id: string; name: string; slug: string };
  collaboratorLimit: number;
  members: Member[];
};

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  publisher: 'Publicador',
  viewer: 'Solo lectura',
};

async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(`/api/yalika/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'No se pudo completar');
  return data;
}

export function SiteTeamWorkspace({ initialData }: { initialData: TeamData }) {
  const [members, setMembers] = useState(initialData.members);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activeCollaborators = useMemo(() => members.filter((item) => item.role !== 'owner' && item.status === 'active').length, [members]);

  async function reload() {
    const response = await fetch(`/api/yalika/site-team/site/${initialData.site.id}`, { cache: 'no-store' });
    const body = await response.json();
    setMembers(body.members ?? []);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      await request(`site-team/site/${initialData.site.id}/members`, 'POST', { email, role });
      setEmail('');
      setMessage('Acceso agregado.');
      await reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo agregar'); }
    finally { setBusy(false); }
  }

  async function update(member: Member, changes: { role?: string; status?: string }) {
    setBusy(true); setMessage('');
    try {
      await request(`site-team/site/${initialData.site.id}/members/${member.id}`, 'PATCH', changes);
      await reload();
      setMessage('Permiso actualizado.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo actualizar'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.28em] text-violet-300">Yalika · Equipo</p><h1 className="mt-2 text-3xl font-black">{initialData.site.name}</h1><p className="mt-2 text-sm text-slate-400">Por ahora puedes agregar 1 colaborador. La tabla y permisos están preparados para ampliar a 10 o más después.</p></div><a href="/sites" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold">← Mis páginas</a></div>

        <section className="mt-7 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5">
          <div className="flex items-center justify-between"><h2 className="text-xl font-black">Accesos</h2><span className="rounded-full bg-violet-300/10 px-3 py-1 text-xs font-bold text-violet-200">{activeCollaborators} / {initialData.collaboratorLimit} colaborador</span></div>
          <div className="mt-5 space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="min-w-[190px] flex-1"><p className="font-black">{member.user?.name ?? 'Usuario'}</p><p className="text-xs text-slate-500">{member.user?.email ?? member.userId}</p></div>
                {member.role === 'owner' ? <span className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950">Propietario</span> : <select value={member.role} disabled={busy || member.status !== 'active'} onChange={(e) => void update(member, { role: e.target.value })} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"><option value="admin">Administrador</option><option value="editor">Editor</option><option value="publisher">Publicador</option><option value="viewer">Solo lectura</option></select>}
                {member.role !== 'owner' ? <button disabled={busy} onClick={() => void update(member, { status: member.status === 'active' ? 'inactive' : 'active' })} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold">{member.status === 'active' ? 'Desactivar' : 'Activar'}</button> : null}
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${member.status === 'active' ? 'bg-emerald-300/10 text-emerald-200' : 'bg-slate-500/10 text-slate-400'}`}>{member.status === 'active' ? 'Activo' : 'Inactivo'}</span>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={add} className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5">
          <h2 className="text-xl font-black">Agregar colaborador</h2>
          <p className="mt-1 text-xs text-slate-500">Debe ser un usuario Yalika activo del mismo negocio.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3" /><select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3"><option value="admin">Administrador</option><option value="editor">Editor</option><option value="publisher">Publicador</option><option value="viewer">Solo lectura</option></select><button disabled={busy || activeCollaborators >= initialData.collaboratorLimit} className="rounded-xl bg-violet-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40">Agregar</button></div>
        </form>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-slate-400"><div className="rounded-xl border border-white/10 p-3"><b className="text-white">Administrador</b><br/>Edita, publica y administra equipo.</div><div className="rounded-xl border border-white/10 p-3"><b className="text-white">Editor</b><br/>Diseño y contenido.</div><div className="rounded-xl border border-white/10 p-3"><b className="text-white">Publicador</b><br/>Puede publicar o pasar a borrador.</div><div className="rounded-xl border border-white/10 p-3"><b className="text-white">Lectura</b><br/>Consulta sin cambios.</div></section>
        {message ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm">{message}</p> : null}
      </div>
    </main>
  );
}
