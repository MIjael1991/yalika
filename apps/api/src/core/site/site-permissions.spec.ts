import {
  canSiteRole,
  isAssignableSiteRole,
  SITE_COLLABORATOR_LIMIT,
} from './site-permissions';

describe('Yaleka site permissions', () => {
  it('keeps the current collaborator limit at one without hard-coding it in the database', () => {
    expect(SITE_COLLABORATOR_LIMIT).toBe(1);
  });

  it('gives owner and admin team/publish rights', () => {
    expect(canSiteRole('owner', 'manage_team')).toBe(true);
    expect(canSiteRole('admin', 'publish')).toBe(true);
  });

  it('keeps editor, publisher and viewer separated', () => {
    expect(canSiteRole('editor', 'edit')).toBe(true);
    expect(canSiteRole('editor', 'publish')).toBe(false);
    expect(canSiteRole('publisher', 'publish')).toBe(true);
    expect(canSiteRole('publisher', 'edit')).toBe(false);
    expect(canSiteRole('viewer', 'view')).toBe(true);
    expect(canSiteRole('viewer', 'edit')).toBe(false);
  });

  it('only accepts assignable collaborator roles', () => {
    expect(isAssignableSiteRole('admin')).toBe(true);
    expect(isAssignableSiteRole('editor')).toBe(true);
    expect(isAssignableSiteRole('publisher')).toBe(true);
    expect(isAssignableSiteRole('viewer')).toBe(true);
    expect(isAssignableSiteRole('owner')).toBe(false);
  });
});
