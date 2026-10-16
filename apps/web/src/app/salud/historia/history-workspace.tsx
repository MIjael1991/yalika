"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { careApi } from "../cuidado/care-api";
import { historyApi } from "./history-api";
import styles from "./history.module.css";
const fmt = (v?: string | null) =>
  v && Number.isFinite(new Date(v).getTime())
    ? new Date(v).toLocaleDateString("es-MX")
    : "Sin fecha";
const labels: Record<string, string> = {
  ACTIVE: "Activo",
  RESOLVED: "Resuelto",
  INACTIVE: "Inactivo",
  REMISSION: "En remisión",
  DOCUMENTED: "Documentado",
  REPORTED: "Reportado por la persona",
  CONFIRMED: "Confirmado",
  SUSPECTED: "Por confirmar",
  RULED_OUT: "Descartado",
  INFECTION: "Infección",
  ACUTE_ILLNESS: "Enfermedad temporal",
  INJURY: "Lesión",
  FRACTURE: "Fractura",
  HOSPITALIZATION: "Hospitalización",
  OTHER: "Otro",
  PRESCRIPTION: "Receta",
  LAB_RESULT: "Resultado de laboratorio",
  IMAGING: "Estudio de imagen",
  MEDICAL_REPORT: "Informe médico",
  CLINICAL_NOTE: "Nota clínica",
  UNVERIFIED: "Sin verificar",
  VERIFIED: "Verificado",
  PENDING: "Pendiente",
  REJECTED: "Rechazado",
};
const label = (value?: string | null) =>
  value ? (labels[value] ?? "Sin clasificación disponible") : "Sin especificar";
const privacyOf = (data: any, type: string, id: string) =>
  data?.privacy?.find(
    (p: any) => p.resourceType === type && p.resourceId === id,
  ) ?? null;
