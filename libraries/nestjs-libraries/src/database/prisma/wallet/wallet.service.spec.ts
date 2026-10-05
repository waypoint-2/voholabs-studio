import {
  BILLING,
  WalletService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';

// WalletService against a plain stub repository: settings and price rows in
// memory, no database.

const SETTINGS: Record<string, string> = {
  [BILLING.currency]: 'USD',
  [BILLING.creditsPerUnit]: '100',
  [BILLING.defaultMultiplierBp]: '15000',
  [BILLING.minTopUp]: '1000',
  [BILLING.topUpOptions]: '500,1000,2500,5000',
};

const row = (over: Record<string, any> = {}) => ({
  key: 'x.post',
  provider: 'x',
  category: 'channels',
  name: 'Post on X',
  description: null,
  unit: 'post',
  costMicros: 15000,
  costCurrency: 'USD',
  multiplierBp: null,
  fixedPrice: null,
  freeUnits: null,
  freePeriod: null,
  billing: 'PER_USE',
  requiresTopUp: true,
  active: true,
  ...over,
});

const ACTIONS = [
  row(),
  row({
    key: 'x.post_link',
    name: 'Post on X with a link',
    costMicros: 200000,
  }),
  row({
    key: 'x.post_read',
    name: 'Read a post',
    unit: 'read',
    costMicros: 5000,
  }),
  row({
    key: 'storage.gb',
    provider: 'storage',
    category: 'storage',
    unit: 'gb',
    billing: 'MONTHLY',
    fixedPrice: 5000,
    requiresTopUp: false,
  }),
];

const stubRepo = (
  over: Record<string, any> = {},
  settings: Record<string, string> = SETTINGS,
  actions: any[] = ACTIONS
) =>
  ({
    settings: jest.fn(async () =>
      Object.entries(settings).map(([key, value]) => ({ key, value }))
    ),
    actions: jest.fn(async () => actions),
    categories: jest.fn(async () => []),
    balance: jest.fn(async () => 0),
    getWallet: jest.fn(async () => null),
    autoTopUpSpentSince: jest.fn(async () => 0),
    scheduledPosts: jest.fn(async () => []),
    repeatingPosts: jest.fn(async () => []),
    postsInGroups: jest.fn(async () => []),
    standingCharges: jest.fn(async () => new Map()),
    spend: jest.fn(async (entry: any) => entry),
    usedUnits: jest.fn(async () => 0),
    updateWallet: jest.fn(async () => ({})),
    claimForecastNotice: jest.fn(async () => true),
    ...over,
  } as any);

const notifications = () =>
  ({ inAppNotification: jest.fn(async () => undefined) } as any);

describe('WalletService.priceOf', () => {
  const service = new WalletService(stubRepo(), notifications());

  it('uses fixedPrice as is when the row has one', async () => {
    expect(
      await service.priceOf(
        row({ fixedPrice: 5000, costMicros: 999999 }) as any
      )
    ).toBe(5000);
  });

  it('uses a fixedPrice of zero instead of the cost maths', async () => {
    expect(await service.priceOf(row({ fixedPrice: 0 }) as any)).toBe(0);
  });

  it('prices $0.015 at x1.5 and 100 credits per dollar at 2.25 credits (225)', async () => {
    expect(await service.priceOf(row({ costMicros: 15000 }) as any)).toBe(225);
  });

  it('prices $0.005 at 0.75 credits (75)', async () => {
    expect(await service.priceOf(row({ costMicros: 5000 }) as any)).toBe(75);
  });

  it('prices $0.20 at 30.00 credits (3000)', async () => {
    expect(await service.priceOf(row({ costMicros: 200000 }) as any)).toBe(
      3000
    );
  });

  it('rounds up to the next 0.01 credit', async () => {
    // $0.000001 x 1.5 x 100 x 100 = 0.015 units -> 1
    expect(await service.priceOf(row({ costMicros: 1 }) as any)).toBe(1);
    // $0.0151 -> 226.5 -> 227
    expect(await service.priceOf(row({ costMicros: 15100 }) as any)).toBe(227);
  });

  it('uses the row multiplier over the default one', async () => {
    expect(
      await service.priceOf(
        row({ costMicros: 15000, multiplierBp: 20000 }) as any
      )
    ).toBe(300);
  });

  it('treats a cost in the wallet currency as fx 1, in any letter case', async () => {
    expect(
      await service.priceOf(
        row({ costCurrency: 'usd', costMicros: 15000 }) as any
      )
    ).toBe(225);
  });

  it('converts a foreign cost with its fx setting', async () => {
    const fx = new WalletService(
      stubRepo({}, { ...SETTINGS, 'fx.EUR': '0.8' }),
      notifications()
    );
    expect(
      await fx.priceOf(row({ costCurrency: 'EUR', costMicros: 15000 }) as any)
    ).toBe(180);
  });

  it('throws when a foreign cost has no exchange rate', async () => {
    await expect(
      service.priceOf(row({ costCurrency: 'GBP' }) as any)
    ).rejects.toThrow('No exchange rate for GBP');
  });

  it('throws when a setting the maths needs is missing', async () => {
    const { [BILLING.defaultMultiplierBp]: _, ...rest } = SETTINGS;
    const missing = new WalletService(stubRepo({}, rest), notifications());
    await expect(missing.priceOf(row() as any)).rejects.toThrow(
      `Billing setting ${BILLING.defaultMultiplierBp} is not configured`
    );
  });
});

describe('WalletService.price and charge', () => {
  it('returns undefined for an unknown or inactive action', async () => {
    const service = new WalletService(
      stubRepo({}, SETTINGS, [
        ...ACTIONS,
        row({ key: 'x.old', active: false }),
      ]),
      notifications()
    );
    expect(await service.price('nope')).toBeUndefined();
    expect(await service.price('x.old')).toBeUndefined();
    expect((await service.price('x.post'))?.price).toBe(225);
  });

  it('refuses to charge an action that has no price', async () => {
    const repo = stubRepo();
    const service = new WalletService(repo, notifications());
    await expect(
      service.charge({ organizationId: 'o', actionKey: 'nope', chargeKey: 'k' })
    ).rejects.toThrow('No price for nope');
    expect(repo.spend).not.toHaveBeenCalled();
  });

  it('charges price x quantity with the unit price and passes allowNegative on', async () => {
    const repo = stubRepo();
    const service = new WalletService(repo, notifications());
    await service.charge({
      organizationId: 'o',
      actionKey: 'x.post_read',
      chargeKey: 'reads:1',
      quantity: 4,
      allowNegative: true,
    });
    expect(repo.spend).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        unitPrice: 75,
        quantity: 4,
        type: 'SPEND',
        chargeKey: 'reads:1',
        allowNegative: true,
        description: 'Read a post',
      })
    );
  });

  it('caches settings and price rows between calls', async () => {
    const repo = stubRepo();
    const service = new WalletService(repo, notifications());
    await service.price('x.post');
    await service.price('x.post_link');
    expect(repo.settings).toHaveBeenCalledTimes(1);
    expect(repo.actions).toHaveBeenCalledTimes(1);
  });
});

