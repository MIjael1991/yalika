import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type BusinessUser = {
  id: string;
  companyId: string;
  modules: string[];
};

export async function requireBusinessSession(): Promise<BusinessUser> {
  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  let payload: unknown = null;

  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: {
        cookie: (await cookies()).toString(),
      },
      cache: 'no-store',
    });

    if (response.ok) {
      payload = (await response.json()) as unknown;
    }
  } catch {
    // Si no se puede comprobar la sesion, no continuar.
  }

  const user =
    payload && typeof payload === 'object' && 'user' in payload
      ? payload.user
      : null;

  if (!user || typeof user !== 'object') {
    redirect('/login');
  }

  if (!('modules' in user) || !Array.isArray(user.modules)) {
    redirect('/login');
  }

  if (!user.modules.includes('all')) {
    redirect('/encuestas');
  }

  if (
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !user.id.trim() ||
    !('companyId' in user) ||
    typeof user.companyId !== 'string' ||
    !user.companyId.trim()
  ) {
    redirect('/login');
  }

  return {
    id: user.id,
    companyId: user.companyId,
    modules: user.modules,
  };
}