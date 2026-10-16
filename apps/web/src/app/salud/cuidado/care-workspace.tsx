"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { clinicalApi } from "../clinical-api";
import { careApi } from "./care-api";
import {
  deleteOfflineFile,
  getOfflineFile,
  saveOfflineFile,
} from "./offline-store";
import styles from "./cuidado.module.css";

const OFFLINE_KEY = "yalika:clinical:r29:offline-queue:v2";

function fmt(value?: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function operationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readQueue(scope: string) {
  if (!scope) return [] as any[];
  if (typeof window === "undefined") return [] as any[];
  try {
    const value = JSON.parse(
      localStorage.getItem(`${OFFLINE_KEY}:${scope}`) ?? "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueue(scope: string, value: any[]) {
  if (!scope)
    throw new Error("No se pudo verificar la cuenta para guardar pendientes");
  if (typeof window !== "undefined")
    localStorage.setItem(`${OFFLINE_KEY}:${scope}`, JSON.stringify(value));
}

export default function CareWorkspace() {
  const scope = useRef("");
  const syncing = useRef(false);
  async function verifyAccount() {
    const response = await fetch("/api/yalika/auth/me", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Inicia sesión para sincronizar tus pendientes");
    const { user } = await response.json();
    if (!user?.id || !user?.companyId)
      throw new Error("No se pudo verificar tu cuenta");
    const next =
      encodeURIComponent(user.companyId) + ":" + encodeURIComponent(user.id);
    if (scope.current && scope.current !== next)
      throw new Error(
        "La cuenta cambió. Recarga la página antes de continuar.",
      );
    scope.current = next;
  }
  const [overview, setOverview] = useState<any>(null);
  const [regimens, setRegimens] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [senior, setSenior] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [capture, setCapture] = useState<any>(null);
  const [captureText, setCaptureText] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [qrResult, setQrResult] = useState<any>(null);
  const [qrData, setQrData] = useState("");
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);

  async function refresh() {
    const [o, r, requests, activeGrants] = await Promise.all([
      careApi.home(),
      careApi.regimens(),
      clinicalApi.accessRequests(),
      clinicalApi.grants(),
    ]);
    setOverview(o);
    setRegimens(r);
    setAccessRequests(requests);
    setGrants(activeGrants);
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueued(readQueue(scope.current).length);
    const handleOnline = () => {
      setOnline(true);
      void syncQueue();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void verifyAccount()
      .then(() => {
        setQueued(readQueue(scope.current).length);
        return refresh();
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No fue posible cargar Salud",
        ),
      );
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!qrResult?.relativePath) {
      setQrData("");
      return;
    }
    QRCode.toDataURL(`${window.location.origin}${qrResult.relativePath}`, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then(setQrData)
      .catch(() => setQrData(""));
  }, [qrResult]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = overview?.today?.nextMedication;
      if (
        !next?.nextDoseAt ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      )
        return;
      const due = new Date(next.nextDoseAt).getTime();
      const now = Date.now();
      if (due > now + 60_000 || due < now - 10 * 60_000) return;
      const key = `yalika:clinical:notified:${next.id}:${next.nextDoseAt}`;
      if (localStorage.getItem(key)) return;
      new Notification("Yalika Salud", {
        body: "Tienes una dosis registrada para este momento. Revisa el tratamiento antes de marcarla.",
      });
      localStorage.setItem(key, "1");
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [overview]);

  const important = overview?.important ?? {
    allergies: [],
    restrictions: [],
    currentMedications: [],
  };
  const nextMedication = overview?.today?.nextMedication;
  const nextConsultation = overview?.today?.nextConsultation;
  const followUps = overview?.followUpProposals ?? [];

  async function queueOrRun(
    kind: string,
    payload: any,
    runner: () => Promise<any>,
  ) {
    if (!scope.current)
      throw new Error(
        "Abre Salud con conexión antes de guardar pendientes sin conexión",
      );
    if (navigator.onLine) await verifyAccount();
    const opId = payload.operationId ?? operationId();
    const finalPayload = { ...payload, operationId: opId };
    if (!navigator.onLine || payload.offlineFile) {
      const next = [
        ...readQueue(scope.current),
        { operationId: opId, kind, payload: finalPayload },
      ];
      writeQueue(scope.current, next);
      setQueued(next.length);
      setNotice(
        "Guardado en este dispositivo. Se sincronizará cuando vuelva Internet.",
      );
      return { queued: true };
    }
    try {
      return await runner();
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      const next = [
        ...readQueue(scope.current),
        { operationId: opId, kind, payload: finalPayload },
      ];
      writeQueue(scope.current, next);
      setQueued(next.length);
      setNotice("No hubo conexión estable. La operación quedó en cola segura.");
      return { queued: true, error: e };
    }
  }

  async function syncQueue() {
    if (syncing.current || !scope.current || !navigator.onLine) return;
    syncing.current = true;
    const queue = readQueue(scope.current);
    const prepared: any[] = [];
    try {
      await verifyAccount();
      if (!queue.length) return;
      for (const operation of queue) {
        const next = { ...operation, payload: { ...operation.payload } };
        if (next.kind === "CAPTURE_CREATE" && next.payload.offlineFile) {
          const stored = await getOfflineFile(scope.current, next.operationId);
          if (!stored?.file)
            throw new Error(
              "Falta un archivo pendiente. No se enviará una captura incompleta",
            );
          const upload = new FormData();
          upload.set("file", stored.file);
          upload.set(
            "title",
            stored.metadata?.title || stored.file.name || "Consulta",
          );
          upload.set(
            "documentType",
            stored.metadata?.sourceType === "PHOTO"
              ? "PRESCRIPTION"
              : "CLINICAL_NOTE",
          );
          const uploaded: any = await clinicalApi.uploadDocument(upload);
          const doc = uploaded?.document ?? uploaded;
          if (!doc?.id)
            throw new Error(
              "No fue posible obtener el documento clínico subido",
            );
          next.payload.documentId = doc.id;
          delete next.payload.offlineFile;
          writeQueue(
            scope.current,
            readQueue(scope.current).map((item: any) =>
              item.operationId === next.operationId ? next : item,
            ),
          );
        }
        prepared.push(next);
      }
      await verifyAccount();
      const result = await careApi.sync(prepared);
      const appliedIds = new Set(
        (result.results ?? [])
          .filter((x: any) => ["applied", "already_applied"].includes(x.status))
          .map((x: any) => x.operationId),
      );
      const remaining = readQueue(scope.current).filter(
        (x: any) => !appliedIds.has(x.operationId),
      );
      for (const operation of queue) {
        if (appliedIds.has(operation.operationId))
          await deleteOfflineFile(scope.current, operation.operationId).catch(
            () => null,
          );
      }
      writeQueue(scope.current, remaining);
      setQueued(remaining.length);
      setNotice(
        remaining.length
          ? `${remaining.length} operación(es) siguen pendientes.`
          : "Sincronización clínica completa.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo sincronizar; los pendientes se conservaron",
      );
    } finally {
      syncing.current = false;
    }
  }

  async function uploadAndCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (navigator.onLine) await verifyAccount();
      if (!scope.current)
        throw new Error(
          "Necesitas verificar tu cuenta antes de guardar archivos",
        );
      const form = new FormData(formElement);
      const file = form.get("file") as File | null;
      let documentId: string | undefined;
      let sourceType = String(form.get("sourceType") || "MANUAL");
      const opId = operationId();
      let offlineFile = false;
      if (file && file.size > 0) {
        if (!navigator.onLine) {
          await saveOfflineFile(scope.current, opId, file, {
            title: String(form.get("title") || file.name || "Consulta"),
            sourceType,
          });
          offlineFile = true;
        } else {
          try {
            const upload = new FormData();
            upload.set("file", file);
            upload.set(
              "title",
              String(form.get("title") || file.name || "Consulta"),
            );
            upload.set(
              "documentType",
              sourceType === "PHOTO" ? "PRESCRIPTION" : "CLINICAL_NOTE",
            );
            const uploaded: any = await clinicalApi.uploadDocument(upload);
            const doc = uploaded?.document ?? uploaded;
            documentId = doc?.id;
          } catch (e) {
            if (!(e instanceof TypeError)) throw e;
            await saveOfflineFile(scope.current, opId, file, {
              title: String(form.get("title") || file.name || "Consulta"),
              sourceType,
            });
            offlineFile = true;
          }
        }
        if (sourceType === "MANUAL") sourceType = "FILE";
      }
      const payload = {
        sourceType,
        documentId,
        offlineFile: offlineFile || undefined,
        sourceText: captureText || undefined,
        title: String(form.get("title") || "Consulta"),
        operationId: opId,
      };
      const result = offlineFile
        ? await queueOrRun("CAPTURE_CREATE", payload, async () => {
            throw new Error("Archivo en cola offline");
          })
        : await queueOrRun("CAPTURE_CREATE", payload, () =>
            careApi.createCapture(payload),
          );
      if (!result?.queued) setCapture(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No fue posible guardar la consulta",
      );
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    setError("");
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setError(
        "Este navegador no ofrece dictado de voz. Puedes escribir el texto manualmente.",
      );
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onstart = () => setVoiceActive(true);
    recognition.onend = () => setVoiceActive(false);
    recognition.onerror = () => setVoiceActive(false);
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results)
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ");
      setCaptureText((current) => `${current}${current ? "\n" : ""}${text}`);
    };
    recognition.start();
  }

  async function confirmCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!capture?.id) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData(formElement);
      await careApi.confirmCapture(capture.id, {
        status: "CONFIRMED",
        confirmedData: {
          title: String(form.get("title") || "Consulta guardada"),
          visitAt: String(form.get("visitAt") || new Date().toISOString()),
          doctor: String(form.get("doctor") || "") || undefined,
          specialty: String(form.get("specialty") || "") || undefined,
          institution: String(form.get("institution") || "") || undefined,
          diagnosis: String(form.get("diagnosis") || "") || undefined,
          recommendations:
            String(form.get("recommendations") || "") || undefined,
          followUp: String(form.get("followUp") || "") || undefined,
        },
      });
      setCapture(null);
      setCaptureText("");
      setNotice("Consulta confirmada y agregada al historial.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible confirmar");
    } finally {
      setBusy(false);
    }
  }

  async function submitAllergy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const opId = operationId();
    const payload = {
      substance: String(form.get("substance")),
      allergyType: String(form.get("allergyType")),
      reaction: String(form.get("reaction") || "") || undefined,
      severity: String(form.get("severity") || "UNSPECIFIED"),
      source: "PATIENT",
      confirmationStatus: "REPORTED",
      operationId: opId,
    };
    setBusy(true);
    setError("");
    try {
      await queueOrRun("ALLERGY_CREATE", payload, () =>
        careApi.createAllergy(payload),
      );
      formElement.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function submitRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const opId = operationId();
    const payload = {
      itemName: String(form.get("itemName")),
      restrictionType: String(form.get("restrictionType")),
      reactionOrReason: String(form.get("reason") || "") || undefined,
      source: "PATIENT",
      confirmationStatus: "REPORTED",
      operationId: opId,
    };
    setBusy(true);
    setError("");
    try {
      await queueOrRun("RESTRICTION_CREATE", payload, () =>
        careApi.createRestriction(payload),
      );
      formElement.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function startMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      await careApi.createSchedule({
        regimenId: String(form.get("regimenId")),
        firstDoseAt: new Date(String(form.get("firstDoseAt"))).toISOString(),
        intervalHours: Number(form.get("intervalHours")),
        operationId: operationId(),
      });
      formElement.reset();
      await careApi.materializeLife().catch(() => null);
      setNotice(
        "Horario iniciado. El intervalo fue confirmado explícitamente.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No fue posible iniciar horario",
      );
    } finally {
      setBusy(false);
    }
  }

  async function dose(scheduleId: string, status: "TAKEN" | "OMITTED") {
    const opId = operationId();
    const payload = {
      scheduleId,
      status,
      occurredAt: new Date().toISOString(),
      operationId: opId,
    };
    setBusy(true);
    setError("");
    try {
      await queueOrRun("DOSE_RECORD", payload, () =>
        careApi.recordDose(scheduleId, {
          status,
          occurredAt: payload.occurredAt,
          operationId: opId,
        }),
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No fue posible registrar la dosis",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const f = new FormData(formElement);
    const opId = operationId();
    const payload = {
      procedureName: String(f.get("procedureName")),
      occurredAt: new Date(String(f.get("occurredAt"))).toISOString(),
      hospitalName: String(f.get("hospitalName") || "") || undefined,
      clinicianName: String(f.get("clinicianName") || "") || undefined,
      notes: String(f.get("notes") || "") || undefined,
      operationId: opId,
    };
    setBusy(true);
    try {
      await queueOrRun("PROCEDURE_CREATE", payload, () =>
        careApi.createProcedure(payload),
      );
      formElement.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const f = new FormData(formElement);
    setBusy(true);
    try {
      await careApi.createFollowUp({
        recommendationText: String(f.get("recommendationText")),
        targetAt: new Date(String(f.get("targetAt"))).toISOString(),
        operationId: operationId(),
      });
      formElement.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function generateSummary(saveToFiles: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await careApi.doctorSummary({ saveToFiles, daysBack: 90 });
      setSummary(result);
      setNotice(
        saveToFiles
          ? "Resumen PDF guardado en Archivos de Salud."
          : "Resumen preparado.",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function createQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const f = new FormData(formElement);
    const categories = f.getAll("categories").map(String);
    setBusy(true);
    try {
      setQrResult(
        await careApi.createHealthQr({
          categories,
          expiresInMinutes: Number(f.get("minutes")),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function addCaregiver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const f = new FormData(formElement);
    const categories = f.getAll("careCategories").map(String);
    setBusy(true);
    try {
      await careApi.createCaregiver({
        caregiverEmail: String(f.get("email")),
        categories,
        expiresInDays: Number(f.get("days")),
      });
      setNotice("Acceso de familiar/cuidador creado con categorías limitadas.");
      formElement.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("Este navegador no permite notificaciones web.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotice(
      permission === "granted"
        ? "Avisos locales activados mientras Yalika esté abierta."
        : "No se autorizó el aviso local.",
    );
  }

  async function askAssistant(event: FormEvent) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!assistantQuery.trim()) return;
    setBusy(true);
    try {
      setAssistantResult(await careApi.assistantR303(assistantQuery));
      const q = assistantQuery
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (q.includes("qr"))
        document
          .getElementById("mi-qr")
          ?.scrollIntoView({ behavior: "smooth" });
      if (
        q.includes("medicina") ||
        q.includes("medicamento") ||
        q.includes("pastilla")
      )
        document
          .getElementById("medicinas")
          ?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEssentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      await careApi.updateEssentials({
        bloodType: String(form.get("bloodType") || "UNKNOWN"),
        bloodTypeSource: "PATIENT",
        bloodTypeConfirmationStatus: "REPORTED",
        emergencyContactName:
          String(form.get("emergencyContactName") || "") || undefined,
        emergencyContactRelationship:
          String(form.get("emergencyContactRelationship") || "") || undefined,
        emergencyContactPhone:
          String(form.get("emergencyContactPhone") || "") || undefined,
        emergencyNotes: String(form.get("emergencyNotes") || "") || undefined,
      });
      setNotice("Información esencial actualizada.");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No fue posible guardar la información esencial",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addChronicCondition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      await careApi.createChronicCondition({
        conditionName: String(form.get("conditionName")),
        diagnosedAt: form.get("diagnosedAt")
          ? new Date(String(form.get("diagnosedAt"))).toISOString()
          : undefined,
        source: "PATIENT",
        confirmationStatus: "REPORTED",
        notes: String(form.get("notes") || "") || undefined,
        operationId: operationId(),
      });
      formElement.reset();
      setNotice("Padecimiento agregado como dato reportado por el paciente.");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No fue posible guardar el padecimiento",
      );
    } finally {
      setBusy(false);
    }
  }

  function startAssistantVoice() {
    setError("");
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setError(
        "Este navegador no ofrece dictado de voz. Puedes escribir tu pregunta.",
      );
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setVoiceActive(true);
    recognition.onend = () => setVoiceActive(false);
    recognition.onerror = () => setVoiceActive(false);
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results)
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ");
      setAssistantQuery(text);
    };
    recognition.start();
  }

  const qrCategories = [
    ["ESSENTIAL", "Resumen esencial"],
    ["ALLERGIES", "Alergias"],
    ["CURRENT_MEDICATIONS", "Medicamentos actuales"],
    ["PRESCRIPTIONS", "Recetas"],
    ["STUDIES", "Estudios"],
    ["RECENT_CONSULTATIONS", "Últimas consultas"],
    ["PROCEDURES", "Operaciones/procedimientos"],
    ["FULL_HISTORY", "Historial completo"],
  ];

  const essentials = overview?.essentials ?? null;
  const chronicConditions = overview?.chronicConditions ?? [];
  const procedures = overview?.recent?.procedures ?? [];
  const completion = overview?.completion ?? { percent: 0, missing: [] };

  return (
    <main className={`${styles.page} ${senior ? styles.senior : ""}`}>
      <div className={styles.shell}>
        <header className={styles.heroSimple}>
          <div>
            <span className={styles.eyebrow}>YALIKA SALUD</span>
            <h1>Tu salud, fácil de entender.</h1>
            <p>
              Lo importante hoy primero. Tu historial completo sigue guardado
              detrás.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/salud" className={styles.secondary}>
              Salud
            </Link>
            <button
              className={styles.primary}
              onClick={() => setSenior((value) => !value)}
            >
              {senior ? "Vista normal" : "Texto grande"}
            </button>
          </div>
        </header>

        {!online && (
          <div className={styles.offline}>
            Sin Internet. Puedes seguir registrando algunas acciones; se
            sincronizarán cuando vuelva la conexión.
          </div>
        )}
        {online && queued > 0 && (
          <div className={styles.offline}>
            Tienes {queued} cambio(s) pendientes.{" "}
            <button className={styles.button} onClick={() => void syncQueue()}>
              Sincronizar
            </button>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.success}>{notice}</div>}

        <section className={styles.assistantHero}>
          <div className={styles.assistantOrb}>Y</div>
          <div className={styles.assistantBody}>
            <span className={styles.kicker}>ASISTENTE YALIKA</span>
            <h2>¿En qué te ayudo con tu salud?</h2>
            <form onSubmit={askAssistant} className={styles.assistantForm}>
              <input
                value={assistantQuery}
                onChange={(event) => setAssistantQuery(event.target.value)}
                placeholder="Ej. ¿Qué medicina me toca? ¿Cuándo tengo consulta?"
              />
              <button
                type="button"
                className={styles.voiceButton}
                onClick={startAssistantVoice}
              >
                {voiceActive ? "Escuchando…" : "Hablar"}
              </button>
              <button disabled={busy}>Preguntar</button>
            </form>
            <div className={styles.suggestions}>
              {[
                "¿Qué medicina me toca?",
                "¿Cuándo tengo consulta?",
                "¿Cuáles son mis alergias?",
                "¿Cuál es mi tipo de sangre?",
              ].map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setAssistantQuery(text)}
                >
                  {text}
                </button>
              ))}
            </div>
            {assistantResult && (
              <div className={styles.assistantAnswer}>
                {assistantResult.message}
              </div>
            )}
          </div>
        </section>

        <section className={styles.nowGrid}>
          <article className={`${styles.bigCard} ${styles.medCard}`}>
            <span className={styles.kicker}>AHORA</span>
            <h2>
              {nextMedication?.medication?.medicationName ||
                "No tienes una dosis pendiente"}
            </h2>
            <p>
              {nextMedication?.nextDoseAt
                ? `Próxima toma: ${fmt(nextMedication.nextDoseAt)}`
                : "Cuando registres un tratamiento, Yalika te mostrará aquí qué sigue."}
            </p>
            {nextMedication?.id && (
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  onClick={() => void dose(nextMedication.id, "TAKEN")}
                >
                  Ya la tomé
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => void dose(nextMedication.id, "OMITTED")}
                >
                  La omití
                </button>
              </div>
            )}
            <button
              className={styles.textLink}
              onClick={() =>
                document
                  .getElementById("medicinas")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Ver mis medicamentos
            </button>
          </article>

          <article className={styles.bigCard}>
            <span className={styles.kicker}>PRÓXIMA CONSULTA</span>
            <h2>
              {nextConsultation?.scheduledAt
                ? fmt(nextConsultation.scheduledAt)
                : "Sin consulta programada"}
            </h2>
            <p>
              {nextConsultation?.scheduledAt
                ? "Tu próxima cita registrada en Yalika."
                : "Puedes guardar una revisión cuando tu médico te indique la fecha."}
            </p>
            <Link href="/salud/consultas" className={styles.textLink}>
              Ver consultas
            </Link>
          </article>
        </section>

        <section className={styles.actionGrid}>
          <button
            onClick={() =>
              document
                .getElementById("guardar-consulta")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>＋</span>
            <strong>Guardar consulta</strong>
            <small>Foto, archivo, voz o texto</small>
          </button>
          <button
            onClick={() =>
              document
                .getElementById("medicinas")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>Rx</span>
            <strong>Mis medicinas</strong>
            <small>Tratamiento y tomas</small>
          </button>
          <button
            onClick={() =>
              document
                .getElementById("esencial")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>♥</span>
            <strong>Información esencial</strong>
            <small>Para consulta o emergencia</small>
          </button>
          <button
            onClick={() =>
              document
                .getElementById("mi-qr")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>QR</span>
            <strong>Mi QR Salud</strong>
            <small>Comparte sólo lo que autorices</small>
          </button>
          <Link href="/archivos">
            <span>▤</span>
            <strong>Mis estudios</strong>
            <small>Documentos y resultados</small>
          </Link>
          <button
            onClick={() =>
              document
                .getElementById("historial")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>↺</span>
            <strong>Mi historial</strong>
            <small>Consultas y eventos anteriores</small>
          </button>
        </section>

        <section id="esencial" className={styles.essentialCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>INFORMACIÓN IMPORTANTE</span>
              <h2>Lo esencial en un solo lugar</h2>
            </div>
            <div className={styles.completion}>
              <strong>{completion.percent}%</strong>
              <span>organizado</span>
            </div>
          </div>
          <div className={styles.essentialGrid}>
            <div>
              <span>Tipo de sangre</span>
              <strong>
                {essentials?.bloodType && essentials.bloodType !== "UNKNOWN"
                  ? essentials.bloodType
                  : "No registrado"}
              </strong>
              <small>
                {essentials?.bloodType
                  ? "Reportado / sujeto a verificación clínica"
                  : "Agrégalo si lo conoces"}
              </small>
            </div>
            <div>
              <span>Alergias</span>
              <strong>
                {important.allergies?.length
                  ? `${important.allergies.length} registrada(s)`
                  : "Sin registrar"}
              </strong>
              <small>
                {important.allergies
                  ?.slice(0, 2)
                  .map((a: any) => a.substance)
                  .join(" · ") || "No significa que no existan"}
              </small>
            </div>
            <div>
              <span>Padecimientos</span>
              <strong>
                {chronicConditions.length
                  ? `${chronicConditions.length} activo(s)`
                  : "Sin registrar"}
              </strong>
              <small>
                {chronicConditions
                  .slice(0, 2)
                  .map((c: any) => c.conditionName)
                  .join(" · ") || "Puedes agregarlos debajo"}
              </small>
            </div>
            <div>
              <span>Medicamentos actuales</span>
              <strong>{important.currentMedications?.length || 0}</strong>
              <small>
                {important.currentMedications
                  ?.slice(0, 2)
                  .map(
                    (m: any) => m.medication?.medicationName || "Medicamento",
                  )
                  .join(" · ") || "Sin tratamiento activo registrado"}
              </small>
            </div>
            <div>
              <span>Cirugías / procedimientos</span>
              <strong>{procedures.length || 0}</strong>
              <small>
                {procedures
                  .slice(0, 2)
                  .map((p: any) => p.procedureName)
                  .join(" · ") || "Sin procedimientos registrados"}
              </small>
            </div>
            <div>
              <span>Contacto de emergencia</span>
              <strong>
                {essentials?.emergencyContactName || "No registrado"}
              </strong>
              <small>
                {essentials?.emergencyContactPhone ||
                  "Agrega una persona de confianza"}
              </small>
            </div>
          </div>
          {completion.missing?.length > 0 && (
            <p className={styles.progressHint}>
              Puedes completar poco a poco:{" "}
              {completion.missing
                .slice(0, 3)
                .map((m: any) => m.label)
                .join(", ")}
              .
            </p>
          )}

          <details className={styles.detailsBox}>
            <summary>Editar información esencial</summary>
            <form className={styles.form} onSubmit={saveEssentials}>
              <div className={styles.two}>
                <label>
                  Tipo de sangre
                  <select
                    name="bloodType"
                    defaultValue={essentials?.bloodType || "UNKNOWN"}
                  >
                    <option value="UNKNOWN">No lo sé</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Contacto de emergencia
                  <input
                    name="emergencyContactName"
                    defaultValue={essentials?.emergencyContactName || ""}
                  />
                </label>
              </div>
              <div className={styles.two}>
                <label>
                  Relación
                  <input
                    name="emergencyContactRelationship"
                    defaultValue={
                      essentials?.emergencyContactRelationship || ""
                    }
                    placeholder="Ej. hija, esposo"
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    name="emergencyContactPhone"
                    defaultValue={essentials?.emergencyContactPhone || ""}
                  />
                </label>
              </div>
              <label>
                Nota importante
                <input
                  name="emergencyNotes"
                  defaultValue={essentials?.emergencyNotes || ""}
                  placeholder="Sólo si hay algo esencial que deban saber"
                />
              </label>
              <p className={styles.note}>
                El tipo de sangre se guarda con su fuente. No sustituye las
                pruebas de compatibilidad de un hospital.
              </p>
              <button disabled={busy}>Guardar información esencial</button>
            </form>
          </details>

          <details className={styles.detailsBox}>
            <summary>Agregar o revisar padecimientos crónicos</summary>
            <form className={styles.form} onSubmit={addChronicCondition}>
              <label>
                Padecimiento
                <input
                  name="conditionName"
                  required
                  placeholder="Ej. hipertensión"
                />
              </label>
              <div className={styles.two}>
                <label>
                  Fecha aproximada de diagnóstico
                  <input name="diagnosedAt" type="date" />
                </label>
                <label>
                  Nota
                  <input name="notes" placeholder="Opcional" />
                </label>
              </div>
              <button disabled={busy}>Agregar como dato reportado</button>
            </form>
            <div className={styles.list}>
              {chronicConditions.map((c: any) => (
                <div key={c.id} className={styles.item}>
                  <div className={styles.row}>
                    <div>
                      <strong>{c.conditionName}</strong>
                      <p>
                        {c.confirmationStatus === "PROFESSIONAL_CONFIRMED"
                          ? "Confirmado por profesional"
                          : c.confirmationStatus === "DOCUMENTED"
                            ? "Con documento"
                            : "Reportado"}
                      </p>
                    </div>
                    <button
                      className={styles.danger}
                      onClick={() =>
                        void careApi
                          .deactivateChronicCondition(c.id)
                          .then(refresh)
                      }
                    >
                      Ya no está activo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>

        <section id="medicinas" className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>MIS MEDICINAS</span>
              <h2>Lo que estás tomando ahora</h2>
            </div>
            <button
              className={styles.secondary}
              onClick={() => void enableNotifications()}
            >
              Activar avisos
            </button>
          </div>
          <div className={styles.medList}>
            {important.currentMedications?.length ? (
              important.currentMedications.map((m: any) => (
                <article key={m.id} className={styles.medRow}>
                  <div>
                    <strong>
                      {m.medication?.medicationName || "Medicamento"}
                    </strong>
                    <p>
                      {m.regimen?.instructions || "Indicaciones registradas"}
                    </p>
                  </div>
                  <div className={styles.medTime}>
                    {m.nextDoseAt ? fmt(m.nextDoseAt) : "Sin próxima toma"}
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      onClick={() => void dose(m.id, "TAKEN")}
                    >
                      Tomada
                    </button>
                    <button
                      className={styles.secondary}
                      onClick={() => void dose(m.id, "OMITTED")}
                    >
                      Omitida
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className={styles.empty}>
                No tienes medicamentos activos registrados.
              </p>
            )}
          </div>
          <details className={styles.detailsBox}>
            <summary>Configurar horario de un tratamiento</summary>
            <form className={styles.form} onSubmit={startMedication}>
              <div className={styles.three}>
                <label>
                  Tratamiento
                  <select name="regimenId" required defaultValue="">
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    {regimens.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.medication?.medicationName || "Medicamento"} ·{" "}
                        {r.instructions}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Primera dosis
                  <input name="firstDoseAt" type="datetime-local" required />
                </label>
                <label>
                  Intervalo confirmado (horas)
                  <input
                    name="intervalHours"
                    type="number"
                    min="1"
                    max="168"
                    required
                  />
                </label>
              </div>
              <button disabled={busy}>Iniciar recordatorios</button>
              <p className={styles.note}>
                Yalika no adivina el intervalo: debe venir de una indicación
                confirmada.
              </p>
            </form>
          </details>
        </section>

        <section id="guardar-consulta" className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>GUARDAR CONSULTA</span>
              <h2>Alimenta tu historia sin llenar formularios largos</h2>
            </div>
          </div>
          <form className={styles.form} onSubmit={uploadAndCapture}>
            <div className={styles.captureChoices}>
              <label>
                <input
                  type="radio"
                  name="sourceType"
                  value="PHOTO"
                  defaultChecked
                />
                Foto
              </label>
              <label>
                <input type="radio" name="sourceType" value="FILE" />
                Archivo/PDF
              </label>
              <label>
                <input type="radio" name="sourceType" value="VOICE" />
                Voz
              </label>
              <label>
                <input type="radio" name="sourceType" value="MANUAL" />
                Escribir
              </label>
            </div>
            <label>
              Título
              <input name="title" placeholder="Ej. consulta de control" />
            </label>
            <label>
              Foto o archivo
              <input name="file" type="file" accept="image/*,.pdf" />
            </label>
            <label>
              Notas
              <textarea
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder="Escribe lo importante o usa Dictar"
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={startVoice}
              >
                {voiceActive ? "Escuchando…" : "Dictar"}
              </button>
              <button disabled={busy}>Guardar para revisar</button>
            </div>
          </form>
          {capture && (
            <div className={styles.reviewBox}>
              <h3>Confirma antes de agregar al historial</h3>
              <p>Yalika sólo propone. Revisa los datos y confirma.</p>
              <form className={styles.form} onSubmit={confirmCapture}>
                <div className={styles.two}>
                  <label>
                    Título
                    <input
                      name="title"
                      defaultValue={
                        capture?.proposedData?.title || "Consulta guardada"
                      }
                    />
                  </label>
                  <label>
                    Fecha
                    <input name="visitAt" type="datetime-local" />
                  </label>
                </div>
                <div className={styles.two}>
                  <label>
                    Médico
                    <input name="doctor" />
                  </label>
                  <label>
                    Especialidad
                    <input name="specialty" />
                  </label>
                </div>
                <label>
                  Institución
                  <input name="institution" />
                </label>
                <label>
                  Diagnóstico registrado
                  <input name="diagnosis" />
                </label>
                <label>
                  Recomendaciones
                  <textarea name="recommendations" />
                </label>
                <label>
                  Seguimiento
                  <input name="followUp" />
                </label>
                <button disabled={busy}>Confirmar y guardar</button>
              </form>
            </div>
          )}
        </section>

        <section id="mi-qr" className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>MI QR SALUD</span>
              <h2>Comparte lo esencial, no todo tu expediente</h2>
            </div>
          </div>
          <form className={styles.form} onSubmit={createQr}>
            <div className={styles.checks}>
              {qrCategories.map(([value, label]) => (
                <label className={styles.check} key={value}>
                  <input type="checkbox" name="categories" value={value} />
                  {label}
                </label>
              ))}
            </div>
            <label>
              Duración
              <select name="minutes" defaultValue="60">
                <option value="15">15 minutos</option>
                <option value="60">1 hora</option>
                <option value="1440">24 horas</option>
              </select>
            </label>
            <button disabled={busy || !online}>Generar QR Salud</button>
          </form>
          {qrResult && (
            <div className={styles.qrArea}>
              <div>
                <p>
                  El QR contiene un acceso temporal, no tu expediente completo.
                </p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}${qrResult.relativePath}`,
                    )
                  }
                >
                  Copiar enlace
                </button>
              </div>
              {qrData && (
                <img
                  className={styles.qr}
                  src={qrData}
                  alt="QR Salud temporal"
                />
              )}
            </div>
          )}
        </section>

        <details className={styles.morePanel}>
          <summary>Más de mi salud</summary>
          <div className={styles.moreGrid}>
            <section className={styles.innerCard}>
              <h3>Alergias</h3>
              <div className={styles.list}>
                {important.allergies?.map((a: any) => (
                  <div className={styles.item} key={a.id}>
                    <div className={styles.row}>
                      <div>
                        <strong>{a.substance}</strong>
                        <p>
                          {a.reaction || "Sin reacción registrada"} ·{" "}
                          {a.severity}
                        </p>
                      </div>
                      <button
                        className={styles.danger}
                        onClick={() =>
                          void careApi.deactivateAllergy(a.id).then(refresh)
                        }
                      >
                        Desactivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <form className={styles.form} onSubmit={submitAllergy}>
                <label>
                  Nueva alergia
                  <input name="substance" required />
                </label>
                <div className={styles.two}>
                  <label>
                    Tipo
                    <select name="allergyType">
                      <option value="MEDICATION">Medicamento</option>
                      <option value="FOOD">Alimento</option>
                      <option value="ENVIRONMENTAL">Ambiental</option>
                      <option value="OTHER">Otra</option>
                    </select>
                  </label>
                  <label>
                    Gravedad
                    <select name="severity">
                      <option value="UNSPECIFIED">No especificada</option>
                      <option value="MILD">Leve</option>
                      <option value="MODERATE">Moderada</option>
                      <option value="SEVERE">Grave</option>
                    </select>
                  </label>
                </div>
                <label>
                  Reacción
                  <input name="reaction" />
                </label>
                <button disabled={busy}>Agregar</button>
              </form>
            </section>

            <section className={styles.innerCard}>
              <h3>Alimentos y restricciones</h3>
              <div className={styles.list}>
                {important.restrictions?.map((r: any) => (
                  <div className={styles.item} key={r.id}>
                    <strong>{r.itemName}</strong>
                    <p>{r.restrictionType}</p>
                  </div>
                ))}
              </div>
              <form className={styles.form} onSubmit={submitRestriction}>
                <label>
                  Alimento o restricción
                  <input name="itemName" required />
                </label>
                <label>
                  Tipo
                  <select name="restrictionType">
                    <option value="FOOD_ALLERGY">Alergia alimentaria</option>
                    <option value="INTOLERANCE">Intolerancia</option>
                    <option value="PREFERRED_AVOID">Prefiero evitar</option>
                    <option value="MEDICAL_RESTRICTION">
                      Restricción indicada por médico
                    </option>
                  </select>
                </label>
                <label>
                  Motivo
                  <input name="reason" />
                </label>
                <button disabled={busy}>Guardar</button>
              </form>
            </section>

            <section className={styles.innerCard}>
              <h3>Cirugías y procedimientos</h3>
              <div className={styles.list}>
                {procedures.slice(0, 6).map((p: any) => (
                  <div className={styles.item} key={p.id}>
                    <strong>{p.procedureName}</strong>
                    <p>{fmt(p.occurredAt)}</p>
                  </div>
                ))}
              </div>
              <form className={styles.form} onSubmit={submitProcedure}>
                <label>
                  Procedimiento
                  <input name="procedureName" required />
                </label>
                <label>
                  Fecha
                  <input name="occurredAt" type="datetime-local" required />
                </label>
                <label>
                  Hospital
                  <input name="hospitalName" />
                </label>
                <label>
                  Médico
                  <input name="clinicianName" />
                </label>
                <label>
                  Nota
                  <textarea name="notes" />
                </label>
                <button disabled={busy}>Guardar</button>
              </form>
            </section>

            <section className={styles.innerCard}>
              <h3>Próxima revisión</h3>
              <form className={styles.form} onSubmit={submitFollowUp}>
                <label>
                  Recomendación
                  <input
                    name="recommendationText"
                    required
                    placeholder="Revisión en 15 días"
                  />
                </label>
                <label>
                  Fecha propuesta
                  <input name="targetAt" type="datetime-local" required />
                </label>
                <button disabled={busy}>Crear propuesta</button>
              </form>
              <div className={styles.list}>
                {followUps.map((f: any) => (
                  <div className={styles.item} key={f.id}>
                    <strong>{f.recommendationText}</strong>
                    <p>{fmt(f.targetAt)}</p>
                    <div className={styles.actions}>
                      <button
                        className={styles.primary}
                        onClick={() =>
                          void careApi
                            .acceptFollowUp(f.id)
                            .then(() =>
                              careApi.materializeLife().catch(() => null),
                            )
                            .then(refresh)
                        }
                      >
                        Agregar a agenda
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={() =>
                          void careApi.rejectFollowUp(f.id).then(refresh)
                        }
                      >
                        No agregar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.innerCard}>
              <h3>Resumen para mi médico</h3>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  onClick={() => void generateSummary(false)}
                >
                  Preparar resumen
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => void generateSummary(true)}
                >
                  Guardar PDF
                </button>
              </div>
              {summary && (
                <div className={styles.reviewBox}>
                  <pre>{summary.lines?.join("\n")}</pre>
                  <button
                    className={styles.secondary}
                    onClick={() => window.print()}
                  >
                    Imprimir
                  </button>
                </div>
              )}
            </section>

            <section className={styles.innerCard}>
              <h3>Familiar o cuidador</h3>
              <form className={styles.form} onSubmit={addCaregiver}>
                <label>
                  Correo de cuenta Yalika
                  <input name="email" type="email" required />
                </label>
                <div className={styles.checks}>
                  {qrCategories
                    .filter(([v]) => v !== "FULL_HISTORY")
                    .map(([value, label]) => (
                      <label className={styles.check} key={value}>
                        <input
                          type="checkbox"
                          name="careCategories"
                          value={value}
                        />
                        {label}
                      </label>
                    ))}
                </div>
                <label>
                  Días de acceso
                  <input
                    name="days"
                    type="number"
                    min="1"
                    max="365"
                    defaultValue="30"
                  />
                </label>
                <button disabled={busy}>Dar acceso</button>
              </form>
            </section>
          </div>
        </details>

        <section id="historial" className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>HISTORIAL</span>
              <h2>Lo reciente</h2>
            </div>
            <div className={styles.actions}>
              <Link href="/salud/consultas" className={styles.secondary}>
                Consultas
              </Link>
              <Link href="/archivos" className={styles.secondary}>
                Archivos y estudios
              </Link>
            </div>
          </div>
          <div className={styles.timeline}>
            {overview?.recent?.events?.slice(0, 8).map((e: any) => (
              <div className={styles.timelineItem} key={e.id}>
                <span></span>
                <div>
                  <strong>{e.title}</strong>
                  <p>{fmt(e.occurredAt)}</p>
                </div>
              </div>
            ))}
            {!overview?.recent?.events?.length && (
              <p className={styles.empty}>
                Tu historia irá apareciendo aquí conforme guardes consultas,
                estudios y tratamientos.
              </p>
            )}
          </div>
        </section>

        <section className={styles.sectionCard}>
          <span className={styles.kicker}>ACCESOS</span>
          <h2>Quién puede ver tu Salud</h2>
          <div className={styles.list}>
            {accessRequests
              .filter((r: any) => r.status === "PENDING")
              .map((r: any) => (
                <div className={styles.item} key={r.id}>
                  <strong>Solicitud pendiente</strong>
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      onClick={() =>
                        void clinicalApi.approveRequest(r.id).then(refresh)
                      }
                    >
                      Autorizar
                    </button>
                    <button
                      className={styles.danger}
                      onClick={() =>
                        void clinicalApi.denyRequest(r.id).then(refresh)
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            {grants
              .filter(
                (g: any) =>
                  g.status === "ACTIVE" && new Date(g.expiresAt) > new Date(),
              )
              .map((g: any) => (
                <div className={styles.item} key={g.id}>
                  <div className={styles.row}>
                    <div>
                      <strong>
                        {g.purpose === "CAREGIVER"
                          ? "Familiar/cuidador"
                          : "Acceso temporal"}
                      </strong>
                      <p>Vence {fmt(g.expiresAt)}</p>
                    </div>
                    <button
                      className={styles.danger}
                      onClick={() =>
                        void clinicalApi
                          .revokeGrant(g.id)
                          .then(() =>
                            g.shareLinkId
                              ? clinicalApi
                                  .revokeShareLink(g.shareLinkId)
                                  .catch(() => null)
                              : null,
                          )
                          .then(refresh)
                      }
                    >
                      Cerrar acceso
                    </button>
                  </div>
                </div>
              ))}
            {!accessRequests.some((r: any) => r.status === "PENDING") &&
              !grants.some(
                (g: any) =>
                  g.status === "ACTIVE" && new Date(g.expiresAt) > new Date(),
              ) && (
                <p className={styles.empty}>
                  No hay accesos activos ni solicitudes pendientes.
                </p>
              )}
          </div>
        </section>
      </div>
    </main>
  );
}
