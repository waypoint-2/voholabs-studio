// The service's own module graph pulls every social provider in; none of
// that is needed to test the analytics pre-check.
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
  ioRedis: { get: jest.fn(), set: jest.fn() },
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert',
  () => ({ walletAlert: jest.fn(async () => undefined) })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import { HttpException } from '@nestjs/common';
import {
  analyticsNeedsCreditsMessage,
  IntegrationService,
} from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WalletBillingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const redis = ioRedis as unknown as { get: jest.Mock; set: jest.Mock };
const org = { id: 'org-1' } as any;
const rows = [
  { label: 'Impressions', data: [{ total: 5, date: '2026-10-01' }] },
];

// An X channel on a workspace without a paid plan whose wallet pays for its
// reads. `balance` is the wallet balance in hundredths of a credit; `room`
// is what auto top-up may still add this month (topUps: 0 means it is off or
// the monthly limit is reached).
const make = (
  options: {
    balance?: number;
    paidPlan?: boolean;
    unlocked?: boolean;
    room?: { perTopUp: number; topUps: number; amount: number };
    topUpAdds?: number;
  } = {}
) => {
  let balance = options.balance ?? 0;
  const wallet = {
    balance: jest.fn(async () => balance),
    autoTopUpRoom: jest.fn(
      async () => options.room ?? { perTopUp: 0, topUps: 0, amount: 0 }
    ),
    chargeItems: jest.fn(async () => ({ id: 'entry-1' })),
    notifyIfShort: jest.fn(async () => false),
  } as any;
  const walletBilling = new WalletBillingService(wallet, {} as any);
  const autoTopUp = jest
    .spyOn(walletBilling, 'autoTopUp')
    .mockImplementation(async () => {
      if (!options.topUpAdds) {
        return false;
      }
      balance += options.topUpAdds;
      return true;
    });
  const walletService = {
    unlocksProvider: jest.fn(async () => options.unlocked ?? true),
    billsProvider: jest.fn(async () => true),
    price: jest.fn(async () => ({ action: {}, price: 225 })),
    balance: jest.fn(async () => balance),
    lockedProviderMessageFor: jest.fn(async () => 'Your wallet is on hold.'),
  };
  const provider = {
    analytics: jest.fn(
      async (
        _id: string,
        _token: string,
        _date: number,
        onPostsRead?: (count: number, ids: string[]) => void
      ) => {
        onPostsRead?.(2, ['p1', 'p2']);
        return rows;
      }
    ),
  };
  const service = Object.create(IntegrationService.prototype);
  service._walletService = walletService;
  service._walletBilling = walletBilling;
  service._integrationManager = { getSocialIntegration: () => provider };
  service.getIntegrationById = jest.fn(async () => ({
    id: 'channel-1',
    type: 'social',
    providerIdentifier: 'x',
    internalId: 'x-1',
    token: 'token',
    tokenExpiration: new Date(Date.now() + 86_400_000),
  }));
  service.organizationHasPaidPlan = jest.fn(
    async () => options.paidPlan ?? false
  );
  return {
    service: service as IntegrationService,
    provider,
    wallet,
    walletService,
    autoTopUp,
  };
};

