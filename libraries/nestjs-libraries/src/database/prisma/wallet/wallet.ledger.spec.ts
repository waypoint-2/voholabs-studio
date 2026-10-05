import {
  InsufficientCreditsError,
  WalletRepository,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.repository';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';

// An in-memory stand-in for the Prisma models the wallet ledger touches.
// Enough of `where` is understood for the repository's queries: equality,
// `startsWith`, `in` and `gte`. Duplicate idempotency keys throw P2002 like
// the real unique index.
type Row = Record<string, any>;

const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('startsWith' in cond) {
        return typeof value === 'string' && value.startsWith(cond.startsWith);
      }
      if ('in' in cond) {
        return cond.in.includes(value);
      }
      if ('gte' in cond) {
        return value >= cond.gte;
      }
      return false;
    }
    return value === cond;
  });

const fakeDb = (actions: Row[] = [], settings: Record<string, string> = {}) => {
  const entries: Row[] = [];
  const wallets: Row[] = [];
  // Entries are dated now, a second apart, so a "this month" allowance sees
  // them whenever the tests run.
  const start = Date.now();
  let clock = 0;

  const walletEntry = {
    create: async ({ data }: { data: Row }) => {
      if (
        data.idempotencyKey &&
        entries.some((e) => e.idempotencyKey === data.idempotencyKey)
      ) {
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      }
      const row = {
        id: `e${entries.length + 1}`,
        quantity: 1,
        createdAt: new Date(start + 1000 * clock++),
        ...data,
      };
      entries.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Row }) =>
      entries.find((e) => matches(e, where)) || null,
    findUniqueOrThrow: async ({ where }: { where: Row }) => {
      const row = entries.find((e) => matches(e, where));
      if (!row) {
        throw new Error('Not found');
      }
      return row;
    },
    findMany: async ({ where }: { where: Row }) =>
      entries.filter((e) => matches(e, where)),
    findFirst: async ({ where }: { where: Row }) =>
      entries
        .filter((e) => matches(e, where))
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null,
    count: async ({ where }: { where: Row }) =>
      entries.filter((e) => matches(e, where)).length,
    aggregate: async ({ where }: { where: Row }) => {
      const rows = entries.filter((e) => matches(e, where));
      return {
        _sum: {
          amount: rows.length
            ? rows.reduce((s, e) => s + (e.amount || 0), 0)
            : null,
          paidAmount: rows.length
            ? rows.reduce((s, e) => s + (e.paidAmount || 0), 0)
            : null,
        },
      };
    },
  };

  const wallet = {
    upsert: async ({ where, create }: { where: Row; create: Row }) => {
      let row = wallets.find((w) => matches(w, where));
      if (!row) {
        row = {
          firstTopUpAt: null,
          currency: null,
          frozenAt: null,
          autoTopUp: false,
          ...create,
        };
        wallets.push(row);
      }
      return row;
    },
    findUnique: async ({ where }: { where: Row }) =>
      wallets.find((w) => matches(w, where)) || null,
    update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = wallets.find((w) => matches(w, where));
      Object.assign(row, data);
      return row;
    }),
  };

  // The used-units query of the free allowance: SPEND entries of an action
  // since a date that were not refunded. Any other raw query (the row lock)
  // returns nothing.
  const $queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
    if (!strings.join('').includes('COALESCE(SUM')) {
      return [];
    }
    const [organizationId, actionKey, since] = values;
    const used = entries
      .filter(
        (e) =>
          e.organizationId === organizationId &&
          e.type === 'SPEND' &&
          e.actionKey === actionKey &&
          e.createdAt >= since &&
          !entries.some((r) => r.idempotencyKey === `refund:${e.idempotencyKey}`)
      )
      .reduce((sum, e) => sum + (e.quantity ?? 1), 0);
    return [{ used: BigInt(used) }];
  };

  const model: Row = {
    walletEntry,
    wallet,
    billableAction: { findMany: async () => actions },
    billingSetting: {
      findMany: async () =>
        Object.entries(settings).map(([key, value]) => ({ key, value })),
    },
    $queryRaw,
  };
  model.$transaction = async (cb: (tx: Row) => any) => cb(model);

  return { entries, wallets, model };
};

