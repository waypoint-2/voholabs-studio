import { HttpException } from '@nestjs/common';
import {
  ChargePostRow,
  WalletRepository,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.repository';
import {
  postOccurrenceChargeKey,
  repeatRunOf,
  WalletService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  REFUND_REASONS,
  WalletPostsService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.posts.service';

// Charging posts when they are scheduled, against an in-memory ledger.
type Row = Record<string, any>;

const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) {
        return cond.in.includes(value);
      }
      if ('startsWith' in cond) {
        return typeof value === 'string' && value.startsWith(cond.startsWith);
      }
      if ('gte' in cond) {
        return value >= cond.gte;
      }
      return false;
    }
    return value === cond;
  });

const fakeDb = () => {
  const entries: Row[] = [];
  const wallets: Row[] = [];
  const start = Date.now();
  let clock = 0;
  const byNewest = (a: Row, b: Row) => b.createdAt - a.createdAt;
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
    findFirst: async ({ where }: { where: Row }) =>
      entries.filter((e) => matches(e, where)).sort(byNewest)[0] || null,
    findMany: async ({ where }: { where: Row }) =>
      entries.filter((e) => matches(e, where)).sort(byNewest),
    count: async ({ where }: { where: Row }) =>
      entries.filter((e) => matches(e, where)).length,
    aggregate: async ({ where }: { where: Row }) => {
      const rows = entries.filter((e) => matches(e, where));
      return {
        _sum: {
          amount: rows.length
            ? rows.reduce((s, e) => s + (e.amount || 0), 0)
            : null,
          paidAmount: null,
        },
      };
    },
  };
  const wallet = {
    upsert: async ({ where, create }: { where: Row; create: Row }) => {
      let row = wallets.find((w) => matches(w, where));
      if (!row) {
        row = { ...create };
        wallets.push(row);
      }
      return row;
    },
    findUnique: async ({ where }: { where: Row }) =>
      wallets.find((w) => matches(w, where)) || null,
  };
  const model: Row = {
    walletEntry,
    wallet,
    billableAction: {
      findMany: async () => [
        action('x.post', 15000),
        action('x.post_link', 200000),
      ],
    },
    billingSetting: {
      findMany: async () =>
        Object.entries({
          wallet_currency: 'USD',
          credits_per_unit: '100',
          default_multiplier_bp: '15000',
        }).map(([key, value]) => ({ key, value })),
    },
    $queryRaw: async () => [],
  };
  model.$transaction = async (cb: (tx: Row) => any) => cb(model);
  return { entries, model };
};

const action = (key: string, costMicros: number) => ({
  id: key,
  key,
  provider: 'x',
  category: 'channels',
  name: key === 'x.post' ? 'Post on X' : 'Post on X with a link',
  description: null,
  unit: 'post',
  freeUnits: null,
  freePeriod: null,
  billing: 'PER_USE',
  requiresTopUp: true,
  costMicros,
  costCurrency: 'USD',
  multiplierBp: null,
  fixedPrice: null,
  active: true,
});

const ORG = 'org-1';
const PLAIN = 225;
const LINK = 3000;

const post = (
  over: Partial<ChargePostRow> & { id: string }
): ChargePostRow => ({
  group: 'g1',
  parentPostId: null,
  state: 'QUEUE',
  content: '<p>Hello</p>',
  releaseURL: null,
  releaseId: null,
  deletedAt: null,
  publishDate: new Date(),
  intervalInDays: null,
  integration: { providerIdentifier: 'x' },
  ...over,
});

const setup = (options: { balance?: number; topUp?: number } = {}) => {
  const db = fakeDb();
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
  let rows: ChargePostRow[] = [];
  jest
    .spyOn(repository, 'postsInGroups')
    .mockImplementation(async (_org, groups) =>
      rows.filter((r) => groups.includes(r.group))
    );
  const notifications = { inAppNotification: jest.fn() } as any;
  const wallet = new WalletService(repository, notifications);
  jest.spyOn(wallet, 'paysFromWallet').mockResolvedValue(true);
  // Auto top-up: adds `topUp` credits once when asked, if set.
  const billing = {
    autoTopUpFor: jest.fn(async (_org: string, needed: number) => {
      if ((await repository.balance(ORG)) >= needed) {
        return true;
      }
      if (!options.topUp) {
        return false;
      }
      await repository.add({
        organizationId: ORG,
        amount: options.topUp,
        type: 'AUTO_TOPUP',
        description: 'Auto top-up',
        idempotencyKey: `auto:${db.entries.length}`,
      });
      return (await repository.balance(ORG)) >= needed;
    }),
    autoTopUp: jest.fn(async () => false),
    notifyIfShort: jest.fn(async () => undefined),
  } as any;
  const service = new WalletPostsService(wallet, billing, repository);
  const credit = (amount: number) =>
    repository.add({
      organizationId: ORG,
      amount,
      type: 'GRANT',
      description: 'test credit',
      idempotencyKey: `grant:${db.entries.length}`,
    });
  return {
    db,
    repository,
    wallet,
    billing,
    service,
    credit,
    setRows: (next: ChargePostRow[]) => {
      rows = next;
    },
    balance: () => repository.balance(ORG),
    spends: () => db.entries.filter((e) => e.type === 'SPEND'),
    refunds: () => db.entries.filter((e) => e.type === 'REFUND'),
    ready: async () => {
      await repository.ensureWallet(ORG);
      if (options.balance) {
        await credit(options.balance);
      }
    },
  };
};