export default function HistoryWorkspace() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    historyApi
      .history()
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  const parents = useMemo(
    () => [
      ...(data?.conditions ?? []).map((x: any) => ({
        type: "CHRONIC_CONDITION",
        id: x.id,
        label: `Padecimiento: ${x.conditionName}`,
      })),
      ...(data?.episodes ?? []).map((x: any) => ({
        type: "EPISODE",
        id: x.id,
        label: `Episodio: ${x.title}`,
      })),
    ],
    [data],
  );
  const resources = useMemo(
    () => [
      ...(data?.documents ?? []).map((x: any) => ({
        type: "DOCUMENT",
        id: x.id,
        label: `Documento: ${x.title}`,
      })),
      ...(data?.prescriptions ?? []).map((x: any) => ({
        type: "PRESCRIPTION",
        id: x.id,
        label: `Receta: ${fmt(x.issuedAt)}`,
      })),
      ...(data?.procedures ?? []).map((x: any) => ({
        type: "PROCEDURE",
        id: x.id,
        label: `Procedimiento: ${x.procedureName}`,
      })),
    ],
    [data],
  );
  async function createEpisode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(form);
      await historyApi.createEpisode({
        episodeType: f.get("episodeType"),
        title: f.get("title"),
        bodyRegion: f.get("bodyRegion") || undefined,
        startedAt: f.get("startedAt")
          ? new Date(String(f.get("startedAt"))).toISOString()
          : undefined,
        notes: f.get("notes") || undefined,
      });
      form.reset();
      setNotice("Episodio agregado a tu historia.");
      await refresh();
    } catch (x: any) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function createCondition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(form);
      await careApi.createChronicCondition({
        conditionName: f.get("conditionName"),
        diagnosedAt: f.get("diagnosedAt")
          ? new Date(String(f.get("diagnosedAt"))).toISOString()
          : undefined,
        source: "PATIENT",
        confirmationStatus: "REPORTED",
      });
      form.reset();
      setNotice("Padecimiento agregado como reportado por ti.");
      await refresh();
    } catch (x: any) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function runAction(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }
  async function setPrivacy(
    type: string,
    id: string,
    current: any,
    field: "doctor" | "emergency",
  ) {
    const next = {
      sensitivity: current?.sensitivity ?? "STANDARD",
      shareWithVerifiedProfessional:
        field === "doctor"
          ? !current?.shareWithVerifiedProfessional
          : Boolean(current?.shareWithVerifiedProfessional),
      emergencyShare:
        field === "emergency"
          ? !current?.emergencyShare
          : Boolean(current?.emergencyShare),
    };
    await runAction(() =>
      historyApi.privacy({ resourceType: type, resourceId: id, ...next }),
    );
  }
  async function setSensitivity(
    type: string,
    id: string,
    value: string,
    current: any,
  ) {
    await runAction(() =>
      historyApi.privacy({
        resourceType: type,
        resourceId: id,
        sensitivity: value,
        shareWithVerifiedProfessional: Boolean(
          current?.shareWithVerifiedProfessional,
        ),
        emergencyShare: Boolean(current?.emergencyShare),
      }),
    );
  }
  async function link(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const [pt, pid] = String(f.get("parent")).split("|");
    const [rt, rid] = String(f.get("resource")).split("|");
    if (!pid || !rid) return;
    setBusy(true);
    try {
      await historyApi.link({
        parentType: pt,
        parentId: pid,
        resourceType: rt,
        resourceId: rid,
        relationType: f.get("relationType"),
      });
      setNotice("Documento relacionado con su problema de salud.");
      await refresh();
    } catch (x: any) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <h1>Mi historia</h1>
          <p role="status">{error || "Cargando tu historia…"}</p>
          {error && (
            <button className={styles.button} onClick={() => void refresh()}>
              Reintentar
            </button>
          )}
          <Link href="/salud">Volver a Mi salud</Link>
        </div>
      </main>
    );
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>YALEKA SALUD · MI HISTORIA</span>
            <h1>Tu salud, organizada por lo que te ha pasado.</h1>
            <p>
              No es una carpeta de archivos: padecimientos, infecciones,
              lesiones, fracturas, cirugías, estudios y recetas quedan
              relacionados.
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.button} href="/salud">
              Mi salud
            </Link>
            <Link className={styles.primary} href="/salud/emergencia">
              Emergencia y familia
            </Link>
          </div>
        </header>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        {notice && <div className={styles.warning}>{notice}</div>}
        <section className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.sectionTitle}>
              <h2>Padecimientos</h2>
              <span className={styles.meta}>Crónicos o de seguimiento</span>
            </div>
            <div className={styles.list}>
              {data?.conditions?.map((x: any) => {
                const p = privacyOf(data, "CHRONIC_CONDITION", x.id);
                return (
                  <div className={styles.item} key={x.id}>
                    <div className={styles.row}>
                      <div>
                        <strong>{x.conditionName}</strong>
                        <div className={styles.meta}>
                          {label(x.status)} · {label(x.confirmationStatus)} ·{" "}
                          {fmt(x.diagnosedAt)}
                        </div>
                      </div>
                      <select
                        disabled={busy}
                        aria-label="Privacidad del padecimiento"
                        value={p?.sensitivity ?? "STANDARD"}
                        onChange={(e) =>
                          void setSensitivity(
                            "CHRONIC_CONDITION",
                            x.id,
                            e.target.value,
                            p,
                          )
                        }
                      >
                        <option value="STANDARD">Normal</option>
                        <option value="SENSITIVE">Delicado</option>
                        <option value="RESTRICTED">Muy privado</option>
                      </select>
                    </div>
                    <div className={styles.chips}>
                      <button
                        disabled={busy}
                        className={styles.chip}
                        onClick={() =>
                          void setPrivacy(
                            "CHRONIC_CONDITION",
                            x.id,
                            p,
                            "doctor",
                          )
                        }
                      >
                        {p?.shareWithVerifiedProfessional
                          ? "✓ Médico"
                          : "Compartir con médico"}
                      </button>
                      <button
                        disabled={busy}
                        className={styles.chip}
                        onClick={() =>
                          void setPrivacy(
                            "CHRONIC_CONDITION",
                            x.id,
                            p,
                            "emergency",
                          )
                        }
                      >
                        {p?.emergencyShare
                          ? "✓ Emergencia"
                          : "No en emergencia"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {!data?.conditions?.length && (
                <p className={styles.empty}>
                  Aún no tienes padecimientos registrados.
                </p>
              )}
            </div>
            <form className={styles.form} onSubmit={createCondition}>
              <label>
                Padecimiento
                <input
                  name="conditionName"
                  required
                  placeholder="Ej. hipertensión, asma, VIH"
                />
              </label>
              <label>
                Fecha aproximada
                <input name="diagnosedAt" type="date" />
              </label>
              <button className={styles.primary} disabled={busy}>
                Agregar padecimiento
              </button>
            </form>
          </article>
          <article className={styles.card}>
            <div className={styles.sectionTitle}>
              <h2>Episodios, infecciones y lesiones</h2>
              <span className={styles.meta}>Cada evento por separado</span>
            </div>
            <div className={styles.list}>
              {data?.episodes?.map((x: any) => {
                const p = privacyOf(data, "EPISODE", x.id);
                return (
                  <div className={styles.item} key={x.id}>
                    <div className={styles.row}>
                      <div>
                        <strong>{x.title}</strong>
                        <div className={styles.meta}>
                          {label(x.episodeType)} · {label(x.status)} ·{" "}
                          {fmt(x.startedAt)}
                        </div>
                      </div>
                      {x.status === "ACTIVE" && (
                        <button
                          disabled={busy}
                          className={styles.button}
                          onClick={() =>
                            void runAction(() =>
                              historyApi.resolveEpisode(x.id),
                            )
                          }
                        >
                          Marcar resuelto
                        </button>
                      )}
                    </div>
                    <div className={styles.chips}>
                      <button
                        disabled={busy}
                        className={styles.chip}
                        onClick={() =>
                          void setPrivacy("EPISODE", x.id, p, "doctor")
                        }
                      >
                        {p?.shareWithVerifiedProfessional
                          ? "✓ Médico"
                          : "Compartir con médico"}
                      </button>
                      <button
                        disabled={busy}
                        className={styles.chip}
                        onClick={() =>
                          void setPrivacy("EPISODE", x.id, p, "emergency")
                        }
                      >
                        {p?.emergencyShare
                          ? "✓ Emergencia"
                          : "No en emergencia"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {!data?.episodes?.length && (
                <p className={styles.empty}>
                  Aquí aparecerán infecciones, fracturas, accidentes y otros
                  episodios.
                </p>
              )}
            </div>
            <form className={styles.form} onSubmit={createEpisode}>
              <label>
                Tipo
                <select name="episodeType">
                  <option value="INFECTION">Infección</option>
                  <option value="ACUTE_ILLNESS">Enfermedad temporal</option>
                  <option value="INJURY">Lesión / accidente</option>
                  <option value="FRACTURE">Fractura</option>
                  <option value="HOSPITALIZATION">Hospitalización</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label>
                Qué ocurrió
                <input
                  name="title"
                  required
                  placeholder="Ej. infección respiratoria"
                />
              </label>
              <label>
                Parte del cuerpo
                <input name="bodyRegion" placeholder="Opcional" />
              </label>
              <label>
                Fecha
                <input name="startedAt" type="date" />
              </label>
              <label>
                Nota
                <textarea name="notes" />
              </label>
              <button className={styles.primary} disabled={busy}>
                Agregar episodio
              </button>
            </form>
          </article>
        </section>
        <section className={styles.card}>
          <h2>Relacionar receta, estudio o documento</h2>
          <p className={styles.meta}>
            La receta física sigue siendo el documento original. Yaleka sólo la
            relaciona con el padecimiento o episodio correcto; no inventa el
            diagnóstico.
          </p>
          <form className={styles.linker} onSubmit={link}>
            <select name="parent" required>
              <option value="">¿A qué pertenece?</option>
              {parents.map((x: any) => (
                <option key={x.type + x.id} value={`${x.type}|${x.id}`}>
                  {x.label}
                </option>
              ))}
            </select>
            <select name="resource" required>
              <option value="">Documento o receta</option>
              {resources.map((x: any) => (
                <option key={x.type + x.id} value={`${x.type}|${x.id}`}>
                  {x.label}
                </option>
              ))}
            </select>
            <select name="relationType">
              <option value="EVIDENCE">Evidencia / estudio</option>
              <option value="TREATMENT">Tratamiento / receta</option>
              <option value="FOLLOW_UP">Seguimiento</option>
              <option value="RELATED">Relacionado</option>
            </select>
            <button className={styles.primary} disabled={busy}>
              Relacionar
            </button>
          </form>
        </section>
        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Recetas y estudios guardados</h2>
            <div className={styles.list}>
              {data?.documents?.slice(0, 12).map((d: any) => (
                <div className={styles.item} key={d.id}>
                  <strong>{d.title}</strong>
                  <div className={styles.meta}>
                    {label(d.documentType)} ·{" "}
                    {fmt(d.clinicalDate ?? d.createdAt)} ·{" "}
                    {label(d.verificationStatus)}
                  </div>
                </div>
              ))}
              {!data?.documents?.length && (
                <p className={styles.empty}>
                  Aún no tienes documentos guardados.
                </p>
              )}
            </div>
          </article>
          <article className={styles.card}>
            <h2>Cirugías y procedimientos</h2>
            <div className={styles.list}>
              {data?.procedures?.slice(0, 12).map((p: any) => (
                <div className={styles.item} key={p.id}>
                  <strong>{p.procedureName}</strong>
                  <div className={styles.meta}>
                    {fmt(p.occurredAt)} ·{" "}
                    {p.hospitalName ?? "Sin institución registrada"}
                  </div>
                </div>
              ))}
              {!data?.procedures?.length && (
                <p className={styles.empty}>Sin procedimientos registrados.</p>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
