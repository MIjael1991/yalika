import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ServicesWorkspace } from './services-workspace';

export const dynamic = 'force-dynamic';

type Session = {
  user?: {
    id?: string;
    name?: string;
    modules?: string[];
  };
};

export default async function ServicesPage() {
  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  const cookieHeader = (await cookies()).toString();

  let session: Session;

  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      redirect('/login');
    }

    session = (await response.json()) as Session;
  } catch {
    redirect('/login');
  }

  const user = session.user;

  if (!user?.id || !Array.isArray(user.modules)) {
    redirect('/login');
  }

  // Se conserva el acceso existente de R1.
  if (!user.modules.includes('all')) {
    redirect(
      user.modules.includes('surveys')
        ? '/encuestas'
        : '/login'
    );
  }

  return (
    <ServicesWorkspace
      user={{
        id: user.id,
        name: user.name ?? '',
        modules: user.modules,
      }}
    />
  );
}