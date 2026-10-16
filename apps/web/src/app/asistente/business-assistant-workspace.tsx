"use client";

import Link from "next/link";
import { BusinessResult } from "./business-result";
import { useEffect, useMemo, useState } from "react";

type AssistantResult = {
  mode: "answer" | "proposal" | "clarify";
  intent: string;
  risk: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  message: string;
  items?: Array<Record<string, unknown>>;
  data?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  missing?: string[];
  memoryDraft?: { scope: string; key: string; value: Record<string, unknown> };
};

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AssistantResult;
  local?: boolean;
};

const quick = [
  "¿Qué productos están bajos?",
  "¿Cuánto vendí hoy?",
  "Llegaron 5 cajas de 24 piezas y costaron 180",
  "Quiero una página elegante con video TikTok arriba",
  "Mi margen habitual es 20%",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function localInterpret(text: string): AssistantResult {
  const lower = normalize(text);
  const receive = lower.match(
    /(?:llegaron|recibi|entrada)\s+(\d+)\s+cajas?.*?(\d+)\s+(?:piezas?|unidades?)/,
  );
  if (receive) {
    const boxes = Number(receive[1]);
    const units = Number(receive[2]);
    return {
      mode: "proposal",
      intent: "inventory_receive_local",
      risk: "high",
      requiresConfirmation: true,
      message: `Modo local: entendí ${boxes} cajas × ${units} = ${boxes * units} unidades. No modificaré inventario sin conexión; esta propuesta todavía no está guardada ni se enviará automáticamente.`,
      draft: { boxes, unitsPerBox: units, totalUnits: boxes * units },
    };
  }
  const margin = lower.match(/(?:margen|ganancia).*?(\d{1,3}(?:\.\d+)?)\s*%/);
  if (margin) {
    return {
      mode: "proposal",
      intent: "remember_margin_local",
      risk: "medium",
      requiresConfirmation: true,
      message: `Modo local: entendí margen habitual ${margin[1]}%. Puedes guardarlo en este dispositivo.`,
      memoryDraft: {
        scope: "commerce",
        key: "default_margin_percent",
        value: { percent: Number(margin[1]) },
      },
    };
  }
  if (/(pagina|sitio|banner|tiktok|video)/.test(lower)) {
    return {
      mode: "proposal",
      intent: "site_design_local",
      risk: "medium",
      requiresConfirmation: true,
      message:
        "Modo local: preparé la intención de diseño. La publicación necesita conexión y confirmación.",
      draft: { request: text },
    };
  }
  return {
    mode: "clarify",
    intent: "offline_unknown",
    risk: "low",
    requiresConfirmation: false,
    message:
      "Estoy sin conexión. Puedo preparar borradores sencillos de inventario, preferencias y diseño; para consultar ventas o datos recientes necesito sincronizar.",
  };
}

class ApiFailure extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiFailure(
      (payload as { message?: string }).message ??
        "No fue posible consultar Yalika",
    );
  return payload as T;
}

