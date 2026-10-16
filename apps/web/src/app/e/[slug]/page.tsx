import type { PersonalField } from '../../../lib/survey-fields';
import { SurveyResponseWorkspace } from './survey-response-workspace';

export const metadata = { referrer: 'no-referrer' as const };

export const dynamic = 'force-dynamic';

export type PublicSurvey = {
  personalFields?: PersonalField[] | null;
  accessMode?: string;
  id: string;
  title: string;
  slug: string;
  description: string | null;
  identityMode: string;
  collectMunicipality: boolean;
  collectLocality: boolean;
  ineStorageMode: "temporary" | "yaleka_cloud";
  collectElectoralSection: boolean;
  ineCaptureMode: "front" | "front_back";
  ineAutoExtract: boolean;
  collectPostalCode: boolean;
  collectAddress: boolean;
  collectCurp: boolean;
  collectVoterKey: boolean;
  collectIne: boolean;
  ineRequired: boolean;
  ineRetentionDays: number;
  showPublicResults: boolean;
  privacyNotice: string;
  thankYouMessage: string | null;
  company: {
    name: string;
  };
  questions: Array<{
    id: string;
    prompt: string;
    type: string;
    options: string[];
    required: boolean;
    sortOrder: number;
  }>;
  responseCount: number;
};

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invitation?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const invitation = typeof query.invitation === 'string' && query.invitation.length <= 128 ? query.invitation : ''; 
  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  let survey: PublicSurvey | null = null;

  try {
    const response = await fetch(
      `${apiUrl}/survey/public/${encodeURIComponent(slug)}?invitation=${encodeURIComponent(invitation)}`,
      {
        cache: 'no-store',
      },
    );

    if (response.ok) {
      survey = (await response.json()) as PublicSurvey;
    }
  } catch {
    survey = null;
  }

  if (!survey) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#071425] p-5 text-white">
        <section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black">Encuesta no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Puede estar cerrada o el enlace no es correcto. Solicita un enlace nuevo a quien te invitó.
          </p>
        </section>
      </main>
    );
  }

  return <SurveyResponseWorkspace survey={survey} invitationToken={invitation} />;
}