const setup = (
  actions: Row[] = [],
  settings: Record<string, string> = {}
) => {
  const db = fakeDb(actions, settings);
  const repo = { model: db.model } as any;
  const repository = new WalletRepository(
    repo,
    repo,
    repo,
    repo,
    repo,
    repo,
    repo,
    repo
  );
  const notifications = { inAppNotification: jest.fn() } as any;
  const service = new WalletService(repository, notifications);
  return { db, repository, service };
};

const ORG = 'org-1';

const spendPost = (
  repository: WalletRepository,
  amount: number,
  extra: { allowNegative?: boolean; chargeKey?: string } = {}
) =>
  repository.spend({
    organizationId: ORG,
    amount,
    type: 'SPEND',
    actionKey: 'x.post',
    quantity: 1,
    unitPrice: amount,
    description: 'Post on X',
    chargeKey: extra.chargeKey || 'post:p1',
    allowNegative: extra.allowNegative,
  });

const credit = (repository: WalletRepository, amount: number, key = 'g1') =>
  repository.add({
    organizationId: ORG,
    amount,
    type: 'GRANT',
    description: 'test credit',
    idempotencyKey: key,
  });

describe('WalletRepository.spend', () => {
  it('stores the first charge for a chargeKey as <chargeKey>#1, negative', async () => {
    const { repository } = setup();
    await credit(repository, 1000);
    const entry = await spendPost(repository, 225);
    expect(entry.idempotencyKey).toBe('post:p1#1');
    expect(entry.amount).toBe(-225);
    expect(await repository.balance(ORG)).toBe(775);
  });

  it('returns the standing charge instead of charging the same chargeKey twice', async () => {
    const { repository, db } = setup();
    await credit(repository, 1000);
    const first = await spendPost(repository, 225);
    const second = await spendPost(repository, 225);
    expect(second).toBe(first);
    expect(db.entries.filter((e) => e.type === 'SPEND')).toHaveLength(1);
    expect(await repository.balance(ORG)).toBe(775);
  });

  it('charges again as <chargeKey>#2 after the first charge was refunded', async () => {
    const { repository, service } = setup();
    await credit(repository, 1000);
    await spendPost(repository, 225);
    await service.refund('post:p1#1');
    const again = await spendPost(repository, 225);
    expect(again.idempotencyKey).toBe('post:p1#2');
    expect(await repository.balance(ORG)).toBe(775);
  });

  it('throws InsufficientCreditsError with needed and balance when the balance is short', async () => {
    const { repository, db } = setup();
    await credit(repository, 100);
    const err = await spendPost(repository, 225).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.needed).toBe(225);
    expect(err.balance).toBe(100);
    expect(db.entries.filter((e) => e.type === 'SPEND')).toHaveLength(0);
  });

  it('charges an exact balance down to zero', async () => {
    const { repository } = setup();
    await credit(repository, 225);
    await spendPost(repository, 225);
    expect(await repository.balance(ORG)).toBe(0);
  });

  it('charges into a negative balance with allowNegative', async () => {
    const { repository } = setup();
    await credit(repository, 100);
    const entry = await spendPost(repository, 5000, {
      allowNegative: true,
      chargeKey: 'storage:2026-10',
    });
    expect(entry.amount).toBe(-5000);
    expect(await repository.balance(ORG)).toBe(-4900);
  });

  it('keeps different chargeKeys independent', async () => {
    const { repository } = setup();
    await credit(repository, 1000);
    const a = await spendPost(repository, 225, { chargeKey: 'post:a' });
    const b = await spendPost(repository, 225, { chargeKey: 'post:b' });
    expect(a.idempotencyKey).toBe('post:a#1');
    expect(b.idempotencyKey).toBe('post:b#1');
    expect(await repository.balance(ORG)).toBe(550);
  });
});

