import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  SurveyWorkspace,
  type SurveyRecord,
} from '../surveys/survey-workspace';

export const dynamic = 'force-dynamic';

type SessionResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    companyId: string;
  };
};

export default async function SurveysPage() {
  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const cookieHeader = (await cookies()).toString();
  const headers = { cookie: cookieHeader };
  let sessionResponse: Response;

  try {
    sessionResponse = await fetch(`${apiUrl}/auth/me`, {
      headers,
      cache: 'no-store',
    });
  } catch {
    redirect('/login');
  }

  if (!sessionResponse.ok) redirect('/login');

  const session = (await sessionResponse.json()) as SessionResponse;
  let surveys: SurveyRecord[] = [];

  try {
    const response = await fetch(`${apiUrl}/survey`, {
      headers,
      cache: 'no-store',
    });
    if (response.ok) surveys = (await response.json()) as SurveyRecord[];
  } catch {
    surveys = [];
  }

  return (
    <SurveyWorkspace
      currentUserName={session.user.name}
      initialSurveys={surveys}
    />
  );
}