describe('WalletService.topUpRules', () => {
  it('drops suggested amounts below the minimum', async () => {
    const service = new WalletService(stubRepo(), notifications());
    expect(await service.topUpRules()).toEqual({
      minAmount: 1000,
      options: [1000, 2500, 5000],
      creditsPerUnit: 100,
      autoOptions: [],
      capOptions: [],
      defaultThreshold: null,
    });
  });

  it('reads the auto top-up choices from the settings', async () => {
    const service = new WalletService(
      stubRepo({}, {
        ...SETTINGS,
        [BILLING.autoTopUpOptions]: '500,1000,2000',
        [BILLING.autoTopUpCapOptions]: '0,5000,10000',
        [BILLING.autoTopUpThreshold]: '500',
      }),
      notifications()
    );
    expect(await service.topUpRules()).toEqual(
      expect.objectContaining({
        autoOptions: [1000, 2000],
        capOptions: [5000, 10000],
        defaultThreshold: 500,
      })
    );
  });
});

describe('WalletService.forecast and estimate', () => {
  const posts = [
    {
      id: 'p1',
      content: '<p>Hello there</p>',
      publishDate: new Date('2026-10-04T10:00:00Z'),
      integration: { providerIdentifier: 'x' },
    },
    {
      id: 'p2',
      content: '<p>Read example.com today</p>',
      publishDate: new Date('2026-10-04T12:00:00Z'),
      integration: { providerIdentifier: 'x' },
    },
  ];

  const build = (wallet: any = null, balance = 1000, over: any = {}) => {
    const repo = stubRepo({
      balance: jest.fn(async () => balance),
      getWallet: jest.fn(async () => wallet),
      scheduledPosts: jest.fn(async () => posts),
      ...over,
    });
    const service = new WalletService(repo, notifications());
    jest.spyOn(service, 'paysFromWallet').mockResolvedValue(true);
    return { service, repo };
  };

  const autoWallet = (over: any = {}) => ({
    autoTopUp: true,
    frozenAt: null,
    paymentMethodId: 'pm_1',
    autoTopUpAmount: 1000,
    autoTopUpMonthlyCap: null,
    ...over,
  });

  afterEach(() => {
    delete process.env.STRIP_LINKS_FROM_X_POSTS;
  });

  it('is empty for a workspace that does not pay from its wallet', async () => {
    const { service, repo } = build();
    (service.paysFromWallet as jest.Mock).mockResolvedValue(false);
    expect(await service.forecast('o')).toEqual({
      windowHours: 48,
      needed: 0,
      short: false,
      items: [],
    });
    expect(repo.scheduledPosts).not.toHaveBeenCalled();
  });

  it('prices each scheduled post not paid yet, a bare domain at the link rate', async () => {
    const { service } = build();
    const forecast = await service.forecast('o');
    expect(forecast.items.map((i) => i.actionKey)).toEqual([
      'x.post',
      'x.post_link',
    ]);
    expect(forecast.items[1].postId).toBe('p2');
    expect(forecast.needed).toBe(3225);
    expect(forecast.short).toBe(true);
  });

  it('is not short when auto top-up has no monthly limit', async () => {
    const { service } = build(autoWallet());
    expect(await service.autoTopUpHeadroom('o')).toBe(Infinity);
    expect((await service.forecast('o')).short).toBe(false);
  });

  it('counts only whole auto top-ups left under the monthly limit', async () => {
    const { service } = build(autoWallet({ autoTopUpMonthlyCap: 2500 }), 1000, {
      autoTopUpSpentSince: jest.fn(async () => 2000),
    });
    // 500 cents left under the cap, less than one 1000-cent top-up.
    expect(await service.autoTopUpHeadroom('o')).toBe(0);
    expect((await service.forecast('o')).short).toBe(true);
  });

  it('gives no headroom when the wallet is frozen or has no card', async () => {
    expect(
      await build(
        autoWallet({ frozenAt: new Date() })
      ).service.autoTopUpHeadroom('o')
    ).toBe(0);
    expect(
      await build(
        autoWallet({ paymentMethodId: null })
      ).service.autoTopUpHeadroom('o')
    ).toBe(0);
  });

  it('prices a post whose link is stripped before sending as a plain post', async () => {
    process.env.STRIP_LINKS_FROM_X_POSTS = 'true';
    const { service } = build(null, 1000, {
      scheduledPosts: jest.fn(async () => [
        { ...posts[0], content: '<p>See https://example.com/a</p>' },
      ]),
    });
    expect((await service.forecast('o')).items[0].actionKey).toBe('x.post');
  });

  it('leaves out scheduled posts already paid for when they were scheduled', async () => {
    const { service } = build(null, 1000, {
      standingCharges: jest.fn(
        async () => new Map([['post:p2', { amount: -3000 }]])
      ),
    });
    const forecast = await service.forecast('o');
    expect(forecast.items.map((i) => i.postId)).toEqual(['p1']);
    expect(forecast.needed).toBe(225);
    expect(forecast.short).toBe(false);
  });

  it('adds the next occurrence of a repeating post when it falls in the window', async () => {
    const now = Date.now();
    const { service } = build(null, 0, {
      scheduledPosts: jest.fn(async () => []),
      repeatingPosts: jest.fn(async () => [
        {
          id: 'r1',
          group: 'g1',
          parentPostId: null,
          state: 'PUBLISHED',
          content: '<p>Daily</p>',
          // First went out 23 hours ago, repeats daily: next in 1 hour.
          publishDate: new Date(now - 23 * 3600_000),
          intervalInDays: 1,
          integration: { providerIdentifier: 'x' },
        },
        {
          id: 'r2',
          group: 'g2',
          parentPostId: null,
          state: 'PUBLISHED',
          content: '<p>Weekly</p>',
          // Next one in 6 days: outside the 48 hours.
          publishDate: new Date(now - 24 * 3600_000),
          intervalInDays: 7,
          integration: { providerIdentifier: 'x' },
        },
      ]),
    });
    const forecast = await service.forecast('o');
    expect(forecast.items.map((i) => i.postId)).toEqual(['r1']);
    expect(forecast.needed).toBe(225);
    expect(forecast.short).toBe(true);
  });

  it('estimate reports the price and the balance after it; scheduled posts are already paid', async () => {
    const { service } = build(null, 3500);
    expect(await service.estimate('o', 'x.post', 2)).toEqual({
      price: 450,
      balanceAfter: 3050,
      short: false,
    });
  });

  it('estimate is undefined for an action without a price', async () => {
    const { service } = build();
    expect(await service.estimate('o', 'nope')).toBeUndefined();
  });
});

