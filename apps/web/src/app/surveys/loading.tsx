export default function SurveysLoading() {
  return (
    <main className="min-h-screen bg-[#071425] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-4 w-36 rounded bg-white/10" />
        <div className="mt-4 h-10 w-72 rounded bg-white/10" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-32 rounded-3xl bg-white/5" />
          ))}
        </div>
      </div>
    </main>
  );
}

