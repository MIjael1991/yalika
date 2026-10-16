import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LifeWorkspace } from './life-workspace';

export const dynamic = 'force-dynamic';

type SessionResponse = {
  user: {
    modules: string[];
    id: string;
    name: string;
    email: string;
    companyId: string;
    role: {
      id: string;
      name: string;
    } | null;
  };
};

async function getCurrentUser() {
  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const cookieHeader = (await cookies()).toString();
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });
  } catch {
    redirect('/login');
  }

  if (!response.ok) {
    redirect('/login');
  }

  const user = ((await response.json()) as SessionResponse).user;
  if (!user?.id || !user.companyId) redirect('/login');
  if (!user.modules?.includes('all')) redirect('/encuestas');
  return user;
}

export default async function LifePage() {
  const currentUser = await getCurrentUser();

  return <LifeWorkspace currentUser={currentUser} />;
}