describe('WalletRepository.add', () => {
  it('returns the first entry when the idempotency key repeats', async () => {
    const { repository, db } = setup();
    const a = await credit(repository, 500, 'same');
    const b = await credit(repository, 500, 'same');
    expect(b).toBe(a);
    expect(db.entries).toHaveLength(1);
  });

  it('rethrows a duplicate when the entry has no idempotency key', async () => {
    const { repository, db } = setup();
    db.model.walletEntry.create = async () => {
      throw Object.assign(new Error('dup'), { code: 'P2002' });
    };
    await expect(
      repository.add({
        organizationId: ORG,
        amount: 1,
        type: 'GRANT',
        description: 'x',
      })
    ).rejects.toThrow('dup');
  });
});

describe('WalletService.refund', () => {
  it('gives a charge back once, however often it is called', async () => {
    const { repository, service, db } = setup();
    await credit(repository, 1000);
    await spendPost(repository, 225);
    const first = await service.refund('post:p1#1', 'X rejected the post');
    const second = await service.refund('post:p1#1');
    expect(first.amount).toBe(225);
    expect(first.type).toBe('REFUND');
    expect(first.idempotencyKey).toBe('refund:post:p1#1');
    expect(first.description).toBe('X rejected the post');
    expect(second).toBe(first);
    expect(db.entries.filter((e) => e.type === 'REFUND')).toHaveLength(1);
    expect(await repository.balance(ORG)).toBe(1000);
  });

  it('does nothing when the charge does not exist', async () => {
    const { service, db } = setup();
    expect(await service.refund('post:missing#1')).toBeUndefined();
    expect(db.entries).toHaveLength(0);
  });

  it('does not refund an entry that was not a charge', async () => {
    const { repository, service } = setup();
    await credit(repository, 1000, 'grant-1');
    expect(await service.refund('grant-1')).toBeUndefined();
    expect(await repository.balance(ORG)).toBe(1000);
  });
});

describe('WalletService.addTopUp', () => {
  const topUp = (service: WalletService, paymentIntentId = 'pi_1') =>
    service.addTopUp({
      organizationId: ORG,
      amount: 1000,
      credits: 100000,
      currency: 'usd',
      auto: false,
      paymentIntentId,
    });

  it('credits a payment intent once, however often the webhook repeats', async () => {
    const { service, repository, db } = setup();
    const a = await topUp(service);
    const b = await topUp(service);
    expect(b).toBe(a);
    expect(a.idempotencyKey).toBe('topup:pi_1');
    expect(a.type).toBe('TOPUP');
    expect(a.currency).toBe('USD');
    expect(db.entries).toHaveLength(1);
    expect(await repository.balance(ORG)).toBe(100000);
  });

  it('tells the workspace in the bell once per payment', async () => {
    const { service } = setup();
    const bell = (service as any)._notifications.inAppNotification;
    await topUp(service);
    await topUp(service);
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bell.mock.calls[0][2]).toBe(
      'Top-up: 1,000.00 credits added to your wallet ($10.00).'
    );
    // In the bell only: no email.
    expect(bell.mock.calls[0][3]).toBe(false);
  });

  it('starts pay-as-you-go on the first top-up and keeps that date afterwards', async () => {
    const { service, db } = setup();
    await topUp(service, 'pi_1');
    const started = db.wallets[0].firstTopUpAt;
    expect(started).toBeInstanceOf(Date);
    expect(db.wallets[0].currency).toBe('USD');
    expect(await service.isPayAsYouGo(ORG)).toBe(true);

    await topUp(service, 'pi_2');
    expect(db.wallets[0].firstTopUpAt).toBe(started);
    expect(db.model.wallet.update).toHaveBeenCalledTimes(1);
  });

  it('records an automatic top-up as AUTO_TOPUP', async () => {
    const { service } = setup();
    const entry = await service.addTopUp({
      organizationId: ORG,
      amount: 1000,
      credits: 100000,
      currency: 'USD',
      auto: true,
      paymentIntentId: 'pi_auto',
    });
    expect(entry.type).toBe('AUTO_TOPUP');
    expect(entry.paidAmount).toBe(1000);
  });
});

