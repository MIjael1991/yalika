"use client";

import { fieldLabels, legacyFields, type PersonalField } from "../../lib/survey-fields";
import QRCode from "qrcode";
import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type SurveyQuestion = {
  id: string;
  prompt: string;
  type: string;
  options: string[];
  required: boolean;
  publicAggregate: boolean;
  sortOrder: number;
};

export type SurveyRecord = {
  accessMode?: "public" | "group" | "private";
  personalFields?: PersonalField[] | null;
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  identityMode: string;
  collectMunicipality: boolean;
  collectLocality: boolean;
  collectPostalCode: boolean;
  collectAddress: boolean;
  collectCurp: boolean;
  collectVoterKey: boolean;
  collectElectoralSection: boolean;
  collectIne: boolean;
  ineCaptureMode: "front" | "front_back";
  ineAutoExtract: boolean;
  ineRequired: boolean;
  ineRetentionDays: number;
  ineStorageMode: "temporary" | "yaleka_cloud";
  showPublicResults: boolean;
  privacyNotice: string;
  thankYouMessage: string | null;
  questions: SurveyQuestion[];
  updatedAt: string;
  _count: {
    responses: number;
    ineSubmissions: number;
  };
};

type IneRecord = {
  id: string;
  folio: string;
  personName: string;
  completedAt: string;
  expiresAt: string;
  downloadedAt: string | null;
  downloadCount: number;
  backupConfirmedAt: string | null;
  deletedAt: string | null;
  available: boolean;
  retentionOverdue: boolean;
  hasBack: boolean;
  totalBytes: number;
};

type EditableQuestion = {
  key: string;
  prompt: string;
  type: "choice" | "multi" | "yesno" | "rating" | "text";
  optionsText: string;
  required: boolean;
  publicAggregate: boolean;
};

type Results = {
  totalResponseCount: number;
  responseCount: number;
  filters: {
    from: string;
    to: string;
    municipality: string;
    locality: string;
    electoralSection: string;
  };
  availableMunicipalities: string[];
  availableLocalities: string[];
  availableElectoralSections: string[];
  insights: string[];
  generatedAt: string;
  participants: Array<{
    responseId: string;
    folio: string;
    completedAt: string;
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
  }>;
  questions: Array<{
    id: string;
    prompt: string;
    type: string;
    answers: Array<{
      option: string;
      count: number;
    }>;
    textAnswers: string[];
    textAnswerCount: number;
    textAnswersTruncated: boolean;
  }>;
};

type ResultsFilter = {
  from: string;
  to: string;
  municipality: string;
  locality: string;
  electoralSection: string;
};

const emptyResultsFilter: ResultsFilter = {
  from: "",
  to: "",
  municipality: "",
  locality: "",
  electoralSection: "",
};

type SpellProposal = {
  title: string;
  description: string;
  questions: Array<{
    prompt: string;
    type: EditableQuestion["type"];
    options: string[];
  }>;
  mode?: "ai";
  note?: string;
};

type SurveySuggestion = {
  title: string;
  description: string;
  identityMode: string;
  note: string;
  mode: "ai" | "local";
  questions: Array<{
    prompt: string;
    type: EditableQuestion["type"];
    options: string[];
    required: boolean;
    publicAggregate: boolean;
  }>;
};

const resultColors = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];

function questionTypeLabel(type: string) {
  if (type === "multi") return "Selección múltiple";
  if (type === "yesno") return "Sí o no";
  if (type === "rating") return "Escala";
  if (type === "text") return "Respuesta escrita";
  return "Una opción";
}