describe('WalletService free allowance in charge', () => {
  const FREE_ACTIONS = [
    ...ACTIONS.filter((a) => a.key !== 'storage.gb'),
    row({
      key: 'brief.onboarding',
      provider: 'brief',
      category: 'brief',
      fixedPrice: 25000,
      freeUnits: 1,
      freePeriod: 'ONCE',
    }),
    row({
      key: 'x.user_lookup',
      costMicros: 10000,
      freeUnits: 5,
      freePeriod: 'MONTH',
    }),
    row({
      key: 'storage.gb',
      provider: 'storage',
      category: 'storage',
      unit: 'gb',
      billing: 'MONTHLY',
      fixedPrice: 5000,
      freeUnits: 2,
      freePeriod: 'MONTH',
      requiresTopUp: false,
    }),
  ];

  const charge = async (actionKey: string) => {
    const repo = stubRepo({}, SETTINGS, FREE_ACTIONS);
    const service = new WalletService(repo, notifications());
    await service.charge({ organizationId: 'o', actionKey, chargeKey: 'k' });
    return repo.spend.mock.calls[0][0];
  };

  it('passes a ONCE allowance with no start date', async () => {
    expect((await charge('brief.onboarding')).free).toEqual({ units: 1 });
  });

  it('passes a MONTH allowance counted from the start of the UTC month', async () => {
    const { free } = await charge('x.user_lookup');
    const now = new Date();
    expect(free).toEqual({
      units: 5,
      since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    });
  });

  it('gives MONTHLY rows (storage) no free units: storage applies its own', async () => {
    const entry = await charge('storage.gb');
    expect(entry.free).toBeUndefined();
    expect(entry.amount).toBe(5000);
  });

  it('gives a PER_USE row without free units no allowance', async () => {
    expect((await charge('x.post')).free).toBeUndefined();
  });

  it('freeUnitsRemaining counts what the ledger has used', async () => {
    const repo = stubRepo(
      { usedUnits: jest.fn(async () => 3) },
      SETTINGS,
      FREE_ACTIONS
    );
    const service = new WalletService(repo, notifications());
    expect(await service.freeUnitsRemaining('o', 'x.user_lookup')).toBe(2);
    expect(await service.freeUnitsRemaining('o', 'x.post')).toBeNull();
    expect(await service.freeUnitsRemaining('o', 'storage.gb')).toBeNull();
  });
});