describe('WalletService.clawBack', () => {
  const topUp = async (service: WalletService) =>
    service.addTopUp({
      organizationId: ORG,
      amount: 1000,
      credits: 100000,
      currency: 'USD',
      auto: false,
      paymentIntentId: 'pi_1',
    });

  it('takes back the refunded share and freezes the wallet', async () => {
    const { service, repository, db } = setup();
    await topUp(service);
    const result = await service.clawBack({
      paymentIntentId: 'pi_1',
      share: 0.5,
      eventKey: 'refund:500',
      description: 'Payment refunded',
    });
    expect(result.credits).toBe(50000);
    expect(await repository.balance(ORG)).toBe(50000);
    expect(db.wallets[0].frozenAt).toBeInstanceOf(Date);
    expect(db.wallets[0].autoTopUp).toBe(false);
    expect(await service.isPayAsYouGo(ORG)).toBe(false);
  });

  it('tells the workspace its wallet is on hold, once', async () => {
    const { service } = setup();
    await topUp(service);
    const bell = (service as any)._notifications.inAppNotification;
    bell.mockClear();
    for (const eventKey of ['refund:500', 'dispute:dp_1']) {
      await service.clawBack({
        paymentIntentId: 'pi_1',
        share: 1,
        eventKey,
        description: 'Payment refunded',
      });
    }
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bell.mock.calls[0][1]).toBe('Wallet on hold');
    expect(bell.mock.calls[0][5]).toBe('fail');
  });

  it('never takes back more than was credited when a partial refund is followed by a dispute', async () => {
    const { service, repository } = setup();
    await topUp(service);
    await service.clawBack({
      paymentIntentId: 'pi_1',
      share: 0.3,
      eventKey: 'refund:300',
      description: 'Payment refunded',
    });
    const dispute = await service.clawBack({
      paymentIntentId: 'pi_1',
      share: 1,
      eventKey: 'dispute:dp_1',
      description: 'Payment disputed',
    });
    expect(dispute.credits).toBe(70000);
    expect(await repository.balance(ORG)).toBe(0);

    const again = await service.clawBack({
      paymentIntentId: 'pi_1',
      share: 1,
      eventKey: 'dispute:dp_2',
      description: 'Payment disputed',
    });
    expect(again.credits).toBe(0);
    expect(again.entry).toBeUndefined();
    expect(await repository.balance(ORG)).toBe(0);
  });

  it('writes a repeated Stripe event only once', async () => {
    const { service, repository } = setup();
    await topUp(service);
    const params = {
      paymentIntentId: 'pi_1',
      share: 0.5,
      eventKey: 'refund:500',
      description: 'Payment refunded',
    };
    await service.clawBack(params);
    await service.clawBack(params);
    expect(await repository.balance(ORG)).toBe(50000);
  });

  it('can take the balance below zero when the credits were already spent', async () => {
    const { service, repository } = setup();
    await topUp(service);
    await spendPost(repository, 90000);
    await service.clawBack({
      paymentIntentId: 'pi_1',
      share: 1,
      eventKey: 'dispute:dp_1',
      description: 'Payment disputed',
    });
    expect(await repository.balance(ORG)).toBe(-90000);
  });

  it('returns undefined for a payment that never credited this ledger', async () => {
    const { service, db } = setup();
    expect(
      await service.clawBack({
        paymentIntentId: 'pi_unknown',
        share: 1,
        eventKey: 'dispute:dp_1',
        description: 'Payment disputed',
      })
    ).toBeUndefined();
    expect(db.entries).toHaveLength(0);
  });
});