function resultPercentage(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function ratingNumber(option: string) {
  const match = option.trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function questionTemplate(): EditableQuestion {
  return {
    key: crypto.randomUUID(),
    prompt: "",
    type: "choice",
    optionsText: "Opción 1\nOpción 2\nOtro",
    required: true,
    publicAggregate: true,
  };
}

const defaultPrivacy =
  "Acepto que mis respuestas se utilicen únicamente para los fines indicados en esta encuesta. Mis datos de contacto permanecerán separados de mis respuestas y no serán compartidos sin autorización.";

const inePrivacy =
  "Si envío fotografía(s) de mi INE, acepto que se utilicen únicamente para la identificación relacionada con esta encuesta. Si está activada la ayuda de lectura, Yaleka intentará completar sólo los datos solicitados y yo podré corregirlos antes de enviar. Las imágenes se guardan cifradas y la organización responsable debe respaldarlas antes de liberar el almacenamiento temporal. Puedo solicitar su eliminación a la organización responsable.";

async function api<T>(path: string, options?: RequestInit) {
  const response = await fetch(`/api/orion/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };

  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join(". ")
      : data.message;
    throw new Error(message || "No fue posible completar la operación");
  }

  return data;
}

function statusLabel(status: string) {
  if (status === "active") return "Recibiendo respuestas";
  if (status === "closed") return "Cerrada";
  return "Borrador";
}

function statusClass(status: string) {
  if (status === "active")
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "closed")
    return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

function normalizePublicBaseUrl(value: string) {
  const candidate = value.trim();

  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`,
    );

    return url.origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isLocalUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

export function SurveyWorkspace({
  currentUserName,
  initialSurveys,
}: {
  currentUserName: string;
  initialSurveys: SurveyRecord[];
}) {
  const [surveys, setSurveys] = useState(initialSurveys);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState("public");
  const [personalFields, setPersonalFields] = useState<PersonalField[]>([{key:"name",required:true},{key:"phone",required:true}]);
  const [importBusy, setImportBusy] = useState(false);
  const [identityMode, setIdentityMode] = useState("phone");
  const [collectMunicipality, setCollectMunicipality] = useState(false);
  const [collectLocality, setCollectLocality] = useState(false);
  const [collectPostalCode, setCollectPostalCode] = useState(false);
  const [collectAddress, setCollectAddress] = useState(false);
  const [collectCurp, setCollectCurp] = useState(false);
  const [collectVoterKey, setCollectVoterKey] = useState(false);
  const [collectElectoralSection, setCollectElectoralSection] = useState(false);
  const [collectIne, setCollectIne] = useState(false);
  const [ineCaptureMode, setIneCaptureMode] = useState<"front" | "front_back">("front");
  const [ineAutoExtract, setIneAutoExtract] = useState(true);
  const [, setIneRequired] = useState(false);
  const [ineRetentionDays, setIneRetentionDays] = useState(30);
  const [ineStorageMode, setIneStorageMode] = useState<"temporary" | "yaleka_cloud">("temporary");
  const [ineBackupDownloaded, setIneBackupDownloaded] = useState(false);
  const [showPublicResults, setShowPublicResults] = useState(false);
  const [assistantResult, setAssistantResult] = useState<{mode:"ai"|"local";note:string}|null>(null);
  const [assistantRequest, setAssistantRequest] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [spellBusy, setSpellBusy] = useState(false);
  const [spellPreview, setSpellPreview] = useState<{
    base: string;
    original: SpellProposal;
    proposal: SpellProposal;
  } | null>(null);
  const [privacyNotice, setPrivacyNotice] = useState(defaultPrivacy);
  const [questions, setQuestions] = useState<EditableQuestion[]>([
    questionTemplate(),
  ]);
  const [saving, setSaving] = useState(false);
  const [deletingSurveyId, setDeletingSurveyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareSurvey, setShareSurvey] = useState<SurveyRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [resultsSurveyId, setResultsSurveyId] = useState("");
  const [resultsTitle, setResultsTitle] = useState("");
  const [resultsFilter, setResultsFilter] =
    useState<ResultsFilter>(emptyResultsFilter);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [listeningKey, setListeningKey] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [publicBaseInput, setPublicBaseInput] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [surveySearch, setSurveySearch] = useState("");
  const [surveyStatusFilter, setSurveyStatusFilter] = useState("all");
  const [ineSurvey, setIneSurvey] = useState<SurveyRecord | null>(null);
  const [ineRecords, setIneRecords] = useState<IneRecord[]>([]);
  const [ineLoading, setIneLoading] = useState(false);

  const counts = useMemo(
    () => ({
      total: surveys.length,
      active: surveys.filter((survey) => survey.status === "active").length,
      responses: surveys.reduce(
        (sum, survey) => sum + survey._count.responses,
        0,
      ),
    }),
    [surveys],
  );
  const visibleSurveys = useMemo(() => {
    const search = surveySearch.trim().toLocaleLowerCase("es-MX");

    return surveys.filter((survey) => {
      if (
        surveyStatusFilter !== "all" &&
        survey.status !== surveyStatusFilter
      ) {
        return false;
      }

      if (!search) return true;
      return `${survey.title} ${survey.description ?? ""}`
        .toLocaleLowerCase("es-MX")
        .includes(search);
    });
  }, [surveySearch, surveyStatusFilter, surveys]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const configured = normalizePublicBaseUrl(
        process.env.NEXT_PUBLIC_APP_URL ?? "",
      );
      const saved = normalizePublicBaseUrl(
        window.localStorage.getItem("platform-public-url") ?? "",
      );
      const current = window.location.origin.replace(/\/+$/, "");
      const selected = configured || saved || current;

      setPublicBaseUrl(selected);
      if (!isLocalUrl(selected)) {
        setPublicBaseInput(selected);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!shareSurvey) {
        setShareUrl("");
        setQrDataUrl("");
        return;
      }

      const base = publicBaseUrl || window.location.origin.replace(/\/+$/, "");
      const url = `${base}/e/${shareSurvey.slug}`;
      setShareUrl(url);

      if (isLocalUrl(url)) {
        setQrDataUrl("");
        return;
      }

      QRCode.toDataURL(url, {
        width: 420,
        margin: 2,
        color: {
          dark: "#071425",
          light: "#ffffff",
        },
      })
        .then((value) => {
          if (active) setQrDataUrl(value);
        })
        .catch(() => {
          if (active) {
            setError("No pude preparar el QR. Puedes copiar el enlace.");
          }
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [publicBaseUrl, shareSurvey]);

  const usePublicAddress = () => {
    const normalized = normalizePublicBaseUrl(publicBaseInput);

    if (
      !normalized ||
      isLocalUrl(normalized) ||
      !normalized.startsWith("https://")
    ) {
      setError(
        "Pega la dirección pública completa que comienza con https://. No uses localhost.",
      );
      return;
    }

    window.localStorage.setItem("platform-public-url", normalized);
    setPublicBaseUrl(normalized);
    setError("");
    setMessage(
      "Dirección pública aplicada. El enlace y el QR ya funcionan en teléfonos.",
    );
  };

  const moveQuestion = (fromIndex: number, toIndex: number) => {
    setQuestions((items) => {
      if (
        fromIndex < 0 ||
        fromIndex >= items.length ||
        toIndex < 0 ||
        toIndex >= items.length ||
        fromIndex === toIndex
      ) {
        return items;
      }

      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const refresh = async () => {
    const data = await api<SurveyRecord[]>("survey");
    setSurveys(data);
    return data;
  };

  const publishAndShare = async (survey: SurveyRecord) => {
    if ((survey.accessMode ?? 'public') !== 'public') {
      try {
        if (survey.status !== 'active') {
          await api(`survey/${survey.id}/status`, {method:'PATCH',body:JSON.stringify({status:'active'})});
          setSurveys(current => current.map(item => item.id === survey.id ? {...item,status:'active'} : item));
        }
        setMessage('Encuesta abierta. Importa la lista y descarga los enlaces individuales desde su tarjeta.');
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo abrir'); }
      return;
    }

    setError("");
    setMessage("");

    if (survey.status === "active") {
      setShareSurvey(survey);
      return;
    }

    try {
      const published = await api<SurveyRecord>(`survey/${survey.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      await refresh();
      setShareSurvey(published);
      setMessage(
        "Encuesta publicada. El enlace ya está listo para recibir respuestas.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude publicar la encuesta",
      );
    }
  };

  const resetCreator = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setIdentityMode("phone");
    setAccessMode("public");
    setPersonalFields([{key:"name",required:true},{key:"phone",required:true}]);
    setCollectMunicipality(false);
    setCollectLocality(false);
    setCollectPostalCode(false);
    setCollectAddress(false);
    setCollectCurp(false);
    setCollectVoterKey(false);
    setCollectIne(false);
    setIneCaptureMode("front");
    setIneAutoExtract(true);
    setIneRequired(false);
    setIneRetentionDays(30);
    setIneStorageMode("temporary");
    setIneBackupDownloaded(false);
    setShowPublicResults(false);
    setAssistantRequest("");
    setAssistantResult(null);
    setPrivacyNotice(defaultPrivacy);
    setQuestions([questionTemplate()]);
    setError("");
  };

  // Read only the visible editable draft. Never transmit response records, INE or contact fields.
  const editableTextSnapshot = (): SpellProposal => ({
    title,
    description,
    questions: questions.map((question) => ({
      prompt: question.prompt,
      type: question.type,
      options: question.type === "text" ? [] : question.type === "yesno"
        ? ["Sí", "No"] : question.optionsText.split("\n")
          .map((option) => option.trim()).filter(Boolean),
    })),
  });

  const reviewSpelling = async () => {
    if (editingId && surveys.some((survey) => survey.id === editingId && survey._count.responses > 0)) {
      setError("Esta encuesta ya tiene respuestas. Duplícala antes de cambiar su texto.");
      return;
    }
    const original = editableTextSnapshot();
    if (!original.title.trim() || original.questions.some((q) => q.prompt.trim().length < 3)) {
      setError("Escribe el título y las preguntas antes de corregir su ortografía.");
      return;
    }
    const base = JSON.stringify(original);
    setSpellBusy(true);
    setSpellPreview(null);
    setError("");
    try {
      const proposal = await api<SpellProposal>("survey/proofread", {
        method: "POST",
        body: JSON.stringify({ draft: original }),
      });
      if (proposal.questions.length !== questions.length ||
        proposal.questions.some((q, i) =>
          q.type !== original.questions[i].type ||
          q.options.length !== original.questions[i].options.length)) {
        throw new Error("La corrección cambió el formato. No se aplicó nada.");
      }
      setSpellPreview({ base, original, proposal });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude corregir el texto.");
    } finally {
      setSpellBusy(false);
    }
  };

  const acceptSpelling = () => {
    if (!spellPreview) return;
    if (JSON.stringify(editableTextSnapshot()) !== spellPreview.base) {
      setError("Cambió el borrador durante la revisión. Vuelve a solicitar la corrección.");
      setSpellPreview(null);
      return;
    }
    setTitle(spellPreview.proposal.title);
    setDescription(spellPreview.proposal.description);
    setQuestions((current) => current.map((q, i) => ({
      ...q,
      prompt: spellPreview.proposal.questions[i].prompt,
      optionsText: q.type === "text" ? q.optionsText
        : spellPreview.proposal.questions[i].options.join("\n"),
    })));
    setSpellPreview(null);
    setMessage("Correcciones aplicadas solamente al borrador. Revisa y guarda cuando quieras.");
  };

  const prepareWithAssistant = async () => {
    const request =
      assistantRequest.trim() ||
      [title, description].filter(Boolean).join(". ").trim();

    if (request.length < 5) {
      setError(
        "Dime brevemente para qué necesitas la encuesta. Puedes escribirlo o dictarlo.",
      );
      return;
    }

    setAssistantBusy(true);
    setAssistantResult(null);
    setError("");
    setMessage("");
    try {
      const suggestion = await api<SurveySuggestion>("survey/suggest", {
        method: "POST",
        body: JSON.stringify({
          request,
          draft: {
            title,
            description,
            identityMode,
            questions: questions
              .filter((question) => question.prompt.trim())
              .map((question) => ({
                prompt: question.prompt.trim(),
                type: question.type,
                options: question.optionsText
                  .split("\n")
                  .map((option) => option.trim())
                  .filter(Boolean),
                required: true,
                publicAggregate: question.publicAggregate,
              })),
          },
        }),
      });
      setTitle(suggestion.title);
      setDescription(suggestion.description);
      setIdentityMode(suggestion.identityMode);
      const requested = request.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const fields = legacyFields({identityMode:suggestion.identityMode});
      for (const [key,pattern] of Object.entries({name:/nombre/,phone:/telefono|celular/,email:/correo|email/,address:/domicilio|direccion/,curp:/curp/})) {
        if (pattern.test(requested) && !fields.some(field => field.key === key)) fields.push({key:key as PersonalField['key'],required:true});
      }
      setPersonalFields(fields);
      if (/\bine\b/.test(requested) && !/sin ine|no (?:pedir|solicitar) ine/.test(requested)) { setCollectIne(true); setIneCaptureMode(/reverso|ambos lados/.test(requested) ? 'front_back' : 'front'); }

      setQuestions(
        suggestion.questions.map((question) => ({
          key: crypto.randomUUID(),
          prompt: question.prompt,
          type: question.type,
          optionsText:
            question.type === "rating" &&
            question.options.join("|") === "1|2|3|4|5"
              ? "1 · Muy malo o muy poco\n2\n3\n4\n5 · Excelente o mucho"
              : question.options.join("\n"),
          required: true,
          publicAggregate: question.publicAggregate,
        })),
      );
      setAssistantResult({mode:suggestion.mode,note:suggestion.note});
      setMessage(suggestion.note);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude preparar las preguntas",
      );
    } finally {
      setAssistantBusy(false);
    }
  };

  const editSurvey = (survey: SurveyRecord) => {
    setEditingId(survey.id);
    setTitle(survey.title);
    setDescription(survey.description ?? "");
    setIdentityMode(survey.identityMode);
    setAccessMode(survey.accessMode ?? "public");
    setPersonalFields(legacyFields(survey));
    setCollectMunicipality(survey.collectMunicipality);
    setCollectLocality(survey.collectLocality);
    setCollectPostalCode(survey.collectPostalCode);
    setCollectAddress(survey.collectAddress);
    setCollectCurp(survey.collectCurp);
    setCollectVoterKey(survey.collectVoterKey);
    setCollectElectoralSection(survey.collectElectoralSection ?? false);
    setCollectIne(survey.collectIne);
    setIneCaptureMode(survey.ineCaptureMode || "front");
    setIneAutoExtract(survey.ineAutoExtract ?? true);
    setIneRequired(survey.ineRequired);
    setIneRetentionDays(survey.ineRetentionDays ?? 30);
    setIneStorageMode(survey.ineStorageMode ?? "temporary");
    setIneBackupDownloaded(false);
    setShowPublicResults(survey.showPublicResults);
    setPrivacyNotice(survey.privacyNotice);
    setQuestions(
      survey.questions.map((question) => ({
        key: question.id,
        prompt: question.prompt,
        type: question.type as EditableQuestion["type"],
        optionsText: question.options.join("\n"),
        required: true,
        publicAggregate: question.publicAggregate,
      })),
    );
    setShowCreator(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dictate = (key: string, onText: (text: string) => void) => {
    const SpeechRecognitionConstructor =
      (
        window as typeof window & {
          SpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
            start: () => void;
            onresult: (event: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onend: () => void;
            onerror: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
            start: () => void;
            onresult: (event: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onend: () => void;
            onerror: () => void;
          };
        }
      ).SpeechRecognition ??
      (
        window as typeof window & {
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
            start: () => void;
            onresult: (event: {
              results: ArrayLike<ArrayLike<{ transcript: string }>>;
            }) => void;
            onend: () => void;
            onerror: () => void;
          };
        }
      ).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setError(
        "Este navegador no permite dictado. Puedes escribir normalmente.",
      );
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onText(transcript);
    };
    recognition.onend = () => setListeningKey("");
    recognition.onerror = () => {
      setListeningKey("");
      setError(
        "No pude escuchar. Revisa el permiso del micrófono e inténtalo otra vez.",
      );
    };
    setListeningKey(key);
    recognition.start();
  };

  const toggleIneCollection = (enabled: boolean) => {
    setCollectIne(enabled);
    if (enabled) {
      setIneCaptureMode("front");
      setIneAutoExtract(true);
    } else {
      setIneRequired(false);
      setIneCaptureMode("front");
      setIneAutoExtract(false);
    }
    setPrivacyNotice((current) => {
      const withoutIne = current
        .replace(`\n\n${inePrivacy}`, "")
        .replace(inePrivacy, "")
        .trim();
      return enabled ? `${withoutIne}\n\n${inePrivacy}` : withoutIne;
    });
  };

  const loadIneRecords = async (survey: SurveyRecord) => {
    setIneSurvey(survey);
    setIneRecords([]);
    setIneBackupDownloaded(false);
    setIneLoading(true);
    setError("");
    try {
      setIneRecords(await api<IneRecord[]>(`survey/${survey.id}/ine`));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude abrir los documentos de INE",
      );
      setIneSurvey(null);
    } finally {
      setIneLoading(false);
    }
  };

  const downloadIne = (
    surveyId: string,
    submissionId: string,
    side: "front" | "back",
  ) => {
    const link = document.createElement("a");
    link.href = `/api/orion/survey/${surveyId}/ine/${submissionId}/${side}`;
    link.download = `ine-${side}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const deleteIne = async (submissionId: string) => {
    if (!ineSurvey) return;
    if (
      !window.confirm(
        "¿Eliminar definitivamente la(s) fotografía(s) de esta INE? Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    setIneLoading(true);
    setError("");
    try {
      await api(`survey/${ineSurvey.id}/ine/${submissionId}`, {
        method: "DELETE",
      });
      setIneRecords((current) =>
        current.map((item) =>
          item.id === submissionId
            ? { ...item, available: false, deletedAt: new Date().toISOString() }
            : item,
        ),
      );
      setSurveys((current) =>
        current.map((survey) =>
          survey.id === ineSurvey.id
            ? {
                ...survey,
                _count: {
                  ...survey._count,
                  ineSubmissions: Math.max(
                    0,
                    (survey._count.ineSubmissions ?? 0) - 1,
                  ),
                },
              }
            : survey,
        ),
      );
      setMessage("Las fotografías fueron eliminadas definitivamente.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude eliminar las fotografías");
    } finally {
      setIneLoading(false);
    }
  };

  const importParticipants = async (survey: SurveyRecord, file?: File) => {
    if (!file) return;
    setImportBusy(true); setError(""); setMessage("");
    try {
      if (file.size > 2_000_000) throw new Error("El archivo debe pesar menos de 2 MB");
      const content = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await api<{imported:number;skipped:number}>(`survey/${survey.id}/invitations/import`, {method:"POST",body:JSON.stringify({filename:file.name,content})});
      setMessage(`${result.imported} invitaciones creadas; ${result.skipped} ya existían. Descarga los enlaces individuales para compartirlos.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo importar"); }
    finally { setImportBusy(false); }
  };

  const save = async (event: FormEvent, status: "draft" | "active") => {
    event.preventDefault();
    setError("");
    setMessage("");

    const payload = {
      title,
      description,
      status,
      identityMode,
      accessMode,
      personalFields,
      collectMunicipality,
      collectLocality,
      collectPostalCode,
      collectAddress,
      collectCurp,
      collectVoterKey,
      collectElectoralSection,
      collectLeaderProposal: false,
      collectIne,
      ineCaptureMode: collectIne ? ineCaptureMode : "front",
      ineAutoExtract: collectIne && ineAutoExtract,
      ineRequired: collectIne,
      ineRetentionDays,
      ineStorageMode: collectIne ? ineStorageMode : "temporary",
      showPublicResults,
      privacyNotice,
      thankYouMessage:
        "Gracias. Tu participación fue registrada correctamente.",
      questions: questions.map((question) => ({
        prompt: question.prompt,
        type: question.type,
        options: question.optionsText
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean),
        required: true,
        publicAggregate: question.publicAggregate,
      })),
    };

    setSaving(true);
    try {
      const saved = await api<SurveyRecord>(
        editingId ? `survey/${editingId}` : "survey",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      await refresh();
      resetCreator();
      setShowCreator(false);
      setMessage(
        status === "active"
          ? (accessMode === "public" ? "Encuesta publicada. Ya puedes compartir el enlace o QR." : "Encuesta abierta. Importa participantes y descarga los enlaces individuales desde su tarjeta.")
          : "Borrador guardado.",
      );
      if (status === "active") {
        if ((saved.accessMode ?? 'public') === 'public') setShareSurvey(saved);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pude guardar");
    } finally {
      setSaving(false);
    }
  };

  // YALEKA_DELETE_SURVEY_SAFE_V1: solamente encuestas sin respuestas ni documentos.
  // El backend valida nuevamente la propiedad y rechaza encuestas con respuestas.
  const deleteSurveySafely = async (survey: SurveyRecord) => {
    if (deletingSurveyId) return;
    if (survey._count.responses > 0 || survey._count.ineSubmissions > 0) {
      setError("Esta encuesta tiene respuestas o documentos. Por seguridad no se puede eliminar; puedes cerrarla.");
      return;
    }
    if (!window.confirm(
      `¿Eliminar definitivamente la encuesta "${survey.title}"?\n\nNo tiene respuestas ni INE registradas. También se perderán sus enlaces e invitaciones. Esta acción no se puede deshacer.`,
    )) return;

    setDeletingSurveyId(survey.id);
    setError("");
    setMessage("");
    try {
      await api(`survey/${survey.id}`, { method: "DELETE" });
      await refresh();
      if (editingId === survey.id) {
        resetCreator();
        setShowCreator(false);
      }
      if (shareSurvey?.id === survey.id) setShareSurvey(null);
      setMessage("Encuesta eliminada. Las encuestas con respuestas permanecen protegidas.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo eliminar la encuesta");
    } finally {
      setDeletingSurveyId(null);
    }
  };

  const changeStatus = async (survey: SurveyRecord) => {
    const status = survey.status === "active" ? "closed" : "active";

    if (
      status === "closed" &&
      !window.confirm(
        `¿Cerrar "${survey.title}"?\n\nDejará de aceptar respuestas nuevas. Las ${survey._count.responses} respuestas registradas se conservarán y podrás volver a abrirla después.`,
      )
    ) {
      return;
    }

    setError("");
    try {
      await api(`survey/${survey.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          confirmClose: status === "closed",
        }),
      });
      await refresh();
      setMessage(
        status === "active" ? "Encuesta abierta." : "Encuesta cerrada.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pude cambiar el estado",
      );
    }
  };

  const requestResults = async (
    surveyId: string,
    surveyTitle: string,
    filter: ResultsFilter,
  ) => {
    setError("");
    setResultsLoading(true);
    try {
      const query = new URLSearchParams();
      if (filter.from) query.set("from", filter.from);
      if (filter.to) query.set("to", filter.to);
      if (filter.municipality) query.set("municipality", filter.municipality);
      if (filter.locality) query.set("locality", filter.locality);
      if (filter.electoralSection) query.set("electoralSection", filter.electoralSection);
      query.set("textLimit", "100");
      const data = await api<Results>(
        `survey/${surveyId}/results?${query.toString()}`,
      );
      setResultsTitle(surveyTitle);
      setResults(data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No pude cargar resultados",
      );
    } finally {
      setResultsLoading(false);
    }
  };

  const loadResults = async (survey: SurveyRecord) => {
    const filter = { ...emptyResultsFilter };
    setResultsSurveyId(survey.id);
    setResultsFilter(filter);
    await requestResults(survey.id, survey.title, filter);
  };

  const applyResultsFilter = async () => {
    if (!resultsSurveyId) return;
    await requestResults(resultsSurveyId, resultsTitle, resultsFilter);
  };

  const clearResultsFilter = async () => {
    if (!resultsSurveyId) return;
    const filter = { ...emptyResultsFilter };
    setResultsFilter(filter);
    await requestResults(resultsSurveyId, resultsTitle, filter);
  };

  const downloadFile = (path: string) => {
    const link = document.createElement("a"); link.href = `/api/orion/${path}`; document.body.appendChild(link); link.click(); link.remove();
  };
  const downloadResults = () => { if (resultsSurveyId) downloadFile(`survey/${resultsSurveyId}/export.xlsx`); };
  const downloadIneArchive = () => { if (ineSurvey) downloadFile(`survey/${ineSurvey.id}/ine/archive`); };
  const downloadFullBackup = () => { if (resultsSurveyId) downloadFile(`survey/${resultsSurveyId}/backup.zip`); };
  const downloadIneBackup = () => {
    if (!ineSurvey) return;
    downloadFile(`survey/${ineSurvey.id}/backup.zip`);
    setIneBackupDownloaded(true);
    setMessage("Respaldo iniciado. Cuando confirmes que el archivo quedó guardado en tu computadora, podrás marcar estas INE como respaldadas.");
  };
  const confirmIneBackup = async () => {
    if (!ineSurvey) return;
    if (!window.confirm("Confirma sólo si el ZIP ya quedó guardado en tu computadora o almacenamiento propio. ¿Marcar estas INE como respaldadas?")) return;
    setIneLoading(true); setError("");
    try {
      const result = await api<{ count: number }>(`survey/${ineSurvey.id}/backup/confirm`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
      setIneRecords((current) => current.map((item) => item.available ? { ...item, backupConfirmedAt: new Date().toISOString() } : item));
      setMessage(`${result.count} documento(s) quedaron marcados como respaldados.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pude confirmar el respaldo"); } finally { setIneLoading(false); }
  };
  const purgeBackedUpIne = async () => {
    if (!ineSurvey) return;
    const backed = ineRecords.filter((item) => item.available && item.backupConfirmedAt).length;
    if (!backed) { setError("Primero descarga el respaldo y confirma que ya lo guardaste."); return; }
    if (!window.confirm(`Se eliminarán del almacenamiento de Yaleka ${backed} documento(s) que ya marcaste como respaldados. El ZIP que guardaste no se modifica. ¿Continuar?`)) return;
    setIneLoading(true); setError("");
    try {
      const result = await api<{ deleted: number }>(`survey/${ineSurvey.id}/ine/purge-backed-up`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
      setIneRecords((current) => current.map((item) => item.backupConfirmedAt ? { ...item, available: false, deletedAt: new Date().toISOString() } : item));
      await refresh();
      setMessage(`${result.deleted} documento(s) respaldados fueron eliminados del almacenamiento de Yaleka.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pude liberar el espacio"); } finally { setIneLoading(false); }
  };

  const printIne = async (mode: "normal" | "compact") => {
    if (!ineSurvey) return; const available=ineRecords.filter((item)=>item.available); if(!available.length){setError("No hay INE disponibles para imprimir.");return;}
    const popup=window.open("","_blank"); if(!popup){setError("Permite ventanas emergentes para preparar la impresión.");return;}
    popup.document.write('<p style="font-family:Arial;padding:24px">Preparando documentos…</p>'); setIneLoading(true);
    try { const cards:string[]=[];
      for(const item of available){ const fetchSide=async(side:"front"|"back")=>{const response=await fetch(`/api/orion/survey/${ineSurvey.id}/ine/${item.id}/${side}`);if(!response.ok)return "";const blob=await response.blob();return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("No pude preparar una imagen"));reader.readAsDataURL(blob);});};
        const front=await fetchSide("front"); const back=item.hasBack?await fetchSide("back"):""; cards.push(`<section class="sheet ${mode==="compact"&&!back?"compact":""}"><div class="folio">Folio ${item.folio}</div>${front?`<img src="${front}" alt="INE frente ${item.folio}">`:""}${back?`<img src="${back}" alt="INE reverso ${item.folio}">`:""}</section>`); }
      popup.document.open(); popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>INE · ${ineSurvey.title}</title><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;color:#111;margin:0}.sheet{box-sizing:border-box;min-height:277mm;page-break-after:always;display:flex;flex-direction:column;justify-content:center;gap:12mm}.sheet.compact{min-height:133mm;page-break-after:auto;border-bottom:1px dashed #bbb}.folio{font-size:14pt;font-weight:700;text-align:center}.sheet img{max-width:100%;max-height:112mm;object-fit:contain;margin:auto}.sheet.compact img{max-height:92mm}@media print{button{display:none}}</style></head><body><button onclick="window.print()" style="position:fixed;right:18px;top:18px;padding:12px 18px;font-weight:bold">Imprimir / Guardar PDF</button>${cards.join("")}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`); popup.document.close();
    } catch(caught){popup.close();setError(caught instanceof Error?caught.message:"No pude preparar la impresión");} finally{setIneLoading(false);}
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#12314e_0,#071425_38%,#050c18_100%)] px-4 py-7 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
              Participación
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Encuestas fáciles
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Hola, {currentUserName}. Pregunta, comparte un QR y recibe
              resultados claros sin salir de la plataforma.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetCreator();
              setShowCreator((value) => !value);
            }}
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-300"
          >
            {showCreator ? "Cerrar creador" : "+ Nueva encuesta"}
          </button>
        </header>

        {message ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          >
            {message}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        ) : null}

        {showCreator ? (
          <form
            onSubmit={(event) => save(event, "draft")}
            className="mt-6 rounded-[2rem] border border-cyan-300/20 bg-[#0c1c31]/95 p-5 shadow-2xl shadow-black/20 sm:p-7"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
                  Creador guiado
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {editingId
                    ? "Editar encuesta"
                    : "Cuéntanos qué quieres preguntar"}
                </h2>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                Puedes escribir o dictar
              </span>
            </div>

            <section className="mt-6 rounded-2xl border border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-400/10 via-cyan-400/5 to-transparent p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">
                    Asistente para cualquier tema
                  </p>
                  <h3 className="mt-1 text-lg font-black">
                    Dime qué necesitas y preparo todo
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Puede crear encuestas de cualquier tema. Después también
                    puedes pedir: “cambia la pregunta 3”, “agrega dos preguntas”
                    o “hazla anónima”.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-fuchsia-300/10 px-3 py-1 text-[10px] font-bold text-fuchsia-200">
                  Todo queda editable
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={assistantRequest}
                  onChange={(event) => setAssistantRequest(event.target.value)}
                  rows={3}
                  maxLength={3000}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-fuchsia-300"
                  placeholder="Ejemplo: Crea 6 preguntas sobre adopción de mascotas para familias, con todas las opciones."
                />
                <button
                  type="button"
                  title="Dictar lo que necesitas"
                  onClick={() => dictate("assistant", setAssistantRequest)}
                  className="min-h-12 rounded-xl border border-fuchsia-300/30 px-4 text-sm font-bold text-fuchsia-200"
                >
                  {listeningKey === "assistant" ? "Escuchando…" : "🎙️ Dictar"}
                </button>
              </div>
              <button
                type="button"
                disabled={assistantBusy}
                onClick={prepareWithAssistant}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
              >
                {assistantBusy
                  ? "Preparando preguntas…"
                  : "✦ Preparar encuesta por mí"}
              </button>
              <button
                type="button"
                disabled={assistantBusy || spellBusy}
                onClick={() => void reviewSpelling()}
                className="mt-3 w-full rounded-xl border border-cyan-300/40 px-5 py-3 text-sm font-bold text-cyan-100 disabled:opacity-50"
              >
                {spellBusy ? "Revisando ortografía…" : "✓ Corregir ortografía y redacción"}
              </button>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Solo se envían título, descripción, preguntas y opciones a Gemini. No incluyas datos personales.
                Los cambios se muestran antes de aplicarse; no se guarda ni publica automáticamente.
              </p>
              {spellPreview ? (
                <div role="dialog" aria-modal="true" aria-label="Revisar correcciones" className="fixed inset-0 z-[95] overflow-y-auto bg-slate-950/95 p-4">
                  <div className="mx-auto my-6 max-w-4xl rounded-2xl border border-cyan-300/30 bg-[#0c1c31] p-5 sm:p-7">
                    <h3 className="text-xl font-black">Revisa antes de aplicar</h3>
                    <p className="mt-2 text-sm text-slate-300">Gemini puede equivocarse. Se conserva la cantidad de preguntas, sus tipos y el número de opciones. Nada está guardado todavía.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white/5 p-3"><strong>Antes: título</strong><p className="mt-2 whitespace-pre-wrap text-sm">{spellPreview.original.title}</p></div>
                      <div className="rounded-xl bg-cyan-300/10 p-3"><strong>Propuesta: título</strong><p className="mt-2 whitespace-pre-wrap text-sm">{spellPreview.proposal.title}</p></div>
                      <div className="rounded-xl bg-white/5 p-3"><strong>Antes: descripción</strong><p className="mt-2 whitespace-pre-wrap text-sm">{spellPreview.original.description}</p></div>
                      <div className="rounded-xl bg-cyan-300/10 p-3"><strong>Propuesta: descripción</strong><p className="mt-2 whitespace-pre-wrap text-sm">{spellPreview.proposal.description}</p></div>
                    </div>
                    {spellPreview.original.questions.map((q, i) => (
                      <div key={i} className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-white/5 p-3"><strong>Antes · pregunta {i+1}</strong><p className="mt-2 whitespace-pre-wrap text-sm">{q.prompt}</p><p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{q.options.join("\n")}</p></div>
                        <div className="rounded-xl bg-cyan-300/10 p-3"><strong>Propuesta · pregunta {i+1}</strong><p className="mt-2 whitespace-pre-wrap text-sm">{spellPreview.proposal.questions[i].prompt}</p><p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{spellPreview.proposal.questions[i].options.join("\n")}</p></div>
                      </div>
                    ))}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <button type="button" className="rounded-xl border border-white/20 p-3 font-bold" onClick={() => setSpellPreview(null)}>Descartar · conservar original</button>
                      <button type="button" className="rounded-xl bg-cyan-400 p-3 font-black text-slate-950" onClick={acceptSpelling}>Aplicar correcciones al borrador</button>
                    </div>
                  </div>
                </div>
              ) : null}
              {assistantResult ? <div role="status" className="mt-3 rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
                <strong>{assistantResult.mode === "ai" ? "Propuesta generada con IA" : "Propuesta local de respaldo"}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-300">{assistantResult.note}</p>
              </div> : null}
            </section>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Nombre de la encuesta</span>
                <span className="mt-1 block text-xs text-slate-400">
                  Ejemplo: ¿Qué necesita nuestra colonia?
                </span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={180}
                    required
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none transition focus:border-cyan-300"
                    placeholder="Escribe el tema"
                  />
                  <button
                    type="button"
                    title="Dictar el nombre"
                    onClick={() => dictate("title", setTitle)}
                    className="rounded-xl border border-cyan-300/30 px-4 text-cyan-200"
                  >
                    {listeningKey === "title" ? "Escuchando…" : "🎙️"}
                  </button>
                </div>
              </label>

              <label className="block text-sm font-bold">Audiencia
                <select value={accessMode} onChange={event => setAccessMode(event.target.value)} className="mt-2 w-full rounded-xl bg-[#071425] p-3">
                  <option value="public">Pública · cualquiera con el enlace</option>
                  <option value="group">Grupo · participantes de una lista</option>
                  <option value="private">Privada · personas específicas</option>
                </select>
              </label>
            </div>
            <section className="mt-5 rounded-2xl border border-white/10 p-4">
              <h3 className="font-bold">Datos personales</h3>
              <p className="mt-1 text-xs text-slate-300">Elige qué datos pedir y cuáles son obligatorios. El aviso de privacidad explica su uso.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(fieldLabels).map(([key,label]) => {
                  const field = personalFields.find(item => item.key === key);
                  return <label key={key} className="text-sm">{label}
                    <select value={field ? (field.required ? "required" : "optional") : "off"}
                      onChange={event => setPersonalFields(current => [...current.filter(item => item.key !== key), ...(event.target.value === "off" ? [] : [{key:key as PersonalField["key"],required:event.target.value === "required"}])])}
                      className="mt-1 w-full rounded-xl bg-[#071425] p-3">
                      <option value="off">No solicitar</option><option value="optional">Opcional</option><option value="required">Obligatorio</option>
                    </select>
                  </label>;
                })}
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-amber-300/20 bg-[#071425]">
              <label className="flex cursor-pointer items-start gap-4 p-4 sm:p-5">
                <input
                  type="checkbox"
                  checked={collectIne}
                  onChange={(event) => toggleIneCollection(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-amber-300"
                />
                <span className="min-w-0">
                  <strong className="block text-base text-white">
                    Solicitar fotografías de la INE
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">
                    No se agrega como pregunta. Por defecto sólo se pide el frente;
                    puedes activar también el reverso cuando realmente sea necesario.
                  </span>
                </span>
              </label>

              {collectIne ? (
                <div className="border-t border-white/10 bg-amber-300/[0.06] p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="rounded-xl border border-amber-300/20 p-4">
                      <span className="block text-sm font-black text-amber-100">Fotografías requeridas</span>
                      <select
                        value={ineCaptureMode}
                        onChange={(event) => setIneCaptureMode(event.target.value as "front" | "front_back")}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2 text-sm text-white"
                      >
                        <option value="front">Sólo frente (recomendado)</option>
                        <option value="front_back">Frente + reverso</option>
                      </select>
                    </label>
                    <p className="rounded-xl border border-amber-300/20 p-4 text-sm">Los lados seleccionados son obligatorios para enviar la encuesta.</p>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
                    <input
                      type="checkbox"
                      checked={ineAutoExtract}
                      onChange={(event) => setIneAutoExtract(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-cyan-300"
                    />
                    <span>
                      <strong className="block text-sm text-cyan-100">Ofrecer ayuda para llenar datos desde el frente</strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">
                        La persona podrá autorizar una lectura asistida del frente para intentar completar nombre, domicilio, CP, CURP, clave de elector y sección electoral sólo si esos datos se solicitan. Siempre podrá corregirlos. Teléfono y correo se capturan manualmente.
                      </span>
                    </span>
                  </label>
                  <label className="mt-3 block rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4">
                    <span className="block text-sm font-black text-emerald-100">Dónde se conservarán mientras trabajas</span>
                    <select value={ineStorageMode} onChange={(event) => setIneStorageMode(event.target.value as "temporary" | "yaleka_cloud")} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2 text-sm text-white">
                      <option value="temporary">Temporal para transferir a mi computadora · recomendado</option>
                      <option value="yaleka_cloud">Nube Yaleka · almacenamiento opcional</option>
                    </select>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">En modo temporal las fotos permanecen cifradas hasta que descargues el respaldo y confirmes que ya lo guardaste. Después podrás liberar el espacio del servidor. La conexión directa a nube propia será una opción posterior.</span>
                  </label>
                  <label className="mt-3 block rounded-xl border border-white/10 p-4">
                    <span className="block text-sm font-black text-white">Periodo de conservación / respaldo</span>
                    <select value={ineRetentionDays} onChange={(event) => setIneRetentionDays(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2 text-sm text-white">
                      <option value={7}>7 días</option><option value={30}>30 días (recomendado)</option><option value={90}>90 días</option><option value={180}>180 días</option>
                    </select>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">Al vencer el periodo, Yaleka sólo puede limpiar automáticamente documentos que ya tengan respaldo confirmado. Los pendientes se conservan para evitar pérdida accidental.</span>
                  </label>
                  <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-300 sm:grid-cols-3">
                    <span className="rounded-xl bg-white/5 p-3">🔒 Guardado cifrado</span>
                    <span className="rounded-xl bg-white/5 p-3">⬇ Descarga controlada</span>
                    <span className="rounded-xl bg-white/5 p-3">🗑 Retención configurable</span>
                  </div>
                </div>
              ) : null}
            </section>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Explica para qué sirve</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                placeholder="Una explicación corta y clara para quien responderá"
              />
            </label>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-black text-white">
                  Orden de las preguntas
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Usa Subir, Bajar o Al final. El orden que veas aquí será el
                  que verá la persona.
                </p>
              </div>
              <span className="text-xs font-bold text-cyan-200">
                {questions.length} preguntas
              </span>
            </div>

            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
              <span aria-hidden="true" className="font-black">
                ✓
              </span>
              <span>
                <strong className="block">
                  Todas las preguntas son obligatorias
                </strong>
                <span className="mt-1 block text-xs leading-5 text-emerald-100/75">
                  Así nadie podrá enviar una encuesta incompleta.
                </span>
              </span>
            </div>

            <div className="mt-3 space-y-4">
              {questions.map((question, index) => (
                <article
                  key={question.key}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-black text-white">
                      Pregunta {index + 1}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:flex">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, index - 1)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↑ Subir
                      </button>
                      <button
                        type="button"
                        disabled={index === questions.length - 1}
                        onClick={() => moveQuestion(index, index + 1)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↓ Bajar
                      </button>
                      <button
                        type="button"
                        disabled={index === questions.length - 1}
                        onClick={() =>
                          moveQuestion(index, questions.length - 1)
                        }
                        className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ⇣ Al final
                      </button>
                      {questions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((items) =>
                              items.filter((item) => item.key !== question.key),
                            )
                          }
                          className="col-span-3 rounded-lg border border-red-300/20 px-3 py-2 text-xs font-bold text-red-300 hover:text-red-200 sm:col-span-1"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                    <label>
                      <span className="text-xs font-bold text-slate-300">
                        ¿Qué quieres preguntar?
                      </span>
                      <div className="mt-2 flex gap-2">
                        <input
                          value={question.prompt}
                          onChange={(event) =>
                            setQuestions((items) =>
                              items.map((item) =>
                                item.key === question.key
                                  ? { ...item, prompt: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                          placeholder="Escribe una pregunta clara"
                        />
                        <button
                          type="button"
                          title="Dictar esta pregunta"
                          onClick={() =>
                            dictate(question.key, (text) =>
                              setQuestions((items) =>
                                items.map((item) =>
                                  item.key === question.key
                                    ? { ...item, prompt: text }
                                    : item,
                                ),
                              ),
                            )
                          }
                          className="rounded-xl border border-cyan-300/30 px-4 text-cyan-200"
                        >
                          {listeningKey === question.key ? "…" : "🎙️"}
                        </button>
                      </div>
                    </label>
                    <label>
                      <span className="text-xs font-bold text-slate-300">
                        Forma de responder
                      </span>
                      <select
                        value={question.type}
                        onChange={(event) => {
                          const type = event.target
                            .value as EditableQuestion["type"];
                          setQuestions((items) =>
                            items.map((item) =>
                              item.key === question.key
                                ? {
                                    ...item,
                                    type,
                                    optionsText:
                                      type === "yesno"
                                        ? "Sí\nNo"
                                        : type === "rating"
                                          ? "1 · Muy malo o muy poco\n2\n3\n4\n5 · Excelente o mucho"
                                          : item.optionsText,
                                    publicAggregate: type !== "text",
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                      >
                        <option value="choice">Elegir una opción</option>
                        <option value="multi">Elegir varias</option>
                        <option value="yesno">Sí o no</option>
                        <option value="rating">Escala del 1 al 5</option>
                        <option value="text">Respuesta escrita</option>
                      </select>
                    </label>
                  </div>

                  {["choice", "multi", "rating"].includes(question.type) ? (
                    <label className="mt-4 block">
                      <span className="text-xs font-bold text-slate-300">
                        Opciones, una por línea
                      </span>
                      {question.type === "rating" ? (
                        <span className="mt-1 block text-xs leading-5 text-cyan-200">
                          Aclara los extremos. Puedes cambiar “Muy malo /
                          Excelente” por “Muy poco / Mucho” según tu pregunta.
                        </span>
                      ) : null}
                      <textarea
                        value={question.optionsText}
                        onChange={(event) =>
                          setQuestions((items) =>
                            items.map((item) =>
                              item.key === question.key
                                ? { ...item, optionsText: event.target.value }
                                : item,
                            ),
                          )
                        }
                        rows={4}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                      />
                    </label>
                  ) : null}

                  <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-200">
                    <span aria-hidden="true">✓</span>
                    Respuesta obligatoria
                  </p>
                </article>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setQuestions((items) => [...items, questionTemplate()])
              }
              className="mt-4 w-full rounded-2xl border border-dashed border-cyan-300/30 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-300/5"
            >
              + Agregar otra pregunta
            </button>

            <details className="mt-6 rounded-2xl border border-white/10 bg-[#071425] p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-200">
                Aviso de privacidad
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Se muestra antes de comenzar. Las identidades se guardan
                separadas de las respuestas.
              </p>
              <textarea
                value={privacyNotice}
                onChange={(event) => setPrivacyNotice(event.target.value)}
                rows={5}
                required
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#050d19] px-4 py-3 text-sm outline-none focus:border-cyan-300"
              />
            </details>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-[#071425] p-4 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={showPublicResults}
                onChange={(event) => setShowPublicResults(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-cyan-400"
              />
              <span>
                <strong className="block text-white">
                  Mostrar resultados generales al terminar
                </strong>
                <span className="mt-1 block text-xs leading-5 text-slate-400">
                  Déjalo apagado para que solamente aparezca el agradecimiento y
                  la encuesta quede terminada.
                </span>
              </span>
            </label>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar borrador"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={(event) =>
                  save(event as unknown as FormEvent, "active")
                }
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
              >
                Guardar y publicar
              </button>
            </div>
          </form>
        ) : null}

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          {[
            ["Encuestas", counts.total, "Creadas en tu empresa"],
            ["Activas", counts.active, "Recibiendo respuestas"],
            ["Participaciones", counts.responses, "Respuestas completadas"],
          ].map(([label, value, help]) => (
            <article
              key={label}
              className="rounded-3xl border border-white/10 bg-white/[0.045] p-5"
            >
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-4xl font-black">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{help}</p>
            </article>
          ))}
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Tus proyectos
              </p>
              <h2 className="mt-1 text-2xl font-black">Encuestas guardadas</h2>
            </div>
          </div>

          {surveys.length ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:grid-cols-[1fr_220px]">
              <label>
                <span className="sr-only">Buscar encuesta</span>
                <input
                  value={surveySearch}
                  onChange={(event) => setSurveySearch(event.target.value)}
                  placeholder="Buscar por nombre o descripción"
                  className="w-full rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                />
              </label>
              <label>
                <span className="sr-only">Filtrar por estado</span>
                <select
                  value={surveyStatusFilter}
                  onChange={(event) =>
                    setSurveyStatusFilter(event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#071425] px-4 py-3 text-sm outline-none focus:border-cyan-300"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Recibiendo respuestas</option>
                  <option value="draft">Borradores</option>
                  <option value="closed">Cerradas</option>
                </select>
              </label>
            </div>
          ) : null}

          {surveys.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowCreator(true)}
              className="mt-5 w-full rounded-[2rem] border border-dashed border-white/15 bg-white/[0.025] px-6 py-14 text-center"
            >
              <span className="block text-4xl">✨</span>
              <span className="mt-3 block text-lg font-black">
                Crea tu primera encuesta
              </span>
              <span className="mt-1 block text-sm text-slate-400">
                Puedes dictarla y publicarla en pocos minutos.
              </span>
            </button>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {visibleSurveys.map((survey) => (
                <article
                  key={survey.id}
                  className="rounded-3xl border border-white/10 bg-[#0c1c31]/90 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(survey.status)}`}
                      >
                        {statusLabel(survey.status)}
                      </span>
                      {survey.collectIne ? (
                        <span className="ml-2 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-100">
                          INE {survey.ineRequired ? "necesaria" : "opcional"}
                        </span>
                      ) : null}
                      <h3 className="mt-3 truncate text-xl font-black">
                        {survey.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400">
                        {survey.description || "Sin descripción"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-4 py-3 text-center">
                      <strong className="block text-2xl">
                        {survey._count.responses}
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        respuestas
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => editSurvey(survey)}
                      className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/5"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => publishAndShare(survey)}
                      className="rounded-xl border border-cyan-300/25 px-3 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-300/5"
                    >
                      {survey.status === "active"
                        ? "Compartir"
                        : "Publicar y compartir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadResults(survey)}
                      className="rounded-xl border border-fuchsia-300/20 px-3 py-2.5 text-xs font-bold text-fuchsia-200 hover:bg-fuchsia-300/5"
                    >
                      Resultados
                    </button>
                    <button
                      type="button"
                      onClick={() => changeStatus(survey)}
                      className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold hover:bg-white/5"
                    >
                      {survey.status === "active" ? "Cerrar" : "Abrir"}
                    </button>
                  </div>
                  {survey._count.responses === 0 && survey._count.ineSubmissions === 0 ? (
                    <button
                      type="button"
                      disabled={deletingSurveyId !== null}
                      onClick={() => void deleteSurveySafely(survey)}
                      className="mt-3 w-full rounded-xl border border-red-400/40 bg-red-400/5 px-4 py-2.5 text-xs font-bold text-red-200 hover:bg-red-400/10 disabled:opacity-40"
                    >
                      {deletingSurveyId === survey.id ? "Eliminando…" : "Eliminar esta encuesta"}
                    </button>
                  ) : null}
                  {(survey.accessMode ?? "public") !== "public" ? <div className="mt-3 rounded-xl border border-cyan-300/20 p-4 text-sm">
                    <p>Acceso {survey.accessMode === "group" ? "de grupo" : "privado"}. El enlace general no permite responder.</p>
                    <label className="mt-3 block">Importar participantes (.xlsx o .csv)
                      <input type="file" accept=".xlsx,.csv" disabled={importBusy} onChange={event => { void importParticipants(survey,event.target.files?.[0]); event.target.value = ""; }} className="mt-2 block w-full" />
                    </label>
                    <p className="my-2 text-xs text-slate-300">Columnas: Nombre, Correo, Teléfono/Celular, Grupo, Referencia. Cada fila necesita correo o teléfono. Hasta 1000 filas por archivo.</p>
                    <a href={`/api/orion/survey/${survey.id}/invitations.xlsx`} className="font-bold text-cyan-200">Descargar enlaces en Excel</a>
                  </div> : null}
                  {survey.collectIne ? (
                    <button
                      type="button"
                      onClick={() => void loadIneRecords(survey)}
                      className="mt-2 flex w-full items-center justify-between rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-left text-xs font-bold text-amber-100 hover:bg-amber-300/10"
                    >
                      <span>Documentos INE recibidos</span>
                      <span className="rounded-full bg-amber-200 px-2.5 py-1 text-slate-950">
                        {survey._count.ineSubmissions ?? 0}
                      </span>
                    </button>
                  ) : null}
                </article>
              ))}
              {visibleSurveys.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400 lg:col-span-2">
                  No hay encuestas que coincidan. Borra la búsqueda o cambia el
                  estado.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {shareSurvey ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
                  Comparte
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {shareSurvey.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShareSurvey(null);
                  setQrDataUrl("");
                }}
                className="rounded-full bg-slate-100 px-3 py-1.5 font-bold"
              >
                ×
              </button>
            </div>
            {shareUrl && !isLocalUrl(shareUrl) ? (
              qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt={`QR de ${shareSurvey.title}`}
                  width={280}
                  height={280}
                  unoptimized
                  className="mx-auto mt-5 h-auto w-full max-w-[280px]"
                />
              ) : (
                <div className="mx-auto mt-5 h-64 w-64 animate-pulse rounded-2xl bg-slate-100" />
              )
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-black">Falta la dirección pública</p>
                <p className="mt-1 text-xs font-semibold leading-5">
                  Ejecuta <strong>COMPARTIR_ENCUESTAS_HOY.bat</strong> y pega
                  abajo la dirección nueva que comienza con https:// y termina
                  en trycloudflare.com.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={publicBaseInput}
                    onChange={(event) => setPublicBaseInput(event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs outline-none focus:border-amber-600"
                    placeholder="https://ejemplo.trycloudflare.com"
                  />
                  <button
                    type="button"
                    onClick={usePublicAddress}
                    className="rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white"
                  >
                    Usar dirección
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-amber-800">
                  El QR aparecerá cuando la dirección sea válida. No se
                  compartirá localhost por error.
                </p>
              </div>
            )}
            {shareUrl && !isLocalUrl(shareUrl) ? (
              <>
                <p className="mt-3 break-all rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
                  {shareUrl}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => setMessage("Enlace copiado."))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-3 text-xs font-black"
                  >
                    Copiar
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 px-3 py-3 text-center text-xs font-black"
                  >
                    Probar
                  </a>
                  <a
                    href={qrDataUrl}
                    download={`encuesta-${shareSurvey.slug}-qr.png`}
                    className="rounded-xl bg-slate-950 px-3 py-3 text-center text-xs font-black text-white"
                  >
                    Descargar QR
                  </a>
                </div>
                <details className="mt-3 rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-xs font-bold text-slate-600">
                    Cambiar dirección pública
                  </summary>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={publicBaseInput}
                      onChange={(event) =>
                        setPublicBaseInput(event.target.value)
                      }
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={usePublicAddress}
                      className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                    >
                      Aplicar
                    </button>
                  </div>
                </details>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {ineSurvey ? (
        <div
          className="fixed inset-0 z-[85] overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto my-6 max-w-3xl overflow-hidden rounded-[2rem] border border-amber-300/20 bg-[#0c1c31] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-amber-300/10 to-cyan-300/5 p-5 sm:p-7">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">
                  Documentos protegidos
                </p>
                <h2 className="mt-1 text-2xl font-black">INE recibidas</h2>
                <p className="mt-2 text-sm text-slate-400">{ineSurvey.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIneSurvey(null);
                  setIneRecords([]);
                }}
                className="rounded-full bg-white/10 px-3 py-1.5 font-black"
              >
                ×
              </button>
            </div>

            <div className="p-5 sm:p-7">
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-xs leading-5 text-emerald-100">
                <strong>{ineSurvey.ineStorageMode === "temporary" ? "Modo temporal para transferir" : "Nube Yaleka"}</strong>. Actualmente hay {ineRecords.filter((item) => item.available).length} documento(s) disponibles y ocupan {(ineRecords.reduce((sum, item) => sum + (item.available ? item.totalBytes : 0), 0) / 1024 / 1024).toFixed(1)} MB. Yaleka no elimina automáticamente una INE sin respaldo confirmado.
              </div>

              {ineRecords.some((item) => item.available) ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <button type="button" onClick={downloadIneBackup} className="rounded-xl bg-emerald-300 px-3 py-3 text-xs font-black text-slate-950">1 · Transferir a mi computadora</button>
                    <button type="button" disabled={!ineBackupDownloaded || ineLoading} onClick={() => void confirmIneBackup()} className="rounded-xl border border-emerald-300/30 px-3 py-3 text-xs font-black text-emerald-100 disabled:opacity-40">2 · Ya guardé el respaldo</button>
                    <button type="button" disabled={!ineRecords.some((item) => item.available && item.backupConfirmedAt) || ineLoading} onClick={() => void purgeBackedUpIne()} className="rounded-xl border border-amber-300/30 px-3 py-3 text-xs font-black text-amber-100 disabled:opacity-40">3 · Liberar espacio de Yaleka</button>
                    <button type="button" onClick={downloadIneArchive} className="rounded-xl border border-cyan-300/20 px-3 py-3 text-xs font-black text-cyan-100">Sólo INE originales</button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button type="button" onClick={() => void printIne("normal")} className="rounded-xl border border-fuchsia-300/20 px-3 py-3 text-xs font-black text-fuchsia-100">Imprimir · 1 folio por hoja</button>
                    <button type="button" onClick={() => void printIne("compact")} className="rounded-xl border border-fuchsia-300/20 px-3 py-3 text-xs font-black text-fuchsia-100">Imprimir · compacto</button>
                    <span className="grid place-items-center rounded-xl bg-white/5 px-3 py-3 text-center text-[11px] font-bold text-slate-400">Frente + reverso quedan juntos en la misma hoja.</span>
                  </div>
                </>
              ) : null}

              {ineLoading && ineRecords.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Abriendo documentos…
                </div>
              ) : ineRecords.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-4xl">🪪</div>
                  <p className="mt-3 font-black">Todavía no hay INE recibidas</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Aparecerán aquí cuando las personas terminen la encuesta.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {ineRecords.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-black text-white">Folio {item.folio} · {item.personName}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Recibida: {new Date(item.completedAt).toLocaleString("es-MX")}
                            <br />
                            Se elimina: {new Date(item.expiresAt).toLocaleDateString("es-MX")}
                            {item.downloadCount > 0
                              ? ` · ${item.downloadCount} descarga${item.downloadCount === 1 ? "" : "s"}`
                              : " · Sin descargas"}
                            <br />
                            {item.backupConfirmedAt ? `Respaldo confirmado: ${new Date(item.backupConfirmedAt).toLocaleDateString("es-MX")}` : item.retentionOverdue ? "Periodo vencido · se conserva porque falta respaldo" : "Pendiente de respaldo confirmado"}
                          </p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-bold ${item.available ? "bg-emerald-300/10 text-emerald-200" : "bg-slate-500/10 text-slate-400"}`}>
                          {item.available ? "Disponible" : "Eliminada"}
                        </span>
                      </div>
                      {item.available ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => downloadIne(ineSurvey.id, item.id, "front")}
                            className="rounded-xl border border-cyan-300/20 px-3 py-3 text-xs font-black text-cyan-100"
                          >
                            Descargar frente
                          </button>
                          {item.hasBack ? (
                            <button
                              type="button"
                              onClick={() => downloadIne(ineSurvey.id, item.id, "back")}
                              className="rounded-xl border border-cyan-300/20 px-3 py-3 text-xs font-black text-cyan-100"
                            >
                              Descargar reverso
                            </button>
                          ) : (
                            <span className="grid place-items-center rounded-xl border border-white/10 px-3 py-3 text-center text-xs font-bold text-slate-500">
                              Sólo frente
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={ineLoading}
                            onClick={() => void deleteIne(item.id)}
                            className="rounded-xl border border-red-300/20 px-3 py-3 text-xs font-black text-red-200 disabled:opacity-40"
                          >
                            Eliminar documento
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {results ? (
        <div
          className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto my-6 max-w-5xl rounded-[2rem] border border-white/10 bg-[#0c1c31] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
                  Resultados
                </p>
                <h2 className="mt-1 text-2xl font-black">{resultsTitle}</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {results.responseCount === results.totalResponseCount
                    ? `${results.responseCount} respuestas completadas`
                    : `${results.responseCount} de ${results.totalResponseCount} respuestas con estos filtros`}
                </p>
                <button
                  type="button"
                  onClick={downloadResults}
                  className="mt-3 rounded-xl border border-cyan-300/30 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-300/10"
                >
                  Descargar Excel (.xlsx)
                </button>
                <button type="button" onClick={downloadFullBackup} className="ml-2 mt-3 rounded-xl border border-emerald-300/30 px-3 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-300/10">Respaldo completo (.zip)</button>
              </div>
              <button
                type="button"
                onClick={() => setResults(null)}
                className="rounded-full bg-white/10 px-3 py-1.5 font-bold"
              >
                ×
              </button>
            </div>

            <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/25 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                    Filtrar sin alterar los datos
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Compara periodos o lugares. Vacío significa mostrar todo.
                  </p>
                </div>
                {resultsLoading ? (
                  <span className="text-xs font-bold text-cyan-200">
                    Actualizando…
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  <span className="text-xs font-bold text-slate-300">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={resultsFilter.from}
                    onChange={(event) =>
                      setResultsFilter((value) => ({
                        ...value,
                        from: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2.5 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs font-bold text-slate-300">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={resultsFilter.to}
                    onChange={(event) =>
                      setResultsFilter((value) => ({
                        ...value,
                        to: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2.5 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs font-bold text-slate-300">
                    Municipio
                  </span>
                  <select
                    value={resultsFilter.municipality}
                    onChange={(event) =>
                      setResultsFilter((value) => ({
                        ...value,
                        municipality: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2.5 text-sm"
                  >
                    <option value="">Todos</option>
                    {results.availableMunicipalities.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-bold text-slate-300">
                    Colonia o localidad
                  </span>
                  <select
                    value={resultsFilter.locality}
                    onChange={(event) =>
                      setResultsFilter((value) => ({
                        ...value,
                        locality: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2.5 text-sm"
                  >
                    <option value="">Todas</option>
                    {results.availableLocalities.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label><span className="text-xs font-bold text-slate-300">Sección electoral</span><select value={resultsFilter.electoralSection} onChange={(event) => setResultsFilter((current) => ({ ...current, electoralSection: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#071425] px-3 py-2 text-sm text-white"><option value="">Todas</option>{results.availableElectoralSections.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <button
                  type="button"
                  disabled={resultsLoading}
                  onClick={applyResultsFilter}
                  className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50"
                >
                  Aplicar filtros
                </button>
                <button
                  type="button"
                  disabled={resultsLoading}
                  onClick={clearResultsFilter}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  Ver todas las respuestas
                </button>
              </div>
            </section>

            <section className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300">
                  Participantes
                </p>
                <p className="mt-2 text-3xl font-black">
                  {results.responseCount}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Encuestas enviadas correctamente
                </p>
              </div>
              <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.07] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-300">
                  Preguntas
                </p>
                <p className="mt-2 text-3xl font-black">
                  {results.questions.length}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Cada una aparece en su propia sección
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">
                  Formularios completos
                </p>
                <p className="mt-2 text-3xl font-black">
                  {results.responseCount > 0 ? "100%" : "0%"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  No se aceptan respuestas incompletas
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-400/10 via-cyan-400/5 to-transparent p-5">
              <p className="text-xs font-black uppercase tracking-[0.17em] text-fuchsia-300">
                Resumen automático
              </p>
              <h3 className="mt-2 text-lg font-black">
                Lo más importante de estos resultados
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Se calcula únicamente con las respuestas registradas. Son
                hallazgos orientativos; tú decides qué acción tomar.
              </p>
              <ul className="mt-4 space-y-2">
                {results.insights.map((insight, index) => (
                  <li
                    key={`${index}-${insight}`}
                    className="flex gap-3 rounded-2xl bg-slate-950/25 px-4 py-3 text-sm leading-6 text-slate-200"
                  >
                    <span className="font-black text-cyan-300">
                      {index + 1}
                    </span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-6 space-y-6">
              {results.questions.map((question, questionIndex) => {
                const topAnswer = question.answers
                  .filter((answer) => answer.count > 0)
                  .toSorted((a, b) => b.count - a.count)[0];
                const ratingParts = question.answers
                  .map((answer) => ({
                    value: ratingNumber(answer.option),
                    count: answer.count,
                  }))
                  .filter(
                    (answer): answer is { value: number; count: number } =>
                      answer.value !== null && answer.count > 0,
                  );
                const ratingCount = ratingParts.reduce(
                  (sum, answer) => sum + answer.count,
                  0,
                );
                const ratingAverage = ratingCount
                  ? ratingParts.reduce(
                      (sum, answer) => sum + answer.value * answer.count,
                      0,
                    ) / ratingCount
                  : null;

                return (
                  <article
                    key={question.id}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]"
                  >
                    <header className="border-b border-white/10 bg-white/[0.035] px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]">
                        <span className="text-cyan-300">
                          Pregunta {questionIndex + 1} de{" "}
                          {results.questions.length}
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-300">
                          {questionTypeLabel(question.type)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-black leading-6 sm:text-lg">
                        {question.prompt}
                      </h3>
                    </header>

                    <div className="p-5 sm:p-6">
                      {topAnswer || ratingAverage !== null ? (
                        <div className="mb-5 grid gap-3 sm:grid-cols-2">
                          {topAnswer ? (
                            <div className="rounded-2xl bg-slate-950/35 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                                Respuesta más elegida
                              </p>
                              <p className="mt-2 font-black text-white">
                                {topAnswer.option}
                              </p>
                              <p className="mt-1 text-sm text-cyan-300">
                                {resultPercentage(
                                  topAnswer.count,
                                  results.responseCount,
                                )}
                                % · {topAnswer.count} de {results.responseCount}
                              </p>
                            </div>
                          ) : null}
                          {ratingAverage !== null ? (
                            <div className="rounded-2xl bg-slate-950/35 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                                Promedio de la escala
                              </p>
                              <p className="mt-2 text-3xl font-black text-violet-300">
                                {ratingAverage.toFixed(1)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Calculado con {ratingCount} respuestas
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="space-y-4">
                        {question.answers.length
                          ? question.answers.map((answer, answerIndex) => {
                              const percentage = resultPercentage(
                                answer.count,
                                results.responseCount,
                              );
                              const color =
                                resultColors[answerIndex % resultColors.length];

                              return (
                                <div
                                  key={answer.option}
                                  className="rounded-2xl border border-white/[0.07] bg-slate-950/20 p-3.5"
                                >
                                  <div className="flex items-start justify-between gap-4 text-sm">
                                    <div className="flex min-w-0 items-start gap-2.5">
                                      <span
                                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: color }}
                                      />
                                      <span className="leading-5 text-slate-200">
                                        {answer.option}
                                      </span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <strong className="text-white">
                                        {percentage}%
                                      </strong>
                                      <p className="text-[11px] text-slate-400">
                                        {answer.count} de{" "}
                                        {results.responseCount}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full transition-[width] duration-500"
                                      style={{
                                        background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                                        width:
                                          answer.count > 0
                                            ? `${Math.max(percentage, 2)}%`
                                            : "0%",
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          : null}
                        {question.textAnswers?.length ? (
                          <div className="space-y-3">
                            <p className="text-xs font-bold text-slate-400">
                              {question.textAnswerCount} respuestas escritas
                            </p>
                            {question.textAnswers.map((answer, index) => (
                              <div
                                key={`${question.id}-${index}`}
                                className="flex gap-3 rounded-2xl border border-white/[0.07] bg-slate-950/25 px-4 py-3 text-sm text-slate-200"
                              >
                                <span className="font-black text-cyan-300">
                                  {index + 1}
                                </span>
                                <p className="leading-6">{answer}</p>
                              </div>
                            ))}
                            {question.textAnswersTruncated ? (
                              <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                Para mantener rápido el reporte se muestran las{" "}
                                {question.textAnswers.length} más recientes. El
                                total permanece guardado.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {!question.answers.length &&
                        !question.textAnswers?.length ? (
                          <p className="text-sm text-slate-500">
                            Todavía no hay respuestas para mostrar.
                          </p>
                        ) : null}
                        {question.type === "multi" &&
                        question.answers.length ? (
                          <p className="pt-1 text-xs leading-5 text-slate-500">
                            Los porcentajes pueden sumar más de 100% porque cada
                            persona podía elegir varias respuestas.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