describe('WalletService whole top-up amounts', () => {
  const service = new WalletService(stubRepo(), notifications());

  it('accepts whole dollars only (amounts in cents)', async () => {
    expect(await service.minorPerUnit()).toBe(100);
    expect(await service.isWholeAmount(2500)).toBe(true);
    expect(await service.isWholeAmount(2550)).toBe(false);
    expect(await service.isWholeAmount(25.5)).toBe(false);
  });

  it('follows the currency: yen has no minor unit', async () => {
    const yen = new WalletService(
      stubRepo({}, { ...SETTINGS, wallet_currency: 'JPY' }),
      notifications()
    );
    expect(await yen.isWholeAmount(1001)).toBe(true);
  });
});

describe('WalletService.postActionKey', () => {
  const service = new WalletService(stubRepo(), notifications());

  afterEach(() => {
    delete process.env.STRIP_LINKS_FROM_X_POSTS;
  });

  it('prices a bare domain in saved HTML at the link rate', async () => {
    expect(
      await service.postActionKey('x', '<p>Read example.com today</p>')
    ).toBe('x.post_link');
  });

  it('counts a (post:<id>) reference as a link', async () => {
    expect(
      await service.postActionKey('x', '<p>Follow-up to (post:abc-123)</p>')
    ).toBe('x.post_link');
  });

  it('prices plain text as a plain post, on any X identifier', async () => {
    expect(await service.postActionKey('X-Premium', '<p>Hello</p>')).toBe(
      'x.post'
    );
  });

  it('strips links of unsent X content when STRIP_LINKS_FROM_X_POSTS is set', async () => {
    process.env.STRIP_LINKS_FROM_X_POSTS = 'true';
    expect(
      await service.postActionKey('x', '<p>See https://example.com/a</p>')
    ).toBe('x.post');
  });

  it('reads sent text as is, without stripping again', async () => {
    process.env.STRIP_LINKS_FROM_X_POSTS = 'true';
    expect(
      await service.postActionKey('x', 'See https://example.com/a', {
        sent: true,
      })
    ).toBe('x.post_link');
  });

  it('falls back to <provider>.post when no link row is priced', async () => {
    const plain = new WalletService(
      stubRepo({}, SETTINGS, [row({ key: 'y.post', provider: 'y' })]),
      notifications()
    );
    expect(await plain.postActionKey('y', 'example.com')).toBe('y.post');
  });
});

