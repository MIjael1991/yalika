'use client';

import {
  useState,
  type FormEvent,
} from 'react';

type ClubSite = {
  name: string;
  slug: string;
  template: string;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
};

type ClubProgram = {
  id: string;
  name: string;
  description: string | null;
  requiredVisits: number;
  rewardDescription: string;
  rewardValidDays: number;
  endsAt: string;
};

type ClubPromotion = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  discountValue: number | null;
  specialPrice: number | null;
  imageUrl: string | null;
  endsAt: string;
};

export type ClubConfiguration = {
  site: ClubSite;
  program: ClubProgram | null;
  promotions: ClubPromotion[];
};

type Membership = {
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  memberToken: string;
  progress: {
    confirmedVisits: number;
    requiredVisits: number;
    remainingVisits: number;
    percentage: number;
    completed: boolean;
  };
  reward: {
    id: string;
    rewardDescription: string;
    status: string;
    expiresAt: string;
  } | null;
  scratch: {
    id: string;
    name: string;
    description: string | null;
    availableAttempts: number;
    possiblePrizes: Array<{
      id: string;
      name: string;
    }>;
    latestAttempt: {
      status: string;
      claimCode: string | null;
      expiresAt: string | null;
      prize: {
        name: string;
      } | null;
    } | null;
  } | null;
  alreadyRegistered?: boolean;
  rewardCreated?: boolean;
};

type ScratchResult = {
  result: 'won' | 'not_won';
  prize: {
    name: string;
    description: string | null;
  } | null;
  claimCode: string | null;
  expiresAt: string | null;
  scratch: Membership['scratch'];
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No pudimos registrar la visita';
}

function promotionLabel(
  promotion: ClubPromotion,
) {
  if (
    promotion.type === 'percentage' &&
    promotion.discountValue
  ) {
    return `${promotion.discountValue}% de descuento`;
  }

  if (
    promotion.type === 'fixed' &&
    promotion.discountValue
  ) {
    return `$${promotion.discountValue.toFixed(2)} de descuento`;
  }

  if (
    promotion.type === 'special_price' &&
    promotion.specialPrice !== null
  ) {
    return `Precio especial $${promotion.specialPrice.toFixed(2)}`;
  }

  return 'Promoción especial';
}

