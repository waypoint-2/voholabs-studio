jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert',
  () => ({ walletAlert: jest.fn(async () => undefined) })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import {
  notEnoughCreditsToStoreMessage,
  STORAGE_ACTION_KEY,
  storageUnitChargeKey,
  WalletStorageService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.storage.service';
import { InsufficientCreditsError } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.repository';
import { WalletHousekeepingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.housekeeping.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';

// WalletStorageService and the housekeeping run with stub services. Nothing
// leaves the process.

const GB = 1024 ** 3;
const FREE_PLAN = { cancelAt: new Date(Date.now() - 86_400_000) };
const PAID_PLAN = { cancelAt: null };

const build = (
  opts: {
    bytes?: number;
    balance?: number;
    pays?: boolean;
    unit?: string;
    standing?: { chargeKey: string; quantity: number }[];
    topUpCovers?: boolean;
    headroom?: number;
  } = {}
) => {
  const media = {
    getStorageUsed: jest.fn(async () => opts.bytes ?? 0),
  } as any;
  const wallet = {
    price: jest.fn(async (key: string) =>
      key === STORAGE_ACTION_KEY
        ? {
            price: 5000,
            action: { unit: opts.unit ?? 'gb', freeUnits: 2 },
          }
        : undefined
    ),
    paysFromWallet: jest.fn(async () => opts.pays ?? true),
    standingChargesOf: jest.fn(async () => opts.standing || []),
    balance: jest.fn(async () => opts.balance ?? 0),
    autoTopUpHeadroom: jest.fn(async () => opts.headroom ?? 0),
  } as any;
  const billing = {
    autoTopUpFor: jest.fn(async () => opts.topUpCovers ?? true),
    charge: jest.fn(async (params: any) => ({
      quantity: params.quantity,
      idempotencyKey: `${params.chargeKey}#1`,
    })),
  } as any;
  const service = new WalletStorageService(media, wallet, billing);
  return { service, media, wallet, billing };
};

const keys = (billing: any) =>
  billing.charge.mock.calls.map((c: any) => c[0].chargeKey);

describe('WalletStorageService units over free', () => {
  const rule = { unitBytes: GB, freeUnits: 2 };

  it('charges nothing up to the free amount', async () => {
    const { service } = build();
    expect(service.unitsOver(0, rule)).toBe(0);
    expect(service.unitsOver(2 * GB, rule)).toBe(0);
    expect(service.unitsOver(-5, rule)).toBe(0);
  });

  it('rounds usage up to whole units above the free amount', async () => {
    const { service } = build();
    expect(service.unitsOver(2 * GB + 1, rule)).toBe(1);
    expect(service.unitsOver(3 * GB, rule)).toBe(1);
    expect(service.unitsOver(5.5 * GB, rule)).toBe(4);
  });

  it('reads the unit size and free amount from the price row', async () => {
    expect(await build().service.rule()).toEqual({
      price: 5000,
      unitBytes: GB,
      freeUnits: 2,
    });
    expect(await build({ unit: 'gb_month' }).service.rule()).toEqual(
      expect.objectContaining({ unitBytes: GB })
    );
    expect(await build({ unit: 'post' }).service.rule()).toBeUndefined();
  });
});

describe('WalletStorageService.payForUpload', () => {
  it('charges nothing while the upload stays within the free amount', async () => {
    const { service, billing } = build({ bytes: GB });
    expect(await service.payForUpload('org-1', 0.5 * GB)).toBe(0);
    expect(billing.charge).not.toHaveBeenCalled();
  });

  it('charges the started unit the upload crosses into, once, under its own key', async () => {
    const { service, billing } = build({ bytes: 1.9 * GB, balance: 9000 });
    expect(await service.payForUpload('org-1', 0.2 * GB)).toBe(1);
    expect(billing.charge).toHaveBeenCalledTimes(1);
    expect(billing.charge).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actionKey: STORAGE_ACTION_KEY,
      chargeKey: storageUnitChargeKey('org-1', 1),
      quantity: 1,
    });
    expect(billing.charge.mock.calls[0][0].allowNegative).toBeUndefined();
  });

  it('charges every unpaid unit a large upload crosses into', async () => {
    const { service, billing } = build({ bytes: 2 * GB });
    expect(await service.payForUpload('org-1', 2.5 * GB)).toBe(3);
    expect(keys(billing)).toEqual([
      'storage:org-1:1',
      'storage:org-1:2',
      'storage:org-1:3',
    ]);
    expect(billing.autoTopUpFor).toHaveBeenCalledWith('org-1', 15000);
  });

  it('does not charge a unit already paid for', async () => {
    const { service, billing } = build({
      bytes: 2.5 * GB,
      standing: [{ chargeKey: 'storage:org-1:1', quantity: 1 }],
    });
    expect(await service.payForUpload('org-1', 0.4 * GB)).toBe(0);
    expect(billing.charge).not.toHaveBeenCalled();
  });

  it('treats units charged under the old monthly keys as paid', async () => {
    const { service, billing } = build({
      bytes: 4 * GB,
      standing: [
        { chargeKey: 'storage:org-1:2026-09', quantity: 1 },
        { chargeKey: 'storage:org-1:2026-09:2', quantity: 1 },
        { chargeKey: 'storage:org-1:2026-10', quantity: 1 },
        { chargeKey: 'storage:other-org:5', quantity: 1 },
      ],
    });
    expect(await service.payForUpload('org-1', 0.5 * GB)).toBe(1);
    expect(keys(billing)).toEqual(['storage:org-1:3']);
  });

  it('refuses with the wallet 402 and charges nothing when the balance cannot pay', async () => {
    const { service, billing } = build({
      bytes: 2 * GB,
      balance: 100,
      topUpCovers: false,
    });
    const refused = await service.payForUpload('org-1', 1).catch((err) => err);
    expect(refused.getStatus()).toBe(402);
    expect(refused.getResponse()).toEqual({
      message: notEnoughCreditsToStoreMessage(),
      wallet: true,
      url: '/wallet',
    });
    expect(billing.autoTopUpFor).toHaveBeenCalledWith('org-1', 5000);
    expect(billing.charge).not.toHaveBeenCalled();
  });

  it('charges after auto top-up covers a short balance', async () => {
    const { service, billing } = build({
      bytes: 2 * GB,
      balance: 100,
      topUpCovers: true,
    });
    expect(await service.payForUpload('org-1', 1)).toBe(1);
    expect(billing.autoTopUpFor).toHaveBeenCalledWith('org-1', 5000);
    expect(keys(billing)).toEqual(['storage:org-1:1']);
  });

  it('turns a balance spent in the meantime into the wallet 402', async () => {
    const { service, billing } = build({ bytes: 2 * GB });
    billing.charge.mockRejectedValueOnce(new InsufficientCreditsError(5000, 0));
    const refused = await service.payForUpload('org-1', 1).catch((err) => err);
    expect(refused.getStatus()).toBe(402);
  });

  it('only checks a size announced before the upload, without charging', async () => {
    const short = build({ bytes: 2 * GB, balance: 100, headroom: 1000 });
    const refused = await short.service
      .payForUpload('org-1', 1, { charge: false })
      .catch((err) => err);
    expect(refused.getStatus()).toBe(402);

    const covered = build({ bytes: 2 * GB, balance: 100, headroom: 10000 });
    expect(
      await covered.service.payForUpload('org-1', 1, { charge: false })
    ).toBe(0);
    for (const b of [short, covered]) {
      expect(b.billing.charge).not.toHaveBeenCalled();
      expect(b.billing.autoTopUpFor).not.toHaveBeenCalled();
    }
  });

  it('never charges an organization that does not pay from its wallet', async () => {
    const { service, billing, wallet } = build({ pays: false, bytes: 9 * GB });
    expect(await service.payForUpload('org-1', GB)).toBe(0);
    expect(wallet.price).not.toHaveBeenCalled();
    expect(billing.charge).not.toHaveBeenCalled();
  });
});

