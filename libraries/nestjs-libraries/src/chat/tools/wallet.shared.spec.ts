jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import {
  addPendingWalletPost,
  creditsText,
  freeAllowance,
  PendingWalletPosts,
  postActionKey,
  postCost,
  pricingModel,
  toCredits,
  walletErrorKind,
  walletErrorText,
  walletForecast,
  walletWarning,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import {
  textHasLink,
  xPostActionKey,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.x';
import {
  notEnoughCreditsMessage,
  walletFrozenMessage,
  WalletService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';

describe('xPostActionKey (X link rule)', () => {
  it('charges a bare domain at the link rate', () => {
    expect(xPostActionKey('read more at example.com')).toBe('x.post_link');
  });

  it('charges a full URL at the link rate', () => {
    expect(xPostActionKey('https://a.com')).toBe('x.post_link');
  });

  it('charges plain text as a plain post', () => {
    expect(xPostActionKey('just some words, no links here.')).toBe('x.post');
  });

  it('charges an empty or missing text as a plain post', () => {
    expect(xPostActionKey('')).toBe('x.post');
    expect(xPostActionKey(undefined as any)).toBe('x.post');
  });
});

describe('textHasLink (the one link rule)', () => {
  it('sees a full URL and a bare domain', () => {
    expect(textHasLink('Visit https://a.com')).toBe(true);
    expect(textHasLink('Read example.com today')).toBe(true);
  });

  it('counts a (post:<id>) reference as a link, since it becomes one at publish', () => {
    expect(textHasLink('Follow-up to (post:abc-123_x)')).toBe(true);
  });

  it('is false for plain text and empty content', () => {
    expect(textHasLink('Hello there.')).toBe(false);
    expect(textHasLink('')).toBe(false);
    expect(textHasLink(undefined as any)).toBe(false);
  });
});

describe('postActionKey and postCost', () => {
  // The real link rule on a WalletService whose price rows are stubbed.
  const wallet = (prices: Record<string, number>) => {
    const service = new WalletService({} as any, {} as any);
    jest
      .spyOn(service, 'price')
      .mockImplementation(async (key: string) =>
        key in prices ? ({ price: prices[key] } as any) : undefined
      );
    return service;
  };

  it('reads saved content (HTML, unsent)', async () => {
    const w = wallet({ 'x.post': 225, 'x.post_link': 3000 });
    expect(await postActionKey(w, 'x', '<p>Read example.com</p>')).toBe(
      'x.post_link'
    );
    expect(await postActionKey(w, 'x', '<p>Hello</p>')).toBe('x.post');
  });

  it('adds up every tweet of a thread at its own rate', async () => {
    const w = wallet({ 'x.post': 225, 'x.post_link': 3000 });
    expect(
      await postCost(w, 'x', [
        '<p>one</p>',
        '<p>two example.com</p>',
        '<p>three (post:p1)</p>',
      ])
    ).toBe(6225);
  });

  it('uses the provider part of a channel identifier', async () => {
    const w = wallet({ 'x.post': 225 });
    expect(await postCost(w, 'X-Premium', ['<p>hi</p>'])).toBe(225);
  });

  it('is undefined when a price row is missing, never a guess', async () => {
    const w = wallet({ 'x.post_link': 3000 });
    expect(
      await postCost(w, 'x', ['<p>go a.com</p>', '<p>hi</p>'])
    ).toBeUndefined();
  });
});

describe('walletForecast', () => {
  it('is undefined when the forecast throws', async () => {
    const wallet = {
      forecast: jest.fn(async () => {
        throw new Error('db down');
      }),
    } as any;
    expect(await walletForecast(wallet, 'o')).toBeUndefined();
  });

  it('keeps the window, needed and short', async () => {
    const wallet = {
      forecast: jest.fn(async () => ({
        windowHours: 48,
        needed: 450,
        short: true,
        items: [],
      })),
    } as any;
    expect(await walletForecast(wallet, 'o')).toEqual({
      windowHours: 48,
      needed: 450,
      short: true,
    });
  });
});

describe('walletWarning', () => {
  it('warns when any channel estimate is short, before anything is queued', async () => {
    const wallet = {
      estimateContents: jest.fn(async (_o: string, provider: string) => ({
        short: provider === 'x',
      })),
    } as any;
    const pending: PendingWalletPosts = new Map();
    addPendingWalletPost(pending, 'X-Premium', ['a', 'b'], 450);
    expect(await walletWarning(wallet, 'o', pending)).toContain(
      'Not enough credits yet'
    );
    expect(wallet.estimateContents).toHaveBeenCalledWith('o', 'x', ['a', 'b']);
  });

  it('is undefined when covered, when nothing is pending, or when it fails', async () => {
    const covered = {
      estimateContents: jest.fn(async () => ({ short: false })),
    } as any;
    const failing = {
      estimateContents: jest.fn(async () => {
        throw new Error('db down');
      }),
    } as any;
    const pending: PendingWalletPosts = new Map();
    expect(await walletWarning(covered, 'o', pending)).toBeUndefined();
    addPendingWalletPost(pending, 'x', ['a'], 225);
    expect(await walletWarning(covered, 'o', pending)).toBeUndefined();
    expect(await walletWarning(failing, 'o', pending)).toBeUndefined();
  });
});

describe('walletErrorKind', () => {
  it('prefers the server errorKind', () => {
    expect(walletErrorKind('Not enough credits', null)).toBeNull();
    expect(walletErrorKind('anything', 'wallet')).toBe('wallet');
  });

  it('reads the error text when there is no errorKind', () => {
    expect(walletErrorKind(notEnoughCreditsMessage())).toBe('wallet');
    expect(walletErrorKind(walletFrozenMessage())).toBe('wallet');
    expect(walletErrorKind('Rate limited')).toBeNull();
    expect(walletErrorKind(null)).toBeNull();
  });
});

describe('credit and price text', () => {
  const action = (over: Record<string, any> = {}) =>
    ({
      key: 'k',
      provider: 'p',
      category: null,
      name: 'n',
      description: null,
      unit: 'post',
      freeUnits: null,
      freePeriod: null,
      billing: 'PER_USE',
      requiresTopUp: false,
      price: 225,
      ...over,
    } as any);

  it('formats hundredths as credits', () => {
    expect(toCredits(225)).toBe(2.25);
    expect(creditsText(225)).toBe('2.25 credits');
    expect(creditsText(5000)).toBe('50.00 credits');
  });

  it('names the pricing model from the billing field', () => {
    expect(pricingModel(action())).toBe('per post');
    expect(pricingModel(action({ billing: 'MONTHLY', unit: 'gb' }))).toBe(
      'per GB / month'
    );
    expect(pricingModel(action({ billing: 'UNLOCK' }))).toBe('Free');
  });

  it('describes the free allowance from the row', () => {
    expect(freeAllowance(action())).toBe('None');
    expect(
      freeAllowance(
        action({ freeUnits: 1, freePeriod: 'ONCE', requiresTopUp: true })
      )
    ).toBe('First time free, unlocks after first top up');
    expect(
      freeAllowance(action({ freeUnits: 2, freePeriod: 'MONTH', unit: 'gb' }))
    ).toBe('2 GB free each month');
    expect(freeAllowance(action({ billing: 'UNLOCK' }))).toBe('Unlimited use');
  });
});

describe('walletErrorText', () => {
  const failure = (message: string) =>
    JSON.stringify({
      cause: { failure: { message, stackTrace: `ApplicationFailure: ${message}` } },
    });

  it('gives the plain wallet message for a serialized wallet failure', () => {
    expect(walletErrorText(failure(notEnoughCreditsMessage()), 'wallet')).toBe(
      notEnoughCreditsMessage()
    );
    expect(walletErrorText(failure(walletFrozenMessage()), 'wallet')).toBe(
      walletFrozenMessage()
    );
  });

  it('keeps any other error as stored', () => {
    const other = failure('Rate limited');
    expect(walletErrorText(other, null)).toBe(other);
    expect(walletErrorText(null, null)).toBeNull();
  });
});
