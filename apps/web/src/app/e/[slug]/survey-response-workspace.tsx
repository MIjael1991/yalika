"use client";

import Image from "next/image";
import { fieldLabels, legacyFields } from "../../../lib/survey-fields";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { PublicSurvey } from "./page";

type Results = {
  responseCount: number;
  questions: Array<{
    id: string;
    prompt: string;
    type: string;
    answers: Array<{
      option: string;
      count: number;
    }>;
  }>;
};

type SavedDraft = {
  person: {
    name: string;
    email: string;
    phone: string;
    municipality: string;
    locality: string;
    postalCode: string;
    address: string;
    curp: string;
    voterKey: string;
    electoralSection: string;
  };
  answers: Record<string, unknown>;
  otherAnswers?: Record<string, string>;
  current: number;
};

function draftKey(slug: string) {
  return `survey-draft:${slug}`;
}

async function prepareInePhoto(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("La fotografía debe ser JPG, PNG o WEBP.");
  }

  const source = URL.createObjectURL(file);
  try {
    const photo = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      photo.onload = () => resolve();
      photo.onerror = () => reject(new Error("No pudimos leer la fotografía."));
      photo.src = source;
    });

    const longestSide = Math.max(photo.naturalWidth, photo.naturalHeight);
    const scale = Math.min(1, 1600 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos preparar la fotografía.");
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 2_050_000 && quality > 0.5) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrl.length > 2_050_000) {
      throw new Error(
        "La fotografía sigue siendo muy pesada. Acércate a la INE e inténtalo otra vez.",
      );
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function identityIsReady(
  survey: Pick<
    PublicSurvey,
    "personalFields" | "identityMode" | "collectMunicipality" | "collectLocality" |
    "collectPostalCode" | "collectAddress" | "collectCurp" | "collectVoterKey" | "collectElectoralSection"
  >,
  person: SavedDraft["person"],
) {
  if (survey.personalFields) return survey.personalFields.every(field => !field.required || Boolean(person[field.key]?.trim()));
  const fields = legacyFields(survey);
  const { identityMode } = survey;
  if (fields.some(field => field.key === "municipality") && !person.municipality.trim()) return false;
  if (fields.some(field => field.key === "locality") && !person.locality.trim()) return false;
  if (fields.some(field => field.key === "postalCode") && !/^\d{5}$/.test(person.postalCode.trim())) return false;
  if (survey.collectAddress && person.address.trim().length < 5) return false;
  if (fields.some(field => field.key === "curp") && !/^[A-Z0-9]{18}$/.test(person.curp.trim().toUpperCase())) return false;
  if (survey.collectVoterKey) {
    const voterKey = person.voterKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (voterKey.length < 16 || voterKey.length > 20) return false;
  }
  if (fields.some(field => field.key === "electoralSection") && !/^\d{1,4}$/.test((person.electoralSection ?? "").replace(/\D/g, ""))) return false;
  if (identityMode === "anonymous") return true;
  if (!person.name.trim()) return false;
  if (identityMode === "phone")
    return person.phone.replace(/\D/g, "").length >= 10;
  if (identityMode === "email") return /^\S+@\S+\.\S+$/.test(person.email);
  if (identityMode === "email_and_phone")
    return (
      /^\S+@\S+\.\S+$/.test(person.email) &&
      person.phone.replace(/\D/g, "").length >= 10
    );
  return (
    /^\S+@\S+\.\S+$/.test(person.email) ||
    person.phone.replace(/\D/g, "").length >= 10
  );
}

function isOtherOption(value: unknown) {
  return typeof value === "string" && /^otr[oa]$/i.test(value.trim());
}

function responseIsReady(
  target: PublicSurvey["questions"][number] | undefined,
  answers: Record<string, unknown>,
  otherAnswers: Record<string, string>,
) {
  if (!target?.required) return true;
  const value = answers[target.id];

  if (Array.isArray(value)) {
    if (!value.length) return false;
    return !value.some(isOtherOption) || Boolean(otherAnswers[target.id]?.trim());
  }

  if (isOtherOption(value)) {
    return Boolean(otherAnswers[target.id]?.trim());
  }

  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function SurveyResponseWorkspace({ survey, invitationToken }: { survey: PublicSurvey; invitationToken: string }) {
  const fields = legacyFields(survey);
  const [started, setStarted] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(null);
  const [person, setPerson] = useState({
    name: "",
    email: "",
    phone: "",
    municipality: "",
    locality: "",
    postalCode: "",
    address: "",
    curp: "",
    voterKey: "",
    electoralSection: "",
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [thankYou, setThankYou] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [ineFront, setIneFront] = useState("");
  const [ineBack, setIneBack] = useState("");
  const [ineBusy, setIneBusy] = useState<"front" | "back" | "">("");
  const [ineReading, setIneReading] = useState(false);
  const [ineReadingMessage, setIneReadingMessage] = useState("");
  const [ineReadConsent, setIneReadConsent] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const question = survey.questions[current];
  const percentage = survey.questions.length
    ? Math.round(((current + 1) / survey.questions.length) * 100)
    : 0;

  useEffect(() => {
    if (invitationToken) return;
    const saved = localStorage.getItem(draftKey(survey.slug));
    if (!saved) return;

    try {
      const draft = JSON.parse(saved) as SavedDraft;
      const timer = window.setTimeout(() => setSavedDraft(draft), 0);
      return () => window.clearTimeout(timer);
    } catch {
      localStorage.removeItem(draftKey(survey.slug));
    }
  }, [invitationToken, survey.questions.length, survey.slug]);

  useEffect(() => {
    if (invitationToken || !started || completed) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        draftKey(survey.slug),
        JSON.stringify({ person, answers, otherAnswers, current }),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [answers, completed, current, invitationToken, otherAnswers, person, started, survey.slug]);

  const identityReady = useMemo(() => {
    return identityIsReady(survey, person);
  }, [person, survey]);

  const answerReady = (target = question) => {
    return responseIsReady(target, answers, otherAnswers);
  };

  const ineNeedsBack = survey.ineCaptureMode === "front_back";
  const ineCanPrefill = fields.length > 0;
  const ineReady =
    !survey.collectIne ||
    (ineFront
      ? !ineNeedsBack || Boolean(ineBack)
      : !ineBack && !survey.ineRequired);

  const readIneFields = async (frontImage: string) => {
    if (!survey.ineAutoExtract || !ineCanPrefill) return;
    setIneReading(true);
    setIneReadingMessage("Intentando leer los datos visibles del frente…");
    try {
      const response = await fetch(
        `/api/yalika/survey/public/${encodeURIComponent(survey.slug)}/ine/extract`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frontImage, invitationToken }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        available?: boolean;
        name?: string;
        address?: string;
        postalCode?: string;
        curp?: string;
        voterKey?: string;
        electoralSection?: string;
        municipality?: string;
        locality?: string;
        message?: string | string[];
      };
      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join(". ")
          : data.message;
        throw new Error(message || "No fue posible leer la INE automáticamente");
      }
      setPerson((current) => ({
        ...current,
        name:
          fields.some(field => field.key === "name") && !current.name.trim()
            ? data.name || current.name
            : current.name,
        municipality:
          fields.some(field => field.key === "municipality") && !current.municipality.trim()
            ? data.municipality || current.municipality
            : current.municipality,
        locality:
          fields.some(field => field.key === "locality") && !current.locality.trim()
            ? data.locality || current.locality
            : current.locality,
        postalCode:
          fields.some(field => field.key === "postalCode") && !current.postalCode.trim()
            ? data.postalCode || current.postalCode
            : current.postalCode,
        address:
          fields.some(field => field.key === "address") && !current.address.trim()
            ? data.address || current.address
            : current.address,
        curp:
          fields.some(field => field.key === "curp") && !current.curp.trim()
            ? data.curp || current.curp
            : current.curp,
        voterKey:
          fields.some(field => field.key === "voterKey") && !current.voterKey.trim()
            ? data.voterKey || current.voterKey
            : current.voterKey,
        electoralSection:
          fields.some(field => field.key === "electoralSection") && !(current.electoralSection ?? "").trim()
            ? data.electoralSection || current.electoralSection || ""
            : current.electoralSection || "",
      }));
      setIneReadingMessage(
        typeof data.message === "string"
          ? data.message
          : "Revisa los datos que pudimos leer antes de enviar.",
      );
    } catch (caught) {
      setIneReadingMessage(
        caught instanceof Error
          ? `${caught.message}. Puedes llenar los datos manualmente.`
          : "No pudimos leer la INE automáticamente. Puedes llenar los datos manualmente.",
      );
    } finally {
      setIneReading(false);
    }
  };

  const chooseInePhoto = async (side: "front" | "back", file?: File) => {
    if (!file) return;
    setError("");
    setIneBusy(side);
    try {
      const prepared = await prepareInePhoto(file);
      if (side === "front") {
        setIneFront(prepared);
        setIneReadConsent(false);
        setIneReadingMessage("");
      } else {
        setIneBack(prepared);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos preparar la fotografía.");
    } finally {
      setIneBusy("");
    }
  };

  const startNew = () => {
    localStorage.removeItem(draftKey(survey.slug));
    setSavedDraft(null);
    setPerson({
      name: "",
      email: "",
      phone: "",
      municipality: "",
      locality: "",
      postalCode: "",
      address: "",
      curp: "",
      voterKey: "",
      electoralSection: "",
    });
    setAnswers({});
    setOtherAnswers({});
    setIneFront("");
    setIneBack("");
    setIneReadConsent(false);
    setIneReadingMessage("");
    setCurrent(0);
    setError("");
    setStarted(true);
  };

  const continueDraft = () => {
    if (!savedDraft) {
      startNew();
      return;
    }

    const restoredOtherAnswers = savedDraft.otherAnswers ?? {};
    const savedCurrent = Math.min(
      Math.max(savedDraft.current, 0),
      Math.max(survey.questions.length - 1, 0),
    );
    const firstIncomplete = survey.questions.findIndex(
      (item) =>
        !responseIsReady(item, savedDraft.answers, restoredOtherAnswers),
    );
    const safeCurrent = !identityIsReady(survey, savedDraft.person)
      ? 0
      : firstIncomplete >= 0
        ? Math.min(savedCurrent, firstIncomplete)
        : savedCurrent;

    setPerson({ ...savedDraft.person, electoralSection: savedDraft.person.electoralSection ?? "" });
    setAnswers(savedDraft.answers);
    setOtherAnswers(restoredOtherAnswers);
    setCurrent(safeCurrent);
    setError("");
    setStarted(true);
  };

  const next = () => {
    setError("");
    if (!answerReady()) {
      setError("Responde esta pregunta para continuar.");
      return;
    }
    setCurrent((value) => Math.min(value + 1, survey.questions.length - 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!identityReady) {
      setCurrent(0);
      setError("Completa tu nombre y el dato de identificación solicitado.");
      window.setTimeout(
        () =>
          document
            .getElementById("identity-section")
            ?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
      return;
    }

    if (!ineReady) {
      setError(
        survey.ineRequired
          ? ineNeedsBack
            ? "Toma la fotografía del frente y reverso de tu INE para enviar."
            : "Toma la fotografía del frente de tu INE para enviar."
          : ineNeedsBack
            ? "Completa frente y reverso o elimina la fotografía que agregaste."
            : "Completa el frente de la INE o elimina la fotografía que agregaste.",
      );
      window.setTimeout(
        () =>
          document
            .getElementById("ine-section")
            ?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
      return;
    }

    const firstIncomplete = survey.questions.findIndex(
      (item) => !responseIsReady(item, answers, otherAnswers),
    );
    if (firstIncomplete >= 0) {
      setCurrent(firstIncomplete);
      setError(`Falta responder la pregunta ${firstIncomplete + 1}.`);
      window.setTimeout(
        () =>
          document
            .getElementById("current-question")
            ?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
      return;
    }

    const finalAnswers = { ...answers };
    for (const [questionId, text] of Object.entries(otherAnswers)) {
      if (!text.trim()) continue;
      const currentValue = finalAnswers[questionId];
      const hasOther = Array.isArray(currentValue)
        ? currentValue.some(isOtherOption)
        : isOtherOption(currentValue);
      if (!hasOther) continue;

      const formatted = `Otro: ${text.trim().slice(0, 160)}`;
      finalAnswers[questionId] = Array.isArray(currentValue)
        ? [...currentValue.filter((item) => !isOtherOption(item)), formatted]
        : formatted;
    }

    setSubmitting(true);
    try {
      const cleanPerson = Object.fromEntries(
        Object.entries(person).filter(([, value]) => value.trim()),
      );
      const response = await fetch(
        `/api/yalika/survey/public/${encodeURIComponent(survey.slug)}/responses`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            person: cleanPerson,
            invitationToken,
            acceptPrivacy: accepted,
            consentContact: false,
            contactChannels: [],
            ine: ineFront
              ? {
                  frontImage: ineFront,
                  ...(ineBack ? { backImage: ineBack } : {}),
                }
              : undefined,
            answers: finalAnswers,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
        folio?: string;
        thankYouMessage?: string;
        results?: Results | null;
      };

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(". ")
            : data.message || "No fue posible enviar las respuestas",
        );
      }

      localStorage.removeItem(draftKey(survey.slug));
      const baseThankYou = data.thankYouMessage || survey.thankYouMessage || "Gracias por participar.";
      setThankYou(`${baseThankYou}${data.folio ? ` · Folio ${data.folio}` : ""}`);
      setResults(data.results ?? null);
      setIneFront("");
      setIneBack("");
      setCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No fue posible enviar",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const closeSurvey = () => {
    window.close();
    window.setTimeout(() => setCloseBlocked(true), 200);
  };

  if (completed) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#153d59_0,#071425_42%,#050b14_100%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-2xl">
          <section className="rounded-[2rem] border border-emerald-300/20 bg-white/[0.06] p-7 text-center shadow-2xl sm:p-10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-3xl font-black text-slate-950">
              ✓
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
              Respuesta guardada
            </p>
            <h1 className="mt-2 text-3xl font-black">Gracias por participar</h1>
            <p className="mt-3 text-base font-semibold text-slate-200">
              {thankYou}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Tus datos se protegen y se usan conforme al aviso de privacidad que aceptaste.
            </p>
            {!closeBlocked ? (
              <button
                type="button"
                onClick={closeSurvey}
                className="mt-6 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950"
              >
                Finalizar encuesta
              </button>
            ) : null}
            {closeBlocked ? (
              <p className="mt-3 rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-slate-300">
                Tu respuesta ya quedó guardada. Si esta pestaña no se cerró
                automáticamente, puedes cerrarla con seguridad.
              </p>
            ) : null}
          </section>
          {results ? (
            <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-black">Resultados generales</h2>
              <p className="mt-1 text-sm text-slate-400">
                {results.responseCount} participaciones
              </p>
              <div className="mt-5 space-y-5">
                {results.questions.map((resultQuestion) => {
                  const maximum = Math.max(
                    ...resultQuestion.answers.map((answer) => answer.count),
                    1,
                  );
                  return (
                    <article key={resultQuestion.id}>
                      <h3 className="text-sm font-bold">
                        {resultQuestion.prompt}
                      </h3>
                      <div className="mt-3 space-y-2">
                        {resultQuestion.answers.map((answer) => (
                          <div key={answer.option}>
                            <div className="flex justify-between text-xs text-slate-300">
                              <span>{answer.option}</span>
                              <strong>{answer.count}</strong>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                                style={{
                                  width: `${(answer.count / maximum) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#153d59_0,#071425_42%,#050b14_100%)] px-4 py-8 text-white sm:py-14">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_0.85fr]">
          <section className="rounded-[2.2rem] border border-white/10 bg-white/[0.055] p-7 shadow-2xl sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
              {survey.company.name}
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">
              {survey.title}
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300">
              {survey.description ||
                "Tu opinión nos ayuda a tomar mejores decisiones."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                {survey.questions.length} preguntas
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                {invitationToken ? "Enlace personal de un solo uso" : "Tu avance se guarda"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                Uso protegido
              </span>
              {survey.collectIne ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-amber-100">
                  INE {survey.ineRequired ? "necesaria" : "opcional"}
                </span>
              ) : null}
            </div>
          </section>
          <section className="rounded-[2.2rem] bg-white p-7 text-slate-950 shadow-2xl sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-700">
              Antes de comenzar
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Tu información está protegida
            </h2>
            <div className="mt-4 max-h-44 overflow-y-auto rounded-2xl bg-slate-100 p-4 text-sm leading-6 text-slate-600">
              {survey.privacyNotice}
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
              <input
                type="checkbox"
                required
                aria-required="true"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-1 h-5 w-5 accent-cyan-600"
              />
              <span className="text-sm font-semibold leading-6">
                Acepto el aviso de privacidad y deseo participar.
              </span>
            </label>
            {savedDraft ? (
              <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                Encontramos una respuesta anterior sin terminar en este
                dispositivo. Elige si deseas continuarla o comenzar desde cero.
              </div>
            ) : null}
            <button
              type="button"
              disabled={!accepted}
              onClick={savedDraft ? continueDraft : startNew}
              className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {savedDraft
                ? "Continuar respuesta guardada"
                : "Comenzar encuesta"}
            </button>
            {savedDraft ? (
              <button
                type="button"
                disabled={!accepted}
                onClick={startNew}
                className="mt-3 w-full rounded-2xl border border-slate-300 px-5 py-4 text-sm font-black text-slate-800 disabled:opacity-35"
              >
                Empezar desde cero
              </button>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#153d59_0,#071425_42%,#050b14_100%)] px-4 py-6 text-white sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
                {survey.company.name}
              </p>
              <h1 className="mt-1 truncate text-lg font-black">
                {survey.title}
              </h1>
            </div>
            <span className="shrink-0 text-xs font-bold text-slate-300">
              {current + 1} de {survey.questions.length}
            </span>
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Progreso de la encuesta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </header>

        {current === 0 && survey.collectIne ? (
          <section
            id="ine-section"
            className="mt-5 overflow-hidden rounded-[2rem] bg-white text-slate-950 shadow-xl"
          >
            <div className="bg-gradient-to-r from-amber-50 to-cyan-50 p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">
                    Documento de identificación
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Fotografía de tu INE</h2>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">
                  {survey.ineRequired ? "Necesaria para enviar" : "Opcional"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Esto no es una pregunta y no cambia tus respuestas. Las imágenes se
                guardan cifradas. {survey.ineStorageMode === "temporary"
                  ? "La organización eligió almacenamiento temporal para transferirlas a su propio respaldo."
                  : "La organización eligió conservarlas en la nube Yalika según su configuración."} Yalika no las elimina automáticamente sin que exista un respaldo confirmado; el periodo configurado es de
                {` ${survey.ineRetentionDays} días`}.
              </p>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
              {([
                ["front", "Frente", ineFront],
                ...(ineNeedsBack ? [["back", "Reverso", ineBack] as const] : []),
              ] as const).map(([side, label, preview]) => (
                <div key={side} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{label}</strong>
                    <span className={`text-xs font-bold ${preview ? "text-emerald-700" : "text-slate-400"}`}>
                      {preview ? "Lista ✓" : "Pendiente"}
                    </span>
                  </div>
                  {preview ? (
                    <div className="relative mt-3 aspect-[1.58/1] overflow-hidden rounded-xl bg-slate-100">
                      <Image
                        src={preview}
                        alt={`INE ${label.toLowerCase()}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 grid aspect-[1.58/1] place-items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs font-semibold leading-5 text-slate-500">
                      Coloca la INE completa, con buena luz y sin reflejos.
                    </div>
                  )}
                  <label className="mt-3 block cursor-pointer rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white">
                    {ineBusy === side
                      ? "Preparando…"
                      : preview
                        ? "Cambiar fotografía"
                        : "Tomar fotografía"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={Boolean(ineBusy)}
                      onChange={(event) => {
                        void chooseInePhoto(side, event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                      className="sr-only"
                    />
                  </label>
                  {preview ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (side === "front") {
                          setIneFront("");
                          setIneReadConsent(false);
                          setIneReadingMessage("");
                        } else {
                          setIneBack("");
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
                    >
                      Eliminar fotografía
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!ineReady ? (
              <div
                role="status"
                aria-live="polite"
                className="mx-6 mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 sm:mx-8"
              >
                {survey.ineRequired
                  ? ineNeedsBack
                    ? "Para terminar deben estar listas las dos fotografías."
                    : "Para terminar debe estar lista la fotografía del frente."
                  : ineNeedsBack
                    ? "Completa frente y reverso o elimina la fotografía que agregaste."
                    : "Completa el frente o elimina la fotografía que agregaste."}
              </div>
            ) : null}
            {survey.ineAutoExtract && ineCanPrefill && ineFront ? (
              <div className="mx-6 mb-4 rounded-xl bg-cyan-50 px-4 py-4 text-sm leading-5 text-cyan-950 sm:mx-8">
                {!ineReadConsent ? (
                  <>
                    <p className="font-black">¿Quieres que Yalika intente completar los datos visibles?</p>
                    <p className="mt-1 font-semibold text-cyan-900">
                      Si eliges esta opción, la fotografía del frente se procesará con el servicio de IA configurado por Yalika únicamente para leer los campos solicitados. No intentamos obtener teléfono ni correo desde la credencial. Podrás revisar y corregir todo antes de enviar.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIneReadConsent(true);
                        void readIneFields(ineFront);
                      }}
                      className="mt-3 rounded-xl bg-cyan-950 px-4 py-2.5 text-xs font-black text-white"
                    >
                      Sí, ayudarme a llenar los datos
                    </button>
                  </>
                ) : (
                  <div role="status" aria-live="polite" className="font-semibold">
                    {ineReading
                      ? "Leyendo datos visibles de la INE…"
                      : ineReadingMessage ||
                        "Revisa los datos que aparezcan abajo; puedes corregirlos manualmente."}
                  </div>
                )}
              </div>
            ) : null}
            <p className="px-6 pb-6 text-xs font-semibold leading-5 text-slate-500 sm:px-8 sm:pb-8">
              Al continuar confirmas el aviso de privacidad que aceptaste al
              inicio. La persona que creó la encuesta podrá descargar o eliminar
              estas imágenes mientras estén vigentes.
            </p>
          </section>
        ) : null}

        {current === 0 && fields.length > 0 ? (
          <section id="identity-section" className="mt-5 rounded-3xl bg-white p-6 text-slate-950">
            <h2 className="text-2xl font-bold">Tus datos</h2>
            <p className="mt-2 text-sm">Revisa los datos y corrige lo que sea necesario. Los campos con * son obligatorios.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map(field => <label key={field.key} className="text-sm font-bold">{fieldLabels[field.key]} {field.required ? '*' : '(opcional)'}
                <input type={field.key === 'email' ? 'email' : field.key === 'phone' ? 'tel' : 'text'} required={field.required}
                  value={person[field.key]} maxLength={field.key === 'address' ? 320 : field.key === 'email' ? 254 : field.key === 'phone' ? 30 : field.key === 'curp' ? 18 : field.key === 'voterKey' ? 20 : field.key === 'electoralSection' ? 4 : field.key === 'postalCode' ? 5 : 180}
                  onChange={event => setPerson(value => ({...value,[field.key]:event.target.value}))}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
              </label>)}
            </div>
          </section>
        ) : null}

        <form
          onSubmit={submit}
          id="current-question"
          aria-busy={submitting}
          className="mt-5 rounded-[2rem] bg-white p-6 text-slate-950 shadow-xl sm:p-8"
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
            Pregunta {current + 1}
          </p>
          <h2
            id="survey-question-title"
            className="mt-2 text-2xl font-black leading-8"
          >
            {question.prompt}
          </h2>
          {question.required ? (
            <p className="mt-2 text-xs font-bold text-fuchsia-700">
              Respuesta obligatoria
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Puedes dejarla sin responder
            </p>
          )}

          <div
            className="mt-6 space-y-3"
            role="group"
            aria-labelledby="survey-question-title"
          >
            {question.type === "rating" && question.options.length >= 2 ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-cyan-50 px-4 py-3 text-xs font-bold text-cyan-950">
                <span>{question.options[0]}</span>
                <span className="text-right">
                  {question.options[question.options.length - 1]}
                </span>
              </div>
            ) : null}
            {["choice", "yesno", "rating"].includes(question.type)
              ? question.options.map((option) => {
                  const selected = answers[question.id] === option;
                  return (
                    <label
                      key={option}
                      className={`block cursor-pointer rounded-2xl border p-4 transition ${selected ? "border-cyan-500 bg-cyan-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name={question.id}
                          required={question.required}
                          checked={answers[question.id] === option}
                          onChange={() => {
                            setAnswers((value) => ({
                              ...value,
                              [question.id]: option,
                            }));
                            if (!isOtherOption(option)) {
                              setOtherAnswers((value) => {
                                const next = { ...value };
                                delete next[question.id];
                                return next;
                              });
                            }
                          }}
                          className="h-5 w-5 accent-cyan-600"
                        />
                        <span className="font-bold">{option}</span>
                      </span>
                      {isOtherOption(option) && isOtherOption(answers[question.id]) ? (
                        <input
                          value={otherAnswers[question.id] ?? ""}
                          onChange={(event) =>
                            setOtherAnswers((value) => ({
                              ...value,
                              [question.id]: event.target.value,
                            }))
                          }
                          required
                          aria-label={`Especifica la opción ${option}`}
                          maxLength={160}
                          className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3"
                          placeholder="Escribe tu respuesta"
                          autoFocus
                        />
                      ) : null}
                    </label>
                  );
                })
              : null}

            {question.type === "multi"
              ? question.options.map((option) => {
                  const currentValues = Array.isArray(answers[question.id])
                    ? (answers[question.id] as string[])
                    : [];
                  const checked = currentValues.includes(option);
                  return (
                    <label
                      key={option}
                      className={`block cursor-pointer rounded-2xl border p-4 transition ${checked ? "border-cyan-500 bg-cyan-50" : "border-slate-200"}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setAnswers((value) => ({
                              ...value,
                              [question.id]: event.target.checked
                                ? [...currentValues, option]
                                : currentValues.filter(
                                    (item) => item !== option,
                                  ),
                            }));
                            if (!event.target.checked && isOtherOption(option)) {
                              setOtherAnswers((value) => {
                                const next = { ...value };
                                delete next[question.id];
                                return next;
                              });
                            }
                          }}
                          className="h-5 w-5 accent-cyan-600"
                        />
                        <span className="font-bold">{option}</span>
                      </span>
                      {isOtherOption(option) && checked ? (
                        <input
                          value={otherAnswers[question.id] ?? ""}
                          onChange={(event) =>
                            setOtherAnswers((value) => ({
                              ...value,
                              [question.id]: event.target.value,
                            }))
                          }
                          required
                          aria-label={`Especifica la opción ${option}`}
                          maxLength={160}
                          className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3"
                          placeholder="Escribe tu respuesta"
                        />
                      ) : null}
                    </label>
                  );
                })
              : null}

            {question.type === "text" ? (
              <textarea
                value={String(answers[question.id] ?? "")}
                onChange={(event) =>
                  setAnswers((value) => ({
                    ...value,
                    [question.id]: event.target.value,
                  }))
                }
                rows={6}
                maxLength={3000}
                required={question.required}
                aria-required={question.required}
                className="w-full rounded-2xl border border-slate-200 p-4 outline-none focus:border-cyan-600"
                placeholder="Escribe tu respuesta"
              />
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => {
                setError("");
                setCurrent((value) => Math.max(value - 1, 0));
              }}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black disabled:opacity-30"
            >
              Anterior
            </button>
            {current < survey.questions.length - 1 ? (
              <button
                type="button"
                disabled={!answerReady() || (current === 0 && !identityReady)}
                onClick={next}
                className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Siguiente
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  submitting ||
                  !answerReady() ||
                  (current === 0 && !identityReady)
                }
                className="rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Guardando…" : "Enviar respuestas"}
              </button>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            Puedes cerrar y regresar después; tu avance se guarda en este
            teléfono.
          </p>
        </form>
      </div>
    </main>
  );
}