describe('free allowance through WalletService.charge', () => {
  const action = (over: Row = {}) => ({
    key: 'brief.onboarding',
    provider: 'brief',
    category: 'brief',
    name: 'Brief onboarding',
    description: null,
    unit: 'onboarding',
    costMicros: 0,
    costCurrency: 'USD',
    multiplierBp: null,
    fixedPrice: 25000,
    freeUnits: 1,
    freePeriod: 'ONCE',
    billing: 'PER_USE',
    requiresTopUp: true,
    active: true,
    ...over,
  });
  const SETTINGS = { wallet_currency: 'USD', credits_per_unit: '100' };

  const charge = (
    service: WalletService,
    chargeKey: string,
    actionKey = 'brief.onboarding',
    quantity = 1
  ) =>
    service.charge({ organizationId: ORG, actionKey, chargeKey, quantity });

  it('ONCE: the first charge is a zero "Included free" entry, even with no balance', async () => {
    const { service, repository } = setup([action()], SETTINGS);
    const entry = await charge(service, 'onboarding:1');
    expect(entry.amount).toBe(0);
    expect(entry.unitPrice).toBe(0);
    expect(entry.description).toBe('Included free');
    expect(entry.type).toBe('SPEND');
    expect(await repository.balance(ORG)).toBe(0);
  });

  it('ONCE: the second charge is priced', async () => {
    const { service, repository } = setup([action()], SETTINGS);
    await credit(repository, 30000);
    await charge(service, 'onboarding:1');
    const second = await charge(service, 'onboarding:2');
    expect(second.amount).toBe(-25000);
    expect(second.unitPrice).toBe(25000);
    expect(second.description).toBe('Brief onboarding');
    expect(await repository.balance(ORG)).toBe(5000);
  });

  it('ONCE: the second charge needs the balance', async () => {
    const { service } = setup([action()], SETTINGS);
    await charge(service, 'onboarding:1');
    await expect(charge(service, 'onboarding:2')).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
  });

  it('refunding a free charge gives its free unit back', async () => {
    const { service, repository, db } = setup([action()], SETTINGS);
    const free = await charge(service, 'onboarding:1');
    const refund = await service.refund(free.idempotencyKey!, 'failed');
    expect(refund?.type).toBe('REFUND');
    expect(refund?.amount === 0).toBe(true);
    expect(await service.freeUnitsRemaining(ORG, 'brief.onboarding')).toBe(1);
    const again = await charge(service, 'onboarding:2');
    expect(again.description).toBe('Included free');
    expect(await repository.balance(ORG)).toBe(0);
    expect(db.entries.filter((e) => e.type === 'SPEND')).toHaveLength(2);
  });

  it('MONTH: a charge larger than what is left is priced for the rest only', async () => {
    const reads = action({
      key: 'x.post_read',
      provider: 'x',
      fixedPrice: 75,
      freeUnits: 5,
      freePeriod: 'MONTH',
    });
    const { service, repository } = setup([reads], SETTINGS);
    await credit(repository, 1000);
    const first = await charge(service, 'reads:1', 'x.post_read', 3);
    expect(first.amount).toBe(0);
    expect(first.description).toBe('Included free');
    const second = await charge(service, 'reads:2', 'x.post_read', 4);
    // 2 free left, 2 charged
    expect(second.amount).toBe(-150);
    expect(second.quantity).toBe(4);
    expect(JSON.parse(second.meta)).toEqual({ freeQuantity: 2 });
    const third = await charge(service, 'reads:3', 'x.post_read', 1);
    expect(third.amount).toBe(-75);
    expect(await service.freeUnitsRemaining(ORG, 'x.post_read')).toBe(0);
  });

  it('MONTH: last month\'s use does not count', async () => {
    const reads = action({
      key: 'x.post_read',
      provider: 'x',
      fixedPrice: 75,
      freeUnits: 1,
      freePeriod: 'MONTH',
    });
    const { service, db } = setup([reads], SETTINGS);
    const now = new Date();
    db.entries.push({
      id: 'old',
      organizationId: ORG,
      type: 'SPEND',
      actionKey: 'x.post_read',
      quantity: 1,
      amount: 0,
      idempotencyKey: 'reads:old#1',
      createdAt: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 86_400_000
      ),
    });
    expect((await charge(service, 'reads:1', 'x.post_read')).amount).toBe(0);
  });

  it('MONTHLY rows (storage) are charged in full: storage applies its free amount itself', async () => {
    const storage = action({
      key: 'storage.gb',
      provider: 'storage',
      unit: 'gb',
      fixedPrice: 5000,
      freeUnits: 2,
      freePeriod: 'MONTH',
      billing: 'MONTHLY',
      requiresTopUp: false,
    });
    const { service, repository } = setup([storage], SETTINGS);
    const entry = await service.charge({
      organizationId: ORG,
      actionKey: 'storage.gb',
      chargeKey: 'storage:org-1:2026-10',
      quantity: 1,
      allowNegative: true,
    });
    expect(entry.amount).toBe(-5000);
    expect(await repository.balance(ORG)).toBe(-5000);
  });
});