const settle = (
  t: ReturnType<typeof setup>,
  reason: string = REFUND_REASONS.edited,
  extra: Record<string, any> = {}
) => t.service.settleGroups(ORG, ['g1'], { reason, ...extra });

describe('Charging posts when they are scheduled', () => {
  it('charges every part of a scheduled thread, each at its own price', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([
      post({ id: 'p1' }),
      post({ id: 'p2', parentPostId: 'p1', content: '<p>see example.com</p>' }),
    ]);
    await settle(t);
    expect(t.spends().map((e) => [e.chargeKey, e.amount])).toEqual([
      ['post:p1', -PLAIN],
      ['post:p2', -LINK],
    ]);
    expect(await t.balance()).toBe(10000 - PLAIN - LINK);
  });

  it('never charges a draft', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1', state: 'DRAFT' })]);
    await settle(t);
    expect(t.spends()).toHaveLength(0);
  });

  it('settling again charges nothing more (idempotent)', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    await settle(t);
    await settle(t);
    expect(t.spends()).toHaveLength(1);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('re-prices an edit up: refund the old part, charge the new price', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    t.setRows([post({ id: 'p1', content: '<p>now with example.com</p>' })]);
    await settle(t);
    expect(t.refunds()).toHaveLength(1);
    expect(t.refunds()[0].description).toBe(REFUND_REASONS.edited);
    expect(t.spends().map((e) => e.idempotencyKey)).toEqual([
      'post:p1#1',
      'post:p1#2',
    ]);
    expect(await t.balance()).toBe(10000 - LINK);
  });

  it('re-prices an edit down, giving back the difference', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1', content: '<p>example.com</p>' })]);
    await settle(t);
    t.setRows([post({ id: 'p1', content: '<p>plain</p>' })]);
    await settle(t);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('only needs the difference to be covered when editing', async () => {
    // Exactly enough for one link post; editing it to plain must work, and
    // then back to a link too (the plain charge is credited).
    const t = setup({ balance: LINK });
    await t.ready();
    t.setRows([post({ id: 'p1', content: '<p>example.com</p>' })]);
    await settle(t);
    expect(await t.balance()).toBe(0);
    t.setRows([post({ id: 'p1', content: '<p>plain</p>' })]);
    await settle(t);
    t.setRows([post({ id: 'p1', content: '<p>example.com again</p>' })]);
    await settle(t);
    expect(await t.balance()).toBe(0);
  });

  it('refunds a part removed from a thread by an edit', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' }), post({ id: 'p2', parentPostId: 'p1' })]);
    await settle(t);
    t.setRows([
      post({ id: 'p1' }),
      post({ id: 'p2', parentPostId: null, deletedAt: new Date() }),
    ]);
    await settle(t);
    expect(t.refunds().map((e) => e.reference)).toEqual(['p2']);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('refunds everything when the post is deleted', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' }), post({ id: 'p2', parentPostId: 'p1' })]);
    await settle(t);
    t.setRows([
      post({ id: 'p1', deletedAt: new Date() }),
      post({ id: 'p2', deletedAt: new Date() }),
    ]);
    await settle(t, REFUND_REASONS.deleted);
    expect(await t.balance()).toBe(10000);
    expect(
      t.refunds().every((e) => e.description === REFUND_REASONS.deleted)
    ).toBe(true);
  });

  it('refunds everything when it goes back to drafts, and charges again when re-scheduled', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    t.setRows([post({ id: 'p1', state: 'DRAFT' })]);
    await settle(t, REFUND_REASONS.draft);
    expect(await t.balance()).toBe(10000);
    // Put on the schedule (charged before the state changes).
    await settle(t, REFUND_REASONS.edited, { mainState: { g1: 'QUEUE' } });
    expect(await t.balance()).toBe(10000 - PLAIN);
    expect(t.spends().map((e) => e.idempotencyKey)).toEqual([
      'post:p1#1',
      'post:p1#2',
    ]);
  });

  it('a failed thread refunds only the parts that were not sent', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([
      post({ id: 'p1' }),
      post({ id: 'p2', parentPostId: 'p1' }),
      post({ id: 'p3', parentPostId: 'p2' }),
    ]);
    await settle(t);
    // p1 went out, then the thread failed (the workflow marks the first post
    // ERROR, whatever was sent).
    t.setRows([
      post({ id: 'p1', state: 'ERROR', releaseURL: 'https://x.com/1' }),
      post({ id: 'p2', parentPostId: 'p1' }),
      post({ id: 'p3', parentPostId: 'p2' }),
    ]);
    await settle(t, REFUND_REASONS.notSent);
    expect(
      t
        .refunds()
        .map((e) => e.reference)
        .sort()
    ).toEqual(['p2', 'p3']);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('refuses with a wallet 402 and writes nothing when the balance is short', async () => {
    const t = setup({ balance: 100 });
    await t.ready();
    t.setRows([post({ id: 'p1' }), post({ id: 'p2', parentPostId: 'p1' })]);
    const err = await settle(t).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(402);
    expect(err.getResponse()).toMatchObject({ wallet: true, url: '/wallet' });
    expect(t.spends()).toHaveLength(0);
    expect(await t.balance()).toBe(100);
  });

  it('checks the auto top-up threshold after every schedule charge', async () => {
    const t = setup({ balance: 100000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    expect(t.billing.autoTopUpFor).not.toHaveBeenCalled();
    expect(t.billing.autoTopUp).toHaveBeenCalledWith(ORG);
  });

  it('tops up automatically first when that covers it', async () => {
    const t = setup({ balance: 100, topUp: 100000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    expect(t.billing.autoTopUpFor).toHaveBeenCalledWith(ORG, PLAIN);
    expect(t.spends()).toHaveLength(1);
    expect(await t.balance()).toBe(100 + 100000 - PLAIN);
  });

  it('never refunds or re-charges a part that was already sent', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    t.setRows([
      post({ id: 'p1', state: 'PUBLISHED', releaseURL: 'https://x.com/1' }),
    ]);
    await settle(t, REFUND_REASONS.deleted);
    t.setRows([
      post({ id: 'p1', deletedAt: new Date(), releaseURL: 'https://x.com/1' }),
    ]);
    await settle(t, REFUND_REASONS.deleted);
    expect(t.refunds()).toHaveLength(0);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('charges a sent post again when it is put back on the schedule (fresh)', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    // Went out, then rescheduled: its release link is cleared.
    await settle(t, REFUND_REASONS.edited, { fresh: ['p1'] });
    expect(t.spends().map((e) => e.idempotencyKey)).toEqual([
      'post:p1#1',
      'post:p1#2',
    ]);
    expect(t.refunds()).toHaveLength(0);
    expect(await t.balance()).toBe(10000 - 2 * PLAIN);
  });

  it('does nothing for a workspace without a wallet', async () => {
    const t = setup();
    jest.spyOn(t.wallet, 'getWallet').mockResolvedValue(null);
    t.setRows([post({ id: 'p1' })]);
    expect(await settle(t)).toEqual([]);
    expect(t.repository.postsInGroups).not.toHaveBeenCalled();
  });

  it('refunds what is standing when the workspace no longer pays from its wallet', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    (t.wallet.paysFromWallet as jest.Mock).mockResolvedValue(false);
    await settle(t);
    expect(await t.balance()).toBe(10000);
  });
});

describe('Publishing after charging at schedule', () => {
  const publishCharge = (
    t: ReturnType<typeof setup>,
    id: string,
    run?: string
  ) =>
    t.wallet.charge({
      organizationId: ORG,
      actionKey: 'x.post',
      chargeKey: postOccurrenceChargeKey(id, run),
      reference: id,
    });

  it('reuses the schedule charge: no second charge, across Temporal retries', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    const first = await publishCharge(t, 'p1');
    const retry = await publishCharge(t, 'p1');
    expect(first.idempotencyKey).toBe('post:p1#1');
    expect(retry.idempotencyKey).toBe('post:p1#1');
    expect(t.spends()).toHaveLength(1);
  });

  it('charges a post queued before charging at schedule exactly once, when it publishes', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    await publishCharge(t, 'legacy');
    await publishCharge(t, 'legacy');
    expect(t.spends()).toHaveLength(1);
    expect(await t.balance()).toBe(10000 - PLAIN);
  });

  it('charges each repeat occurrence once, under its own run', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1', intervalInDays: 2 })]);
    await settle(t);
    const runA = repeatRunOf('post_p1_AbC123xyZ9');
    const runB = repeatRunOf('post_p1_QwErTy7890');
    await publishCharge(t, 'p1');
    await publishCharge(t, 'p1', runA);
    await publishCharge(t, 'p1', runA);
    await publishCharge(t, 'p1', runB);
    expect(t.spends().map((e) => e.chargeKey)).toEqual([
      'post:p1',
      'post:p1@AbC123xyZ9',
      'post:p1@QwErTy7890',
    ]);
    expect(await t.balance()).toBe(10000 - 3 * PLAIN);
  });

  it('tells the first run from a repeat by its workflow id', () => {
    expect(repeatRunOf('post_cmuabc123')).toBeUndefined();
    expect(repeatRunOf('post_cmuabc123_Zx9Yq8Wp7O')).toBe('Zx9Yq8Wp7O');
    expect(repeatRunOf(undefined)).toBeUndefined();
  });

  it('a failed publish refunds its charge, and the retry charges it again once', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([post({ id: 'p1' })]);
    await settle(t);
    const charge = await publishCharge(t, 'p1');
    await t.wallet.refund(charge.idempotencyKey!, REFUND_REASONS.notSent);
    // The workflow marks it ERROR: nothing else to refund.
    t.setRows([post({ id: 'p1', state: 'ERROR' })]);
    await settle(t, REFUND_REASONS.notSent);
    expect(t.refunds()).toHaveLength(1);
    expect(await t.balance()).toBe(10000);
    const again = await publishCharge(t, 'p1');
    expect(again.idempotencyKey).toBe('post:p1#2');
    expect(await t.balance()).toBe(10000 - PLAIN);
  });
});