export function BusinessAssistantWorkspace({
  userName,
  companyId,
  userId,
  embedded = false,
}: {
  userName: string;
  companyId: string;
  userId: string;
  embedded?: boolean;
}) {
  const memoryKey = `yaleka.business-memory.v2:${encodeURIComponent(companyId)}:${encodeURIComponent(userId)}`;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [deviceMemory, setDeviceMemory] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    try {
      setDeviceMemory(JSON.parse(localStorage.getItem(memoryKey) ?? "{}"));
    } catch {
      setDeviceMemory({});
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [memoryKey]);

  const lastProposal = useMemo(
    () =>
      [...chat].reverse().find((item) => item.result?.requiresConfirmation)
        ?.result,
    [chat],
  );

  async function send(value = text) {
    const input = value.trim();
    if (!input || busy) return;
    setText("");
    const userItem: ChatItem = {
      id: crypto.randomUUID(),
      role: "user",
      text: input,
    };
    setChat((current) => [...current, userItem]);
    setBusy(true);
    try {
      let result: AssistantResult;
      let local = false;
      if (navigator.onLine) {
        try {
          result = await api<AssistantResult>("business-assistant/interpret", {
            method: "POST",
            body: JSON.stringify({ text: input, context: { companyId } }),
          });
        } catch (error) {
          if (error instanceof ApiFailure) {
            result = {
              mode: "clarify",
              intent: "request_failed",
              risk: "low",
              requiresConfirmation: false,
              message: error.message,
            };
          } else {
            result = localInterpret(input);
            local = true;
          }
        }
      } else {
        result = localInterpret(input);
        local = true;
      }
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.message,
          result,
          local,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function remember(result: AssistantResult) {
    if (!result.memoryDraft) return;
    const key = `${result.memoryDraft.scope}:${result.memoryDraft.key}`;
    const next = { ...deviceMemory, [key]: result.memoryDraft.value };
    try {
      localStorage.setItem(memoryKey, JSON.stringify(next));
      setDeviceMemory(next);
    } catch {
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "No se pudo guardar en este dispositivo. No se ha sincronizado.",
        },
      ]);
      return;
    }
    let synced = false;
    if (navigator.onLine) {
      try {
        await api("business-assistant/memory", {
          method: "POST",
          body: JSON.stringify(result.memoryDraft),
        });
        synced = true;
      } catch {
        /* No automatic replay of a failed authorized action. */
      }
    }
    setChat((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: synced
          ? "Preferencia guardada en este dispositivo y en tu cuenta. No cambia precios automáticamente."
          : "Preferencia guardada sólo en este dispositivo. No está sincronizada; no cambia precios.",
      },
    ]);
  }

  return (
    <div className=" bg-[radial-gradient(circle_at_top_left,#12304b_0,#07101f_44%,#030712_100%)] text-white">
      <div className="mx-auto max-w-7xl p-4 md:p-7">
        <header
          hidden={embedded}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[.28em] text-cyan-300">
              YALIKA · ASISTENTE LOCAL-FIRST
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              Hola, {userName}. ¿Qué quieres resolver?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Pregunta, analiza o prepara acciones. Dinero, inventario, precios
              y publicación siempre requieren validación antes de ejecutar.
            </p>
          </div>
          <div
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${online ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}
          >
            {online ? "● Conectado" : "● Modo local"}
          </div>
        </header>

        <div
          className={
            embedded
              ? "grid gap-5"
              : "mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
          }
        >
          <section className="flex min-h-[350px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-cyan-950/20 backdrop-blur">
            <div className="flex-1 space-y-4 overflow-auto p-4 sm:p-6">
              {chat.length === 0 ? (
                <div className="grid h-full place-items-center py-14 text-center">
                  <div>
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-cyan-300 text-3xl text-slate-950">
                      ✦
                    </div>
                    <h2 className="mt-5 text-2xl font-bold">
                      No necesitas aprender menús
                    </h2>
                    <p className="mt-2 text-slate-400">
                      Dime qué quieres hacer y te muestro primero lo que
                      entendí.
                    </p>
                  </div>
                </div>
              ) : null}
              {chat.map((item) => (
                <div
                  key={item.id}
                  className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`w-full min-w-0 sm:max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/5 text-slate-100"}`}
                  >
                    <p>{item.text}</p>
                    {item.local ? (
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        Procesado localmente
                      </p>
                    ) : null}
                    {item.result?.items?.length ? (
                      <BusinessResult
                        intent={item.result.intent}
                        items={item.result.items}
                      />
                    ) : null}
                    {item.result?.memoryDraft ? (
                      <button
                        onClick={() => void remember(item.result!)}
                        className="mt-3 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950"
                      >
                        Confirmar y recordar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 p-4 sm:p-5">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {quick.slice(0, 3).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void send(item)}
                    className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex gap-2"
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="Ej. Llegaron 5 cajas de 24 piezas y me costaron 180…"
                  className="min-h-14 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-300"
                />
                <button
                  disabled={busy || !text.trim()}
                  className="rounded-2xl bg-cyan-300 px-5 font-black text-slate-950 disabled:opacity-40"
                >
                  {busy ? "…" : "Enviar"}
                </button>
              </form>
            </div>
          </section>

          <aside hidden={embedded} className="space-y-4">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-bold">Acciones rápidas</h2>
              <div className="mt-4 grid gap-2 text-sm">
                <Link
                  href="/pos"
                  className="rounded-xl bg-white/5 p-3 hover:bg-white/10"
                >
                  🧾 Vender
                </Link>
                <Link
                  href="/pos/productos"
                  className="rounded-xl bg-white/5 p-3 hover:bg-white/10"
                >
                  📦 Registrar mercancía
                </Link>
                <Link
                  href="/sites"
                  className="rounded-xl bg-white/5 p-3 hover:bg-white/10"
                >
                  ✨ Editar página
                </Link>
                <Link
                  href="/sites/demo"
                  className="rounded-xl bg-white/5 p-3 hover:bg-white/10"
                >
                  🎬 Ver demos profesionales
                </Link>
              </div>
            </section>
            <section className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5">
              <h2 className="font-bold text-amber-200">Regla de seguridad</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Buscar y analizar puede hacerse directamente. Cambiar precios,
                inventario, promociones o publicar debe mostrar propuesta y
                pedir aprobación.
              </p>
            </section>
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-bold">Memoria en este dispositivo</h2>
              <p className="mt-2 text-xs text-slate-400">
                {Object.keys(deviceMemory).length} preferencias locales. Sirven
                sin Internet; no son un entrenamiento automático del modelo.
              </p>
              {lastProposal?.risk === "high" ? (
                <p className="mt-3 rounded-xl bg-red-400/10 p-3 text-xs text-red-200">
                  La última petición puede afectar inventario o dinero: no se
                  ejecutó automáticamente.
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