export function RewardsClub({
  slug,
  initialClub,
  ticketOrderId,
  ticketToken,
}: {
  slug: string;
  initialClub: ClubConfiguration | null;
  ticketOrderId: string;
  ticketToken: string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [membership, setMembership] =
    useState<Membership | null>(null);
  const [loading, setLoading] =
    useState(false);
  const [message, setMessage] =
    useState('');
  const [error, setError] = useState('');
  const [loadingScratch, setLoadingScratch] =
    useState(false);
  const [scratchResult, setScratchResult] =
    useState<ScratchResult | null>(null);

  const hasTicket = Boolean(
    ticketOrderId && ticketToken,
  );

  async function openBenefits(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `/api/orion/engagement/public/${encodeURIComponent(slug)}/${
          hasTicket ? 'claim-ticket' : 'join'
        }`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            ...(hasTicket
              ? {
                  orderId: ticketOrderId,
                  token: ticketToken,
                }
              : {}),
          }),
        },
      );
      const data = (await response.json().catch(
        () => null,
      )) as
        | Membership
        | {
            message?: string | string[];
          }
        | null;

      if (!response.ok || !data) {
        const responseMessage =
          data && 'message' in data
            ? data.message
            : null;
        throw new Error(
          Array.isArray(responseMessage)
            ? responseMessage.join('. ')
            : responseMessage ??
                'No pudimos registrar la visita',
        );
      }

      const nextMembership = data as Membership;
      setMembership(nextMembership);
      setMessage(
        !hasTicket
          ? 'Estos son tus beneficios. Para sumar una visita utiliza el QR de un ticket pagado.'
          : nextMembership.alreadyRegistered
            ? 'Este ticket ya estaba registrado. Tu avance se conserva sin duplicarse.'
          : nextMembership.rewardCreated
            ? '¡Felicidades! Acabas de desbloquear tu premio.'
            : 'Compra registrada correctamente.',
      );
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function playScratch() {
    if (!membership?.scratch) {
      return;
    }

    setLoadingScratch(true);
    setError('');

    try {
      const response = await fetch(
        `/api/orion/scratch/public/${encodeURIComponent(slug)}/play`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerId: membership.customer.id,
            memberToken: membership.memberToken,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | ScratchResult
        | { message?: string | string[] }
        | null;

      if (!response.ok || !data || !('result' in data)) {
        const responseMessage =
          data && 'message' in data ? data.message : null;
        throw new Error(
          Array.isArray(responseMessage)
            ? responseMessage.join('. ')
            : responseMessage ?? 'No pudimos abrir el raspadito',
        );
      }

      setScratchResult(data);
      setMembership({
        ...membership,
        scratch: data.scratch,
      });
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoadingScratch(false);
    }
  }

  if (!initialClub) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-5xl">✦</p>
          <h1 className="mt-5 text-2xl font-semibold">
            Página no disponible
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            El negocio todavía no ha publicado este Club QR.
          </p>
        </div>
      </main>
    );
  }

  const { site, program, promotions } =
    initialClub;
  const accent =
    site.accentColor ?? '#f5b8cf';
  const background =
    site.primaryColor ?? '#160f14';

  return (
    <main
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        backgroundColor: background,
      }}
    >
      {site.heroImageUrl ? (
        <img
          src={site.heroImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
      ) : null}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {site.logoUrl ? (
              <img
                src={site.logoUrl}
                alt={site.name}
                className="h-12 w-12 rounded-2xl bg-white object-contain p-1"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black text-slate-950"
                style={{
                  backgroundColor: accent,
                }}
              >
                {site.name.slice(0, 1)}
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
                Club QR
              </p>
              <p className="font-semibold">
                {site.name}
              </p>
            </div>
          </div>
          <a
            href={`/s/${site.slug}`}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold backdrop-blur hover:bg-white/10"
          >
            Ver tienda
          </a>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-[2.2rem] border border-white/10 bg-black/25 p-6 shadow-2xl backdrop-blur-xl sm:p-9">
            <span
              className="inline-flex rounded-full px-4 py-2 text-xs font-bold text-slate-950"
              style={{
                backgroundColor: accent,
              }}
            >
              Tu visita sí cuenta
            </span>
            <h1 className="mt-6 max-w-xl text-4xl font-bold leading-tight sm:text-6xl">
              {program?.name ??
                'Recompensas para ti'}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/65">
              {program?.description ??
                'Muy pronto podrás acumular visitas y recibir beneficios especiales.'}
            </p>

            {program ? (
              membership ? (
                <div className="mt-8 rounded-[2rem] bg-white p-6 text-slate-950 sm:p-8">
                  <p className="text-sm text-slate-500">
                    Hola, {membership.customer.name}
                  </p>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <h2 className="text-3xl font-bold">
                      Visita {membership.progress.confirmedVisits} de {membership.progress.requiredVisits}
                    </h2>
                    <span className="text-sm font-bold text-fuchsia-700">
                      {membership.progress.percentage}%
                    </span>
                  </div>
                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${membership.progress.percentage}%`,
                        backgroundColor: accent,
                      }}
                    />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {Array.from({
                      length:
                        membership.progress.requiredVisits,
                    }).map((_, index) => {
                      const completed =
                        index <
                        membership.progress.confirmedVisits;

                      return (
                        <span
                          key={index}
                          className="flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold"
                          style={{
                            borderColor: completed
                              ? accent
                              : '#cbd5e1',
                            backgroundColor: completed
                              ? accent
                              : '#f8fafc',
                          }}
                        >
                          {completed ? '✓' : index + 1}
                        </span>
                      );
                    })}
                  </div>

                  {membership.progress.completed ? (
                    <div className="mt-7 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                        Premio desbloqueado
                      </p>
                      <p className="mt-2 text-xl font-bold">
                        {membership.reward?.rewardDescription ??
                          program.rewardDescription}
                      </p>
                      <p className="mt-2 text-xs text-emerald-700">
                        Muéstralo al personal para validarlo.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-7 text-lg font-semibold">
                      Te {membership.progress.remainingVisits === 1 ? 'falta' : 'faltan'}{' '}
                      {membership.progress.remainingVisits}{' '}
                      {membership.progress.remainingVisits === 1 ? 'visita' : 'visitas'} para ganar:{' '}
                      <span className="text-fuchsia-700">
                        {program.rewardDescription}
                      </span>
                    </p>
                  )}

                  {message ? (
                    <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                      {message}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setMembership(null);
                      setMessage('');
                      setScratchResult(null);
                    }}
                    className="mt-5 text-sm font-semibold text-slate-500 underline"
                  >
                    Consultar otro teléfono
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={openBenefits}
                  className="mt-8 rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur sm:p-7"
                >
                  <h2 className="text-xl font-semibold">
                    {hasTicket
                      ? 'Registra tu ticket'
                      : 'Consulta tus beneficios'}
                  </h2>
                  <p className="mt-2 text-sm text-white/55">
                    {hasTicket
                      ? 'Este código corresponde a una compra pagada y solamente puede sumar una visita.'
                      : 'Identifícate con tu teléfono. Para sumar una visita necesitarás el QR de tu ticket pagado.'}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-white/70">
                      Tu nombre
                      <input
                        required
                        value={name}
                        onChange={(event) =>
                          setName(event.target.value)
                        }
                        autoComplete="name"
                        className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-white/40"
                        placeholder="¿Cómo te llamas?"
                      />
                    </label>
                    <label className="text-xs font-semibold text-white/70">
                      Tu teléfono
                      <input
                        required
                        value={phone}
                        onChange={(event) =>
                          setPhone(event.target.value)
                        }
                        autoComplete="tel"
                        inputMode="tel"
                        className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-white/40"
                        placeholder="10 dígitos"
                      />
                    </label>
                  </div>
                  {error ? (
                    <p className="mt-4 text-sm text-red-200">
                      {error}
                    </p>
                  ) : null}
                  <button
                    disabled={loading}
                    className="mt-5 h-13 w-full rounded-2xl text-base font-bold text-slate-950 shadow-lg disabled:opacity-60"
                    style={{
                      backgroundColor: accent,
                    }}
                  >
                    {loading
                      ? 'Consultando…'
                      : hasTicket
                        ? 'Registrar ticket y ver beneficios'
                        : 'Ver mis beneficios'}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-white/35">
                    Tu número se usa únicamente para identificar tu avance en este negocio.
                  </p>
                </form>
              )
            ) : (
              <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                Este negocio todavía no ha activado su programa de visitas.
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-xl sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-700">
                Tu recompensa
              </p>
              <p className="mt-4 text-3xl font-bold leading-tight">
                {program?.rewardDescription ??
                  'Beneficios especiales próximamente'}
              </p>
              {program ? (
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Se desbloquea al completar {program.requiredVisits} visitas y tendrás {program.rewardValidDays} días para usarla.
                </p>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  Descuentos de hoy
                </h2>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Exclusivos
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {promotions.length > 0 ? (
                  promotions.map((promotion) => (
                    <article
                      key={promotion.id}
                      className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      {promotion.imageUrl ? (
                        <img
                          src={promotion.imageUrl}
                          alt=""
                          className="h-20 w-20 rounded-xl object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-slate-950"
                          style={{
                            backgroundColor: accent,
                          }}
                        >
                          %
                        </div>
                      )}
                      <div className="min-w-0 py-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-white/45">
                          {promotionLabel(promotion)}
                        </p>
                        <p className="mt-1 font-semibold">
                          {promotion.title}
                        </p>
                        {promotion.description ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                            {promotion.description}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/40">
                    No hay promociones publicadas hoy.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-amber-200/30 bg-gradient-to-br from-amber-200/15 to-orange-400/10 p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
                Premio sorpresa
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {membership?.scratch?.name ?? 'Raspadito sorpresa'}
              </h2>
              {!membership ? (
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Identifícate para consultar si una compra pagada te dio un
                  intento.
                </p>
              ) : !membership.scratch ? (
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Este negocio todavía no tiene un raspadito activo.
                </p>
              ) : scratchResult ? (
                <div className="mt-5 rounded-2xl bg-white p-5 text-center text-slate-950 shadow-xl">
                  <p className="text-4xl">
                    {scratchResult.result === 'won' ? '🎉' : '✨'}
                  </p>
                  <p className="mt-3 text-xl font-black">
                    {scratchResult.result === 'won'
                      ? `¡Ganaste ${scratchResult.prize?.name}!`
                      : 'Esta vez no hubo premio'}
                  </p>
                  {scratchResult.prize?.description ? (
                    <p className="mt-2 text-sm text-slate-600">
                      {scratchResult.prize.description}
                    </p>
                  ) : null}
                  {scratchResult.claimCode ? (
                    <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        Código para canjear
                      </p>
                      <p className="mt-1 font-mono text-lg font-black tracking-wider">
                        {scratchResult.claimCode}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      Tu próxima compra pagada te dará otro intento.
                    </p>
                  )}
                </div>
              ) : membership.scratch.availableAttempts > 0 ? (
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={loadingScratch}
                    onClick={() => void playScratch()}
                    className="relative h-32 w-full overflow-hidden rounded-2xl border border-amber-100/40 bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 px-5 text-slate-950 shadow-xl transition hover:scale-[1.01] disabled:opacity-70"
                  >
                    <span className="block text-3xl">✦ ✦ ✦</span>
                    <span className="mt-2 block text-lg font-black">
                      {loadingScratch ? 'Abriendo…' : 'Toca para raspar'}
                    </span>
                    <span className="mt-1 block text-xs font-semibold">
                      {membership.scratch.availableAttempts}{' '}
                      {membership.scratch.availableAttempts === 1
                        ? 'intento disponible'
                        : 'intentos disponibles'}
                    </span>
                  </button>
                  <p className="mt-3 text-xs leading-5 text-white/50">
                    Cada intento proviene de una compra pagada y se utiliza una
                    sola vez.
                  </p>
                </div>
              ) : membership.scratch.latestAttempt?.status === 'won' ? (
                <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <p className="font-bold text-emerald-100">
                    Premio pendiente: {membership.scratch.latestAttempt.prize?.name}
                  </p>
                  <p className="mt-2 font-mono text-sm font-bold text-white">
                    {membership.scratch.latestAttempt.claimCode}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-white/55">
                  No tienes intentos disponibles. Cada compra pagada suma uno.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
