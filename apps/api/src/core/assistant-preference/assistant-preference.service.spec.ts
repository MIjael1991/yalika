jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../../prisma/prisma.service';
import { AssistantPreferenceService } from './assistant-preference.service';

describe('AssistantPreferenceService', () => {
  it('returns safe defaults before the user saves preferences', async () => {
    const service = new AssistantPreferenceService({
      assistantPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(
      service.findForUser('user-1', 'Christian Mijael'),
    ).resolves.toEqual({
      preferredName: 'Christian',
      automaticLocale: true,
      voiceLocale: 'es-MX',
      voiceName: null,
      voiceRate: 0.95,
    });
  });

  it('stores only the authenticated user preferences', async () => {
    const upsert = jest.fn().mockResolvedValue({
      preferredName: 'Mijael',
      automaticLocale: false,
      voiceLocale: 'es-MX',
      voiceName: 'Microsoft Jorge',
      voiceRate: 1,
    });
    const service = new AssistantPreferenceService({
      assistantPreference: { upsert },
    } as unknown as PrismaService);

    await service.updateForUser('user-1', 'Christian Mijael', {
      preferredName: ' Mijael ',
      automaticLocale: false,
      voiceLocale: 'es-MX',
      voiceName: 'Microsoft Jorge',
      voiceRate: 1,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          userId: 'user-1',
          preferredName: 'Mijael',
        }),
      }),
    );
  });
});
