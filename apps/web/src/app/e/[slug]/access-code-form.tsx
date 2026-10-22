"use client";

import { type FormEvent, useState } from "react";

export function AccessCodeForm({ slug }: { slug: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/yalika/survey/public/${encodeURIComponent(slug)}/access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        invitation?: string;
        message?: unknown;
      } | null;

      if (!response.ok || !data?.invitation) {
        setError(
          typeof data?.message === "string"
            ? data.message
            : "No pudimos validar tu código. Revísalo e inténtalo de nuevo.",
        );
        return;
      }

      window.location.assign(
        `/e/${encodeURIComponent(slug)}?invitation=${encodeURIComponent(data.invitation)}`,
      );
    } catch {
      setError("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#071425] p-5 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8"
      >
        <div className="text-center text-4xl">🔑</div>
        <h1 className="mt-4 text-center text-2xl font-black">
          Escribe tu código de acceso
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-300">
          Esta encuesta es solo para personas invitadas. Usa el código que te
          dieron.
        </p>
        <label className="mt-6 block text-sm font-bold">
          Código
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            placeholder="K7M4-PQ2X"
            className="mt-2 w-full rounded-xl bg-[#0b1d33] p-4 text-center text-2xl font-black uppercase tracking-[0.25em] outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="mt-5 w-full rounded-xl bg-cyan-300 p-4 font-black text-slate-950 disabled:opacity-50"
        >
          {busy ? "Validando…" : "Entrar"}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-slate-400">
          Si no tienes código o no funciona, pídeselo a quien te invitó.
        </p>
      </form>
    </main>
  );
}