describe('WalletService.grant and adjust idempotency', () => {
  it('grants once per idempotency key', async () => {
    const { service, repository, db } = setup();
    const params = {
      organizationId: ORG,
      credits: 1000,
      reason: 'goodwill',
      actorId: 'admin-1',
      idempotencyKey: 'ticket-7',
    };
    const a = await service.grant(params);
    const b = await service.grant(params);
    expect(b).toBe(a);
    expect(a.idempotencyKey).toBe('admin:grant:org-1:ticket-7');
    expect(a.actorId).toBe('admin-1');
    expect(db.entries).toHaveLength(1);
    expect(await repository.balance(ORG)).toBe(1000);
  });

  it('grants every time without a key', async () => {
    const { service, repository } = setup();
    const params = {
      organizationId: ORG,
      credits: 1000,
      reason: 'goodwill',
      actorId: 'admin-1',
    };
    await service.grant(params);
    await service.grant(params);
    expect(await repository.balance(ORG)).toBe(2000);
  });

  it('starts pay-as-you-go when the grant unlocks', async () => {
    const { service, db } = setup();
    await service.grant({
      organizationId: ORG,
      credits: 1000,
      reason: 'pilot',
      actorId: 'admin-1',
      unlock: true,
    });
    expect(db.wallets[0].firstTopUpAt).toBeInstanceOf(Date);
    expect(await service.isPayAsYouGo(ORG)).toBe(true);
  });

  it('adjusts once per idempotency key, separately from grants', async () => {
    const { service, repository } = setup();
    const params = {
      organizationId: ORG,
      credits: -300,
      reason: 'correction',
      actorId: 'admin-1',
      idempotencyKey: 'ticket-7',
    };
    await service.grant({ ...params, credits: 1000 });
    const a = await service.adjust(params);
    const b = await service.adjust(params);
    expect(b).toBe(a);
    expect(a.idempotencyKey).toBe('admin:adjust:org-1:ticket-7');
    expect(await repository.balance(ORG)).toBe(700);
  });
});