describe('WalletService.estimateContents', () => {
  const build = (wallet: any = null, balance = 1000, over: any = {}) => {
    const repo = stubRepo({
      balance: jest.fn(async () => balance),
      getWallet: jest.fn(async () => wallet),
      ...over,
    });
    const service = new WalletService(repo, notifications());
    jest.spyOn(service, 'paysFromWallet').mockResolvedValue(true);
    return { service, repo };
  };

  const autoWallet = (over: any = {}) => ({
    autoTopUp: true,
    frozenAt: null,
    paymentMethodId: 'pm_1',
    autoTopUpAmount: 1000,
    autoTopUpMonthlyCap: null,
    ...over,
  });

  it('prices each post and reply with the link rule', async () => {
    const { service } = build(null, 10000);
    const estimate = await service.estimateContents('o', 'x', [
      '<p>Hello</p>',
      '<p>Read example.com</p>',
      '<p>Then (post:p1)</p>',
    ]);
    expect(estimate.items).toEqual([
      { actionKey: 'x.post', price: 225 },
      { actionKey: 'x.post_link', price: 3000 },
      { actionKey: 'x.post_link', price: 3000 },
    ]);
    expect(estimate.price).toBe(6225);
    expect(estimate.balanceAfter).toBe(3775);
    expect(estimate.short).toBe(false);
    expect(estimate.autoCovers).toBe(false);
    expect(estimate.autoAmount).toBeNull();
  });

  it('gives no items for a channel the wallet does not charge', async () => {
    const { service } = build();
    const estimate = await service.estimateContents('linkedin', 'linkedin', [
      'example.com',
    ]);
    expect(estimate.items).toEqual([]);
    expect(estimate.price).toBe(0);
    expect(estimate.short).toBe(false);
  });

  it('is short only when the balance does not cover this post (scheduled ones are paid)', async () => {
    const { service } = build(null, 3000, {
      scheduledPosts: jest.fn(async () => [
        {
          id: 'p1',
          content: '<p>Hello</p>',
          publishDate: new Date(),
          integration: { providerIdentifier: 'x' },
        },
      ]),
    });
    expect(
      (await service.estimateContents('o', 'x', ['go example.com'])).short
    ).toBe(false);
    expect(
      (await service.estimateContents('o', 'x', ['a.com', 'b.com'])).short
    ).toBe(true);
  });

  it('charges only the difference when editing a scheduled post', async () => {
    const { service, repo } = build(null, 100, {
      postsInGroups: jest.fn(async () => [
        { id: 'p1', releaseURL: null, releaseId: null },
        { id: 'p2', releaseURL: null, releaseId: null },
      ]),
      standingCharges: jest.fn(
        async () =>
          new Map([
            ['post:p1', { amount: -3000 }],
            ['post:p2', { amount: -225 }],
          ])
      ),
    });
    // Now: one link post (3000) and one plain (225), both already paid.
    const same = await service.estimateContents(
      'o',
      'x',
      ['example.com', 'hello'],
      { group: 'g1' }
    );
    expect(same.price).toBe(3225);
    expect(same.alreadyPaid).toBe(3225);
    expect(same.due).toBe(0);
    expect(same.balanceAfter).toBe(100);
    expect(same.short).toBe(false);
    expect(repo.postsInGroups).toHaveBeenCalledWith('o', ['g1']);

    // Dropping the link: 3000 comes back.
    const down = await service.estimateContents('o', 'x', ['hi', 'hello'], {
      group: 'g1',
    });
    expect(down.due).toBe(450 - 3225);
    expect(down.balanceAfter).toBe(100 + 3225 - 450);
  });

  it('prices a repeating post per occurrence', async () => {
    const { service } = build(null, 10000);
    const estimate = await service.estimateContents(
      'o',
      'x',
      Array.from({ length: 30 }, () => 'google.com'),
      { inter: 2 }
    );
    // 30 parts with a link, once: the repeat does not multiply it.
    expect(estimate.price).toBe(90000);
    expect(estimate.perOccurrence).toBe(true);
    expect(estimate.repeatEveryDays).toBe(2);
  });

  it('is covered by auto top-up when its headroom is enough, with the amount charged', async () => {
    const { service } = build(autoWallet(), 1000);
    const estimate = await service.estimateContents('o', 'x', [
      'example.com',
    ]);
    expect(estimate.short).toBe(false);
    expect(estimate.autoCovers).toBe(true);
    // One 1000-cent top-up adds 100000 units, enough for the 2000 missing.
    expect(estimate.autoAmount).toBe(1000);
  });

  it('counts as many top-ups as needed', async () => {
    const { service } = build(autoWallet({ autoTopUpAmount: 10 }), 1000);
    // Each top-up adds 1000 units; 2000 missing needs two.
    const estimate = await service.estimateContents('o', 'x', [
      'example.com',
    ]);
    expect(estimate.autoCovers).toBe(true);
    expect(estimate.autoAmount).toBe(20);
  });

  it('is short when the monthly limit leaves no whole top-up', async () => {
    const { service } = build(
      autoWallet({ autoTopUpMonthlyCap: 2500 }),
      1000,
      { autoTopUpSpentSince: jest.fn(async () => 2000) }
    );
    const estimate = await service.estimateContents('o', 'x', [
      'example.com',
    ]);
    expect(estimate.short).toBe(true);
    expect(estimate.autoCovers).toBe(false);
    expect(estimate.autoAmount).toBeNull();
  });

  it('prices units still in a free allowance at 0', async () => {
    const repo = stubRepo(
      { balance: jest.fn(async () => 0) },
      SETTINGS,
      [row({ freeUnits: 1, freePeriod: 'ONCE' })]
    );
    const service = new WalletService(repo, notifications());
    jest.spyOn(service, 'paysFromWallet').mockResolvedValue(true);
    const estimate = await service.estimateContents('o', 'x', ['a', 'b']);
    expect(estimate.items).toEqual([
      { actionKey: 'x.post', price: 0 },
      { actionKey: 'x.post', price: 225 },
    ]);
    expect(repo.usedUnits).toHaveBeenCalledTimes(1);
  });
});

