export default function PublicSurveyLoading() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_right,#153d59_0,#071425_42%,#050b14_100%)] px-5 py-10 text-white"
      aria-busy="true"
      aria-live="polite"
    >
      <section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl">
        <div
          className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-cyan-300"
          aria-hidden="true"
        />
        <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
          Yaleka
        </p>
        <h1 className="mt-2 text-2xl font-black">Cargando encuesta…</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Estamos preparando las preguntas y la información de privacidad.
        </p>
        <span className="sr-only">Espera mientras se carga la encuesta.</span>
      </section>
    </main>
  );
}