describe('WalletPostsService.assertCanSchedule', () => {
  const plan = (over: Record<string, any> = {}) => ({
    identifier: 'x',
    values: [{ content: '<p>Hello</p>' }, { content: '<p>example.com</p>' }],
    scheduled: true as boolean | 'keep',
    ...over,
  });

  it('passes when the balance covers the new posts', async () => {
    const t = setup({ balance: PLAIN + LINK });
    await t.ready();
    await expect(t.service.assertCanSchedule(ORG, [plan()])).resolves.toBe(
      undefined
    );
  });

  it('refuses with a wallet 402 before anything is saved', async () => {
    const t = setup({ balance: PLAIN });
    await t.ready();
    const err = await t.service
      .assertCanSchedule(ORG, [plan()])
      .catch((e) => e);
    expect(err.getStatus()).toBe(402);
    expect(err.getResponse().wallet).toBe(true);
    expect(t.billing.autoTopUpFor).toHaveBeenCalledWith(ORG, PLAIN + LINK);
  });

  it('passes after an automatic top-up covers it', async () => {
    const t = setup({ balance: PLAIN, topUp: 100000 });
    await t.ready();
    await expect(t.service.assertCanSchedule(ORG, [plan()])).resolves.toBe(
      undefined
    );
  });

  it('never checks a draft', async () => {
    const t = setup({ balance: 0 });
    await t.service.assertCanSchedule(ORG, [plan({ scheduled: false })]);
    expect(t.billing.autoTopUpFor).not.toHaveBeenCalled();
  });

  it('counts what an edited group already paid', async () => {
    const t = setup({ balance: 10000 });
    await t.ready();
    t.setRows([
      post({ id: 'p1' }),
      post({ id: 'p2', parentPostId: 'p1', content: '<p>example.com</p>' }),
    ]);
    await settle(t);
    // Balance now 10000 - 3225 = 6775. Re-saving the same thread needs 0.
    await t.service.assertCanSchedule(ORG, [
      plan({
        group: 'g1',
        values: [
          { id: 'p1', content: '<p>Hello</p>' },
          { id: 'p2', content: '<p>example.com</p>' },
        ],
      }),
    ]);
    expect(t.billing.autoTopUpFor).not.toHaveBeenCalled();
  });

  it('for an update, follows the state the post already has', async () => {
    const t = setup({ balance: 0 });
    t.setRows([post({ id: 'p1', state: 'DRAFT' })]);
    await t.service.assertCanSchedule(ORG, [
      plan({ group: 'g1', scheduled: 'keep' }),
    ]);
    expect(t.billing.autoTopUpFor).not.toHaveBeenCalled();
  });
});
