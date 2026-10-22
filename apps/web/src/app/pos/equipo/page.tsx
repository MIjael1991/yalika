import { cookies } from 'next/headers';
import { requireManagerSession } from '../../../lib/yalika-business-session';
import { TeamWorkspace, type TeamMember } from './team-workspace';

export const dynamic = 'force-dynamic';

async function getTeam(cookieHeader: string) {
  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(`${apiUrl}/team`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { members: [] as TeamMember[], error: 'No se pudo cargar el equipo' };
    }

    return { members: (await response.json()) as TeamMember[], error: '' };
  } catch {
    return { members: [] as TeamMember[], error: 'Yalika API no está disponible' };
  }
}

export default async function TeamPage() {
  const user = await requireManagerSession();
  const team = await getTeam((await cookies()).toString());

  return (
    <TeamWorkspace
      currentUserId={user.id}
      companyId={user.companyId}
      initialMembers={team.members}
      initialError={team.error}
    />
  );
}
