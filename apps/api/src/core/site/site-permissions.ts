export type SitePermission =
  | 'view'
  | 'edit'
  | 'publish'
  | 'manage_team';

export const SITE_COLLABORATOR_LIMIT = 1;

export const ASSIGNABLE_SITE_ROLES = [
  'admin',
  'editor',
  'publisher',
  'viewer',
] as const;

export type AssignableSiteRole = (typeof ASSIGNABLE_SITE_ROLES)[number];

const ROLE_PERMISSIONS: Record<string, ReadonlySet<SitePermission>> = {
  owner: new Set(['view', 'edit', 'publish', 'manage_team']),
  admin: new Set(['view', 'edit', 'publish', 'manage_team']),
  editor: new Set(['view', 'edit']),
  publisher: new Set(['view', 'publish']),
  viewer: new Set(['view']),
};

export function canSiteRole(role: string, permission: SitePermission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isAssignableSiteRole(value: string): value is AssignableSiteRole {
  return (ASSIGNABLE_SITE_ROLES as readonly string[]).includes(value);
}