describe('WalletService.chargeItems (analytics reads, once per post per day)', () => {
  const reads = (over: Row = {}) => ({
    key: 'x.post_read',
    provider: 'x',
    category: 'x',
    name: 'X post read',
    description: null,
    unit: 'read',
    costMicros: 0,
    costCurrency: 'USD',
    multiplierBp: null,
    fixedPrice: 75,
    freeUnits: 0,
    freePeriod: null,
    billing: 'PER_USE',
    requiresTopUp: true,
    active: true,
    ...over,
  });
  const SETTINGS = { wallet_currency: 'USD', credits_per_unit: '100' };
  const DAY = 'xread:org-1:2026-10-04:';

  const read = (
    service: WalletService,
    items: string[],
    extra: { org?: string; prefix?: string } = {}
  ) =>
    service.chargeItems({
      organizationId: extra.org || ORG,
      actionKey: 'x.post_read',
      chargePrefix: extra.prefix || DAY,
      items,
      unitsPerItem: 2,
      allowNegative: true,
      reference: 'channel-1',
    });

  it('charges two reads per post and lists the posts on the entry', async () => {
    const { service, repository } = setup([reads()], SETTINGS);
    await credit(repository, 10000);
    const entry = await read(service, ['a', 'b']);
    expect(entry?.quantity).toBe(4);
    expect(entry?.amount).toBe(-300);
    expect(entry?.unitPrice).toBe(75);
    expect(entry?.chargeKey).toBe(`${DAY}1`);
    expect(entry?.idempotencyKey).toBe(`${DAY}1#1`);
    expect(JSON.parse(entry!.meta)).toEqual({ items: ['a', 'b'] });
    expect(await repository.balance(ORG)).toBe(10000 - 300);
  });

  it('the 7, 30 and 90 day windows and a refresh charge each post once', async () => {
    const { service, repository, db } = setup([reads()], SETTINGS);
    await credit(repository, 10000);
    // 7 days
    expect((await read(service, ['a', 'b']))?.quantity).toBe(4);
    // 30 days: a and b were paid for already
    const month = await read(service, ['a', 'b', 'c', 'd']);
    expect(month?.quantity).toBe(4);
    expect(JSON.parse(month!.meta).items).toEqual(['c', 'd']);
    // 90 days
    expect((await read(service, ['a', 'b', 'c', 'd', 'e']))?.quantity).toBe(2);
    // Refresh (fresh=1) of any window the same day: nothing new
    expect(await read(service, ['a', 'b', 'c', 'd', 'e'])).toBeNull();
    expect(await read(service, ['b', 'a'])).toBeNull();
    const spends = db.entries.filter((e) => e.type === 'SPEND');
    expect(spends).toHaveLength(3);
    // 5 posts x 2 reads x 75
    expect(await repository.balance(ORG)).toBe(10000 - 750);
  });

  it('a duplicated post in one read is charged once', async () => {
    const { service } = setup([reads()], SETTINGS);
    expect((await read(service, ['a', 'a', 'b']))?.quantity).toBe(4);
  });

  it('a new UTC day charges the posts again', async () => {
    const { service, repository } = setup([reads()], SETTINGS);
    await credit(repository, 10000);
    await read(service, ['a', 'b']);
    const tomorrow = await read(service, ['a', 'b'], {
      prefix: 'xread:org-1:2026-10-05:',
    });
    expect(tomorrow?.quantity).toBe(4);
    expect(await repository.balance(ORG)).toBe(10000 - 600);
  });

  it('another workspace reading the same posts pays for its own reads', async () => {
    const { service, repository } = setup([reads()], SETTINGS);
    await read(service, ['a']);
    const other = await read(service, ['a'], {
      org: 'org-2',
      prefix: 'xread:org-2:2026-10-04:',
    });
    expect(other?.quantity).toBe(2);
    expect(other?.idempotencyKey).toBe('xread:org-2:2026-10-04:1#1');
    expect(await repository.balance(ORG)).toBe(-150);
  });

  it('a refunded read charge frees its posts to be charged again', async () => {
    const { service, repository } = setup([reads()], SETTINGS);
    await credit(repository, 10000);
    const first = await read(service, ['a', 'b']);
    await service.refund(first!.idempotencyKey!, 'test');
    const again = await read(service, ['a', 'b']);
    expect(again?.quantity).toBe(4);
    expect(again?.chargeKey).toBe(`${DAY}2`);
    expect(await repository.balance(ORG)).toBe(10000 - 300);
  });

  it('reads already made are charged into a negative balance', async () => {
    const { service, repository } = setup([reads()], SETTINGS);
    await read(service, ['a']);
    expect(await repository.balance(ORG)).toBe(-150);
  });

  it('without allowNegative a short balance is refused and nothing is written', async () => {
    const { service, db } = setup([reads()], SETTINGS);
    await expect(
      service.chargeItems({
        organizationId: ORG,
        actionKey: 'x.post_read',
        chargePrefix: DAY,
        items: ['a'],
        unitsPerItem: 2,
      })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(db.entries).toHaveLength(0);
  });

  it('applies the monthly free reads and keeps the posts on the entry', async () => {
    const { service, repository } = setup(
      [reads({ freeUnits: 3, freePeriod: 'MONTH' })],
      SETTINGS
    );
    await credit(repository, 10000);
    const entry = await read(service, ['a', 'b']);
    // 4 reads, 3 free
    expect(entry?.amount).toBe(-75);
    expect(JSON.parse(entry!.meta)).toEqual({
      items: ['a', 'b'],
      freeQuantity: 3,
    });
    expect(await read(service, ['a', 'b'])).toBeNull();
  });

  it('nothing to read charges nothing', async () => {
    const { service, db } = setup([reads()], SETTINGS);
    expect(await read(service, [])).toBeNull();
    expect(db.entries).toHaveLength(0);
  });
});