const refusal = async (run: Promise<unknown>) => {
  try {
    await run;
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('expected the read to be refused');
};

describe('IntegrationService.checkAnalytics wallet pre-check', () => {
  beforeEach(() => {
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockReset().mockResolvedValue('OK');
  });

  it('reads X and charges the reads after when the balance is above zero', async () => {
    const { service, provider, wallet, autoTopUp } = make({ balance: 500 });
    expect(await service.checkAnalytics(org, 'channel-1', '7')).toEqual(rows);
    expect(provider.analytics).toHaveBeenCalledTimes(1);
    // No top-up before the read (the charge's usual threshold check may run).
    expect(autoTopUp).not.toHaveBeenCalledWith('org-1', 1, true);
    expect(wallet.chargeItems).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actionKey: 'x.post_read',
        items: ['p1', 'p2'],
        allowNegative: true,
      })
    );
  });

  it('refuses with the wallet 402 at zero balance without auto top-up, and never asks X', async () => {
    const { service, provider, wallet } = make({ balance: 0 });
    const err = await refusal(service.checkAnalytics(org, 'channel-1', '7'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(402);
    expect(err.getResponse()).toEqual({
      message: analyticsNeedsCreditsMessage('channel'),
      wallet: true,
      url: '/wallet',
    });
    expect(provider.analytics).not.toHaveBeenCalled();
    expect(wallet.chargeItems).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('refuses a negative balance too', async () => {
    const { service, provider } = make({ balance: -150 });
    const err = await refusal(service.checkAnalytics(org, 'channel-1', '7'));
    expect(err.getStatus()).toBe(402);
    expect(provider.analytics).not.toHaveBeenCalled();
  });

  it('reads X when auto top-up lifts a zero balance above zero', async () => {
    const { service, provider, autoTopUp } = make({
      balance: 0,
      room: { perTopUp: 100000, topUps: 3, amount: 1000 },
      topUpAdds: 100000,
    });
    expect(await service.checkAnalytics(org, 'channel-1', '7')).toEqual(rows);
    expect(autoTopUp).toHaveBeenCalledWith('org-1', 1, true);
    expect(provider.analytics).toHaveBeenCalledTimes(1);
  });

  it("refuses when auto top-up has reached this month's limit", async () => {
    const { service, provider, autoTopUp } = make({
      balance: 0,
      room: { perTopUp: 100000, topUps: 0, amount: 1000 },
      topUpAdds: 100000,
    });
    const err = await refusal(service.checkAnalytics(org, 'channel-1', '7'));
    expect(err.getStatus()).toBe(402);
    expect(autoTopUp).not.toHaveBeenCalled();
    expect(provider.analytics).not.toHaveBeenCalled();
  });

  it('returns cached analytics at zero balance without a check (no X call)', async () => {
    redis.get.mockResolvedValue(JSON.stringify(rows));
    const { service, provider, walletService } = make({ balance: 0 });
    expect(await service.checkAnalytics(org, 'channel-1', '7')).toEqual(rows);
    expect(provider.analytics).not.toHaveBeenCalled();
    expect(walletService.balance).not.toHaveBeenCalled();
  });

  it('leaves a paid plan untouched: no balance check, no charge', async () => {
    const { service, provider, wallet, walletService } = make({
      balance: 0,
      paidPlan: true,
    });
    expect(await service.checkAnalytics(org, 'channel-1', '7')).toEqual(rows);
    expect(provider.analytics).toHaveBeenCalledTimes(1);
    expect(walletService.balance).not.toHaveBeenCalled();
    expect(wallet.chargeItems).not.toHaveBeenCalled();
  });

  it('ignores fresh on a paid plan: the cached numbers come back', async () => {
    redis.get.mockResolvedValue(JSON.stringify(rows));
    const { service, provider } = make({ balance: 0, paidPlan: true });
    expect(
      await service.checkAnalytics(org, 'channel-1', '7', false, true)
    ).toEqual(rows);
    expect(redis.get).toHaveBeenCalled();
    expect(provider.analytics).not.toHaveBeenCalled();
  });

  it('honours fresh without a paid plan: the cache is skipped', async () => {
    redis.get.mockResolvedValue(JSON.stringify(rows));
    const { service, provider } = make({ balance: 500 });
    expect(
      await service.checkAnalytics(org, 'channel-1', '7', false, true)
    ).toEqual(rows);
    expect(redis.get).not.toHaveBeenCalled();
    expect(provider.analytics).toHaveBeenCalledTimes(1);
  });

  it('refuses a wallet that has not opened the provider with its own reason', async () => {
    const { service, provider } = make({ balance: 500, unlocked: false });
    const err = await refusal(service.checkAnalytics(org, 'channel-1', '7'));
    expect(err.getStatus()).toBe(402);
    expect((err.getResponse() as any).message).toBe('Your wallet is on hold.');
    expect(provider.analytics).not.toHaveBeenCalled();
  });

  it('words the post refusal for a post, without naming a network', () => {
    expect(analyticsNeedsCreditsMessage('post')).toBe(
      "Not enough credits in your wallet to load this post's analytics. Top up to see them."
    );
  });
});
