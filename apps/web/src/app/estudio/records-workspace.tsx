"use client";
import { useCallback, useEffect, useState } from "react";
import { downloadBlob } from "../../lib/yalika-download";
import type { FileScope } from "../../lib/yalika-local-files";
import {
  TEMPLATES,
  addVisit,
  checkRecordFile,
  completeness,
  fichaPdf,
  newExpediente,
  openPending,
  packageEntries,
  safeName,
  setNotApplicable,
  templateById,
  togglePending,
  type Expediente,
  type RecordFile,
  type TemplateId,
} from "../../lib/yalika-records";
import { attachFile, deleteRecord, detachFile, listFiles, listRecords, saveRecord } from "../../lib/yalika-records-db";
import { zipTree } from "../../lib/yalika-zip";
import styles from "./studio.module.css";
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const today = () => new Date().toISOString().slice(0, 10);
const countsOf = (files: RecordFile[]) => {
  const c: Record<string, number> = {};
  for (const f of files) c[f.requirementId] = (c[f.requirementId] ?? 0) + 1;
  return c;
};
export function RecordsWorkspace({ scope }: { scope: FileScope }) {
  const [records, setRecords] = useState<Expediente[]>([]),
    [loaded, setLoaded] = useState(false),
    [openId, setOpenId] = useState(""),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = useCallback(
    () =>
      listRecords(scope)
        .then(setRecords)
        .catch((e) => setNotice(message(e)))
        .finally(() => setLoaded(true)),
    [scope],
  );
  useEffect(() => {
    let live = true;
    listRecords(scope)
      .then((r) => live && setRecords(r))
      .catch((e) => live && setNotice(message(e)))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [scope]);
  const current = records.find((r) => r.id === openId),
    shown = records.filter((r) => (r.folio + " " + r.name).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <section className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h1>Expedientes</h1>
          <p>Archivos, visitas y pendientes de cada escuela o persona. Se guardan solo en este dispositivo.</p>
        </div>
      </header>
      {notice && <p role="status">{notice}</p>}
      {current ? (
        <Detail
          key={current.id}
          scope={scope}
          record={current}
          onBack={() => setOpenId("")}
          onChange={(r) => setRecords((all) => all.map((x) => (x.id === r.id ? r : x)))}
          onDeleted={() => {
            setOpenId("");
            void refresh();
          }}
        />
      ) : creating ? (
        <Create
          scope={scope}
          folios={records.map((r) => r.folio)}
          onCancel={() => setCreating(false)}
          onCreated={(r) => {
            setRecords((all) => [...all, r]);
            setCreating(false);
            setOpenId(r.id);
          }}
        />
      ) : (
        <>
          {records.length > 0 && (
            <div className={styles.recordBar}>
              <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                + Nuevo expediente
              </button>
              <input
                type="search"
                aria-label="Buscar expediente"
                placeholder="Buscar por folio o nombre"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {!loaded ? (
            <p className={styles.help}>Cargando…</p>
          ) : !records.length ? (
            <div className={styles.emptyState}>
              <strong>Aún no hay expedientes</strong>
              <p>Crea uno por escuela o persona para guardar sus documentos, visitas y pendientes.</p>
              <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
                + Crear mi primer expediente
              </button>
            </div>
          ) : !shown.length ? (
            <p className={styles.help}>No hay coincidencias.</p>
          ) : (
            <ul className={styles.recordList}>
              {shown.map((r) => {
                const c = completeness(r, r.counts),
                  p = openPending(r).length;
                return (
                  <li key={r.id}>
                    <button type="button" className={styles.recordItem} onClick={() => setOpenId(r.id)}>
                      <span className={styles.recordTop}>
                        <strong>{r.name}</strong>
                        <span className={styles.badge}>{r.folio}</span>
                        {p > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{p} pendiente(s)</span>}
                      </span>
                      <span className={styles.recordMeta}>
                        {templateById(r.templateId)?.label ?? r.templateId}
                        {c.percent !== null && " · " + c.done + " de " + c.applicable + " documentos"}
                      </span>
                      {c.percent !== null && (
                        <span className={styles.progress} aria-hidden="true">
                          <span style={{ width: c.percent + "%" }} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
function Create({
  scope,
  folios,
  onCancel,
  onCreated,
}: {
  scope: FileScope;
  folios: string[];
  onCancel: () => void;
  onCreated: (r: Expediente) => void;
}) {
  const [tid, setTid] = useState<TemplateId>("escuela"),
    [name, setName] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    t = templateById(tid)!;
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const r = newExpediente(t, folios, name, fields, crypto.randomUUID(), new Date().toISOString());
      await saveRecord(scope, r);
      onCreated(r);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  return (
    <form
      className={styles.formCard}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className={styles.field}>
        Tipo de expediente
        <select
          value={tid}
          onChange={(e) => {
            setTid(e.target.value as TemplateId);
            setFields({});
          }}
        >
          {TEMPLATES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Nombre
        <input value={name} maxLength={160} required onChange={(e) => setName(e.target.value)} />
      </label>
      {t.fields.map((d) => (
        <label key={d.id} className={styles.field}>
          {d.label}
          <input
            value={fields[d.id] ?? ""}
            maxLength={200}
            onChange={(e) => setFields({ ...fields, [d.id]: e.target.value })}
          />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          Crear expediente
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
function Detail({
  scope,
  record,
  onBack,
  onChange,
  onDeleted,
}: {
  scope: FileScope;
  record: Expediente;
  onBack: () => void;
  onChange: (r: Expediente) => void;
  onDeleted: () => void;
}) {
  const [files, setFiles] = useState<RecordFile[] | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [visitId, setVisitId] = useState(""),
    [vDate, setVDate] = useState(today()),
    [vWho, setVWho] = useState(""),
    [vNotes, setVNotes] = useState(""),
    [vPending, setVPending] = useState(""),
    t = templateById(record.templateId),
    c = completeness(record, record.counts),
    pend = openPending(record);
  useEffect(() => {
    let live = true;
    listFiles(scope, record.id)
      .then((f) => live && setFiles(f))
      .catch((e) => live && (setNotice(message(e)), setFiles([])));
    return () => {
      live = false;
    };
  }, [scope, record.id]);
  async function guard(job: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await job();
    } catch (e) {
      setNotice(message(e));
    }
    setBusy(false);
  }
  const now = () => new Date().toISOString();
  const update = (job: () => Expediente) =>
    guard(async () => {
      const next = job();
      await saveRecord(scope, next);
      onChange(next);
    });
  const attach = (reqId: string, list: FileList | null) =>
    guard(async () => {
      let rec = record,
        all = files ?? [];
      for (const file of Array.from(list ?? [])) {
        const bad = checkRecordFile(file);
        if (bad) {
          setNotice(bad);
          continue;
        }
        const row: RecordFile = {
          id: crypto.randomUUID(),
          recordId: rec.id,
          requirementId: reqId,
          visitId,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          createdAt: now(),
          blob: file,
        };
        const nextFiles = [...all, row],
          next = { ...rec, counts: countsOf(nextFiles), updatedAt: now() };
        await attachFile(scope, row, next);
        rec = next;
        all = nextFiles;
        setFiles(nextFiles);
        onChange(next);
      }
    });
  const remove = (f: RecordFile) =>
    guard(async () => {
      if (!window.confirm("¿Quitar «" + f.name + "» de este dispositivo?")) return;
      const rest = (files ?? []).filter((x) => x.id !== f.id),
        next = { ...record, counts: countsOf(rest), updatedAt: now() };
      await detachFile(scope, f.id, next);
      setFiles(rest);
      onChange(next);
    });
  const exportAll = (zip: boolean) =>
    guard(async () => {
      const ficha = await fichaPdf(record, t, record.counts);
      if (!zip) return downloadBlob(new Blob([ficha as BlobPart], { type: "application/pdf" }), safeName(record.folio) + "-ficha.pdf");
      const withBytes = await Promise.all(
        (files ?? []).map(async (file) => ({ file, bytes: new Uint8Array(await file.blob.arrayBuffer()) })),
      );
      const zipped = zipTree(packageEntries(record, withBytes, ficha));
      downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), safeName(record.folio + " " + record.name) + ".zip");
    });
  const addNewVisit = () =>
    update(() =>
      addVisit(
        record,
        { date: vDate, who: vWho, notes: vNotes, pending: vPending.split("\n") },
        crypto.randomUUID(),
        now(),
      ),
    ).then(() => {
      setVWho("");
      setVNotes("");
      setVPending("");
    });
  return (
    <div>
      <div className={styles.detailHead}>
        <button type="button" onClick={onBack}>
          ← Expedientes
        </button>
        <div className={styles.actions} style={{ margin: 0 }}>
          <button type="button" disabled={busy} onClick={() => void exportAll(false)}>
            Ficha PDF
          </button>
          <button type="button" disabled={busy || !files} onClick={() => void exportAll(true)}>
            Paquete ZIP
          </button>
        </div>
      </div>
      <div className={styles.summary}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{record.name}</h2>
        <p className={styles.recordMeta}>
          {record.folio} · {t?.label}
        </p>
        {c.percent !== null && (
          <>
            <span className={styles.progress} aria-hidden="true">
              <span style={{ width: c.percent + "%" }} />
            </span>
            <p>
              <strong>{c.done}</strong> de {c.applicable} documentos obligatorios con archivo ({c.percent}%)
            </p>
          </>
        )}
        <p className={styles.help} style={{ margin: 0 }}>
          Tener archivo no significa que esté revisado.
        </p>
      </div>
      {notice && <p role="alert">{notice}</p>}
      {pend.length > 0 && (
        <div role="note" className={styles.pendingBox}>
          <strong>Pendientes para esta visita</strong>
          <ul>
            {pend.map(({ visit, item }) => (
              <li key={item.id}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={busy}
                    onChange={() => void update(() => togglePending(record, visit.id, item.id, now()))}
                  />
                  <span>
                    {item.text} <small>({visit.date})</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 className={styles.sectionTitle}>Documentos</h3>
      <div className={styles.card}>
        <label>
          Los archivos nuevos se guardan en la visita
          <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
            <option value="">Sin visita</option>
            {record.visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.date}
                {v.who && " · " + v.who}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className={styles.reqList}>
        {record.requirements.map((q) => {
          const na = record.na.includes(q.id),
            n = record.counts[q.id] ?? 0,
            mine = (files ?? []).filter((f) => f.requirementId === q.id);
          return (
            <li key={q.id} className={styles.reqRow}>
              <div className={styles.reqHead}>
                <span>
                  <strong>{q.label}</strong>
                  {!q.required && <span className={styles.recordMeta}> (opcional)</span>}
                </span>
                <span className={`${styles.badge} ${na ? "" : n > 0 ? styles.badgeOk : styles.badgeWarn}`}>
                  {na ? "No aplica" : n > 0 ? n + " archivo(s)" : "Falta"}
                </span>
              </div>
              {mine.length > 0 && (
                <div className={styles.reqFiles}>
                  {mine.map((f) => (
                    <div key={f.id} className={styles.fileLine}>
                      <span>
                        {f.name} <small>({Math.max(1, Math.round(f.size / 1024))} KB)</small>
                      </span>
                      <span className={styles.actions} style={{ margin: 0 }}>
                        <button type="button" onClick={() => downloadBlob(f.blob, f.name)}>
                          Descargar
                        </button>
                        <button type="button" disabled={busy} onClick={() => void remove(f)}>
                          Quitar
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.actions} style={{ margin: 0 }}>
                <label className={styles.import}>
                  + Agregar archivo
                  <input
                    type="file"
                    multiple
                    hidden
                    accept="image/*,.pdf"
                    disabled={busy || !files}
                    onChange={(e) => {
                      void attach(q.id, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={na}
                    disabled={busy}
                    onChange={(e) => void update(() => setNotApplicable(record, q.id, e.target.checked, now()))}
                  />
                  No aplica
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <h3 className={styles.sectionTitle}>Visitas</h3>
      {!record.visits.length && <p className={styles.help}>Sin visitas registradas.</p>}
      <div className={styles.reqList}>
        {record.visits.map((v) => (
          <div key={v.id} className={styles.visitCard}>
            <strong>
              {v.date}
              {v.who && " · " + v.who}
            </strong>
            {v.notes && <p>{v.notes}</p>}
            {v.pending.map((p) => (
              <label key={p.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={p.done}
                  disabled={busy}
                  onChange={() => void update(() => togglePending(record, v.id, p.id, now()))}
                />
                <span>{p.text}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <form
        className={styles.formCard}
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void addNewVisit();
        }}
      >
        <strong>Nueva visita</strong>
        <label className={styles.field}>
          Fecha
          <input type="date" required value={vDate} onChange={(e) => setVDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          Quién visitó
          <input value={vWho} maxLength={120} onChange={(e) => setVWho(e.target.value)} />
        </label>
        <label className={styles.field}>
          Notas
          <textarea value={vNotes} maxLength={4000} onChange={(e) => setVNotes(e.target.value)} />
        </label>
        <label className={styles.field}>
          Pendientes para la próxima visita (uno por línea)
          <textarea value={vPending} onChange={(e) => setVPending(e.target.value)} />
        </label>
        <button type="submit" className={styles.primary} disabled={busy}>
          Guardar visita
        </button>
      </form>
      <details className={styles.danger}>
        <summary>Más opciones</summary>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void guard(async () => {
              if (!window.confirm("¿Borrar el expediente " + record.folio + " y todos sus archivos de este dispositivo?")) return;
              await deleteRecord(scope, record.id);
              onDeleted();
            })
          }
        >
          Borrar expediente
        </button>
      </details>
    </div>
  );
}