describe('WalletService.notifyIfShort', () => {
  const short = { windowHours: 48, needed: 3225, short: true, items: [] };

  const build = (wallet: any = {}, claimed = true) => {
    const repo = stubRepo({
      getWallet: jest.fn(async () => wallet),
      balance: jest.fn(async () => 100),
      claimForecastNotice: jest.fn(async () => claimed),
    });
    const notes = notifications();
    return { service: new WalletService(repo, notes), repo, notes };
  };

  it('sends one in-app notice with the amounts', async () => {
    const { service, repo, notes } = build({ forecastNotifiedAt: null });
    expect(await service.notifyIfShort('o', short)).toBe(true);
    expect(notes.inAppNotification).toHaveBeenCalledTimes(1);
    expect(notes.inAppNotification.mock.calls[0][2]).toContain('32.25');
    const now = new Date();
    expect(repo.claimForecastNotice).toHaveBeenCalledWith(
      'o',
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      )
    );
  });

  it('does nothing when the forecast is covered', async () => {
    const { service, notes } = build();
    expect(
      await service.notifyIfShort('o', { ...short, short: false })
    ).toBe(false);
    expect(notes.inAppNotification).not.toHaveBeenCalled();
  });

  it('sends nothing twice on the same UTC day', async () => {
    const { service, repo, notes } = build({ forecastNotifiedAt: new Date() });
    expect(await service.notifyIfShort('o', short)).toBe(false);
    expect(repo.claimForecastNotice).not.toHaveBeenCalled();
    expect(notes.inAppNotification).not.toHaveBeenCalled();
  });

  it('notifies again on a new day', async () => {
    const { service, notes } = build({
      forecastNotifiedAt: new Date(Date.now() - 86_400_000 * 2),
    });
    expect(await service.notifyIfShort('o', short)).toBe(true);
    expect(notes.inAppNotification).toHaveBeenCalledTimes(1);
  });

  it('leaves the notice to whoever claimed the day first', async () => {
    const { service, notes } = build({ forecastNotifiedAt: null }, false);
    expect(await service.notifyIfShort('o', short)).toBe(false);
    expect(notes.inAppNotification).not.toHaveBeenCalled();
  });
});

