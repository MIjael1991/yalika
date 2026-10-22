import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type BusinessUser = {
  id: string;
  /** Nombre de la persona, para el ticket y los registros. */
  name: string;
  companyId: string;
  modules: string[];
  /** El cajero vende y cobra; no administra el negocio. */
  isCashier: boolean;
  /** Permisos extra que el administrador dio a este cajero. */
  permissions: string[];
};

function isCashierRole(value: unknown) {
  if (!value || typeof value !== 'object' || !('name' in value)) return false;
  const name = value.name;
  return (
    typeof name === 'string' &&
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase() === 'cajero'
  );
}

export async function requireBusinessSession(): Promise<BusinessUser> {
  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
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
    name: 'name' in user && typeof user.name === 'string' ? user.name : '',
    companyId: user.companyId,
    modules: user.modules,
    isCashier: 'role' in user && isCashierRole(user.role),
    permissions:
      'permissions' in user && Array.isArray(user.permissions)
        ? user.permissions.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
  };
}

/** Pantallas de administración: el cajero vuelve a la caja. */
export async function requireManagerSession(): Promise<BusinessUser> {
  const user = await requireBusinessSession();

  if (user.isCashier) {
    redirect('/pos');
  }

  return user;
}

/**
 * Pantalla que el administrador siempre ve y el cajero solo si el
 * administrador le dio alguno de estos permisos.
 */
export async function requireManagerOrPermission(
  ...permissions: string[]
): Promise<BusinessUser> {
  const user = await requireBusinessSession();

  // "returns_item:*" vale para cualquier permiso por artículo (devolver un producto).
  const has = (permission: string) =>
    permission.endsWith(':*')
      ? user.permissions.some((item) => item.startsWith(permission.slice(0, -1)))
      : user.permissions.includes(permission);

  if (user.isCashier && !permissions.some(has)) {
    redirect('/pos');
  }

  return user;
}
