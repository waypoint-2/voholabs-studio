// The service's own module graph pulls every social provider in; none of
// that is needed to test the read charge.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository',
  () => ({ IntegrationRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import {
  analyticsReadPrefix,
  IntegrationService,
  READS_PER_ANALYTICS_POST,
} from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

// Channel analytics reads: one charge per post per UTC day per workspace,
// whichever window or refresh reads it first.
describe('IntegrationService.chargeApiReads', () => {
  const make = (unlocked = true) => {
    const walletService = {
      unlocksProvider: jest.fn(async () => unlocked),
    };
    const walletBilling = {
      chargeItems: jest.fn(async (params: any) => ({ params })),
    };
    const service = Object.create(IntegrationService.prototype);
    service._walletService = walletService;
    service._walletBilling = walletBilling;
    return { service: service as IntegrationService, walletBilling };
  };

  it('keys the charge by provider, workspace and UTC day only (not the window)', () => {
    expect(analyticsReadPrefix('x', 'org-1', '2026-10-04')).toBe(
      'xread:org-1:2026-10-04:'
    );
    expect(analyticsReadPrefix('X-Custom', 'org-1', '2026-10-04')).toBe(
      'xread:org-1:2026-10-04:'
    );
  });

  it("charges two reads per post read, under today's prefix", async () => {
    const { service, walletBilling } = make();
    await service.chargeApiReads({
      orgId: 'org-1',
      identifier: 'x',
      postIds: ['a', 'b'],
      reference: 'channel-1',
    });
    expect(READS_PER_ANALYTICS_POST).toBe(2);
    expect(walletBilling.chargeItems).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actionKey: 'x.post_read',
      chargePrefix: analyticsReadPrefix('x', 'org-1'),
      items: ['a', 'b'],
      unitsPerItem: 2,
      reference: 'channel-1',
      allowNegative: true,
    });
  });

  it('does not charge when nothing was read or the provider is not unlocked', async () => {
    const empty = make();
    expect(
      await empty.service.chargeApiReads({
        orgId: 'org-1',
        identifier: 'x',
        postIds: [],
      })
    ).toBeNull();
    expect(empty.walletBilling.chargeItems).not.toHaveBeenCalled();

    const locked = make(false);
    expect(
      await locked.service.chargeApiReads({
        orgId: 'org-1',
        identifier: 'x',
        postIds: ['a'],
      })
    ).toBeNull();
    expect(locked.walletBilling.chargeItems).not.toHaveBeenCalled();
  });
});