describe('WalletService.unfreeze and locked messages', () => {
  it('clears frozenAt on a frozen wallet', async () => {
    const repo = stubRepo({
      getWallet: jest.fn(async () => ({ frozenAt: new Date() })),
    });
    const service = new WalletService(repo, notifications());
    expect(await service.unfreeze('o')).toEqual({ wasFrozen: true });
    expect(repo.updateWallet).toHaveBeenCalledWith('o', { frozenAt: null });
  });

  it('changes nothing on a wallet that is not frozen', async () => {
    const repo = stubRepo({
      getWallet: jest.fn(async () => ({ frozenAt: null })),
    });
    const service = new WalletService(repo, notifications());
    expect(await service.unfreeze('o')).toEqual({ wasFrozen: false });
    expect(repo.updateWallet).not.toHaveBeenCalled();
  });

  it('is undefined for an organization without a wallet', async () => {
    const service = new WalletService(stubRepo(), notifications());
    expect(await service.unfreeze('o')).toBeUndefined();
  });

  it('says the wallet is on hold, a top-up is needed, or only a plan opens it', async () => {
    const frozen = new WalletService(
      stubRepo({ getWallet: jest.fn(async () => ({ frozenAt: new Date() })) }),
      notifications()
    );
    const open = new WalletService(stubRepo(), notifications());
    expect(await frozen.lockedProviderMessageFor('o', 'x')).toContain(
      'on hold'
    );
    expect(await open.lockedProviderMessageFor('o', 'x')).toContain(
      'Top up your wallet'
    );
    expect(await open.lockedProviderMessageFor('o', 'linkedin')).toBe(
      'X is temporarily unavailable on the free plan.'
    );
  });
});