describe('WalletHousekeepingService', () => {
  const housekeeping = (organizations: any[] = []) => {
    const media = {
      storageOfWalletOrganizations: jest.fn(async () => organizations),
    } as any;
    const wallet = { notifyIfShort: jest.fn(async () => true) } as any;
    const billing = {
      reconcile: jest.fn(async (days: number) => ({
        days,
        since: new Date(),
        stripeOnly: [{}],
        ledgerOnly: [],
        mismatched: [],
      })),
    } as any;
    return {
      service: new WalletHousekeepingService(media, wallet, billing),
      wallet,
      billing,
    };
  };

  const env = process.env.WALLET_STRIPE_SECRET_KEY;
  afterEach(() => {
    process.env.WALLET_STRIPE_SECRET_KEY = env;
    jest.useRealTimers();
  });

  it('no longer charges storage', async () => {
    const { service } = housekeeping();
    expect(await service.run()).not.toHaveProperty('storage');
  });

  it('sends short-forecast notices to wallet organizations not on a paid plan', async () => {
    const { service, wallet } = housekeeping([
      { organizationId: 'a', subscription: FREE_PLAN },
      { organizationId: 'b', subscription: PAID_PLAN },
    ]);
    const result = await service.run();
    expect(result.notified).toBe(1);
    expect(wallet.notifyIfShort).toHaveBeenCalledTimes(1);
    expect(wallet.notifyIfShort).toHaveBeenCalledWith('a');
  });

  it('reconciles once a day and alerts on a difference', async () => {
    process.env.WALLET_STRIPE_SECRET_KEY = 'sk_test_stub';
    jest.useFakeTimers({
      now: new Date(Date.UTC(2026, 9, 4, 12)),
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const { service, billing } = housekeeping();
    expect((await service.run()).reconciled).toBe(true);
    expect((await service.run()).reconciled).toBe(false);
    expect(billing.reconcile).toHaveBeenCalledTimes(1);
    expect(walletAlert).toHaveBeenCalledWith(
      expect.stringContaining('1 paid in Stripe but not credited')
    );
  });

  it('does not reconcile without wallet payments', async () => {
    delete process.env.WALLET_STRIPE_SECRET_KEY;
    const { service, billing } = housekeeping();
    expect((await service.run()).reconciled).toBe(false);
    expect(billing.reconcile).not.toHaveBeenCalled();
  });
});
