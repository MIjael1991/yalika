import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './password';

describe('Yalika authentication secrets', () => {
  it('hashes a password with a unique salt and verifies it', async () => {
    const firstHash = await hashPassword('YalikaSeguro2026');
    const secondHash = await hashPassword('YalikaSeguro2026');

    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword('YalikaSeguro2026', firstHash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('otra-clave', firstHash)).resolves.toBe(false);
  });

  it('creates opaque session tokens and stores only their digest', () => {
    const token = createSessionToken();
    const digest = hashSessionToken(token);

    expect(token).not.toContain(digest);
    expect(digest).toHaveLength(64);
  });
});
