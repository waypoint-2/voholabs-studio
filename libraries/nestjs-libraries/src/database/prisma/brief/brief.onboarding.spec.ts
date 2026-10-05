jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert',
  () => ({ walletAlert: jest.fn(async () => undefined) })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import { createHmac } from 'crypto';
import { HttpException } from '@nestjs/common';
import {
  BriefOnboardingService,
  briefOnboardingChargeKey,
} from '@gitroom/nestjs-libraries/database/prisma/brief/brief.onboarding.service';
import { InsufficientCreditsError } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.repository';

// BriefOnboardingService with an in-memory repository and stub wallet.

const SECRET = 'x'.repeat(40);
const ORG = 'org-1';
const USER = { email: 'a@b.com', name: 'Ann' };
const PRICE = 100;

const build = (
  opts: { pays?: boolean; free?: number | null; balance?: number } = {}
) => {
  const rows: any[] = [];
  let next = 1;
  const repository = {
    create: jest.fn(async (organizationId: string, lang?: string) => {
      const row = {
        id: `run-${next++}`,
        organizationId,
        lang: lang || null,
        status: 'RUNNING',
        chargeKey: null,
        error: null,
        createdAt: new Date(),
        finishedAt: null,
      };
      rows.push(row);
      return row;
    }),
    getById: jest.fn(
      async (id: string) => rows.find((r) => r.id === id) || null
    ),
    running: jest.fn(
      async (org: string) =>
        rows.find((r) => r.organizationId === org && r.status === 'RUNNING') ||
        null
    ),
    last: jest.fn(
      async (org: string) =>
        [...rows]
          .reverse()
          .find((r) => r.organizationId === org && r.status !== 'RUNNING') ||
        null
    ),
    staleRunning: jest.fn(async (org: string, before: Date) =>
      rows.filter(
        (r) =>
          r.organizationId === org &&
          r.status === 'RUNNING' &&
          r.createdAt < before
      )
    ),
    update: jest.fn(async (id: string, data: any) => {
      const row = rows.find((r) => r.id === id);
      Object.assign(row, data);
      return row;
    }),
  } as any;
  // A tiny ledger: free runs left, a balance, and the charges by key.
  const ledger = {
    free: opts.free === undefined ? 1 : opts.free,
    balance: opts.balance ?? 0,
    charges: new Map<string, { amount: number; free: boolean }>(),
  };
  const pays = { value: opts.pays ?? true };
  const wallet = {
    paysFromWallet: jest.fn(async () => pays.value),
    freeUnitsRemaining: jest.fn(async () => ledger.free),
    price: jest.fn(async () => ({ price: PRICE, action: {} })),
    balance: jest.fn(async () => ledger.balance),
    refund: jest.fn(async (key: string) => {
      const charge = ledger.charges.get(key);
      if (!charge) return undefined;
      ledger.charges.delete(key);
      if (charge.free) ledger.free = (ledger.free || 0) + 1;
      else ledger.balance += charge.amount;
      return {};
    }),
  } as any;
  const billing = {
    charge: jest.fn(async (params: any) => {
      if (!ledger.charges.has(params.chargeKey)) {
        if (ledger.free) {
          ledger.free -= 1;
          ledger.charges.set(params.chargeKey, { amount: 0, free: true });
        } else {
          if (ledger.balance < PRICE && !params.allowNegative) {
            throw new InsufficientCreditsError(PRICE, ledger.balance);
          }
          ledger.balance -= PRICE;
          ledger.charges.set(params.chargeKey, { amount: PRICE, free: false });
        }
      }
      return { idempotencyKey: params.chargeKey };
    }),
  } as any;
  const service = new BriefOnboardingService(repository, wallet, billing);
  return { service, rows, wallet, billing, ledger, pays };
};

const readToken = (url: string) => {
  const token = new URL(url).searchParams.get('st')!;
  const [payload, signature] = token.split('.');
  return {
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()),
    valid:
      createHmac('sha256', SECRET).update(payload).digest('base64url') ===
      signature,
  };
};

describe('BriefOnboardingService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.BRIEF_ONBOARDING_URL = 'https://site.test/brief/start';
    process.env.BRIEF_ONBOARDING_SECRET = SECRET;
  });
  afterAll(() => {
    process.env = env;
  });

  it('is unavailable when the env is not set', async () => {
    delete process.env.BRIEF_ONBOARDING_SECRET;
    const { service } = build();
    await expect(service.start(ORG, USER)).rejects.toMatchObject({
      status: 404,
    });
    process.env.BRIEF_ONBOARDING_SECRET = 'short';
    await expect(service.start(ORG, USER)).rejects.toBeInstanceOf(
      HttpException
    );
  });

  it('returns a signed link carrying the run, org, user and language', async () => {
    const { service } = build();
    const { id, url } = await service.start(ORG, USER, 'fr');
    expect(url.startsWith('https://site.test/brief/start?st=')).toBe(true);
    expect(new URL(url).searchParams.get('lang')).toBe('fr');
    const { payload, valid } = readToken(url);
    expect(valid).toBe(true);
    expect(payload).toMatchObject({
      v: 1,
      r: id,
      o: ORG,
      e: USER.email,
      n: USER.name,
      l: 'fr',
    });
    expect(payload.exp).toBeGreaterThan(Date.now());
    expect(payload.exp).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
  });

  it('falls back to the default language for an unknown one', async () => {
    const { service } = build();
    const { url } = await service.start(ORG, USER, 'xx');
    expect(readToken(url).payload.l).toBe('en');
  });

  it('reuses a running run instead of opening another', async () => {
    const { service, rows } = build();
    const first = await service.start(ORG, USER);
    const second = await service.start(ORG, USER);
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it('reopens a run in the language it was opened in', async () => {
    const { service, rows } = build();
    const first = await service.start(ORG, USER, 'ar');
    expect(rows[0].lang).toBe('ar');
    const second = await service.start(ORG, USER, 'en');
    expect(second.id).toBe(first.id);
    expect(readToken(second.url).payload.l).toBe('ar');
    expect(second.url).toContain('lang=ar');
  });

  it('reopens an older run with no stored language in the requested one', async () => {
    const { service, rows } = build();
    await service.start(ORG, USER, 'fr');
    rows[0].lang = null;
    const again = await service.start(ORG, USER, 'de');
    expect(readToken(again.url).payload.l).toBe('de');
  });

  it('closes a stale run and opens a new one', async () => {
    const { service, rows } = build();
    const first = await service.start(ORG, USER);
    rows[0].createdAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const second = await service.start(ORG, USER);
    expect(second.id).not.toBe(first.id);
    expect(rows[0].status).toBe('FAILED');
  });

  it('refuses with the wallet 402 when the run cannot be paid for', async () => {
    const { service, rows, ledger } = build({ free: 0, balance: 50 });
    await expect(service.start(ORG, USER)).rejects.toMatchObject({
      status: 402,
    });
    expect(rows[0].status).toBe('FAILED');
    expect(ledger.balance).toBe(50);
    expect(ledger.charges.size).toBe(0);
  });

  it('makes the first run free and charges it when it opens', async () => {
    const { service, rows, billing, ledger } = build({ free: 1, balance: 0 });
    const { id } = await service.start(ORG, USER);
    expect(billing.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        actionKey: 'brief.onboarding',
        chargeKey: briefOnboardingChargeKey(id),
      })
    );
    expect(billing.charge.mock.calls[0][0].allowNegative).toBeFalsy();
    expect(rows[0].chargeKey).toBe(briefOnboardingChargeKey(id));
    expect(ledger.free).toBe(0);
    expect(ledger.balance).toBe(0);
  });

  it('charges a redo when it is opened and not again when it finishes', async () => {
    const { service, billing, ledger } = build({ free: 1, balance: 150 });
    const first = await service.start(ORG, USER);
    await service.finish(first.id, ORG, 'DONE');
    expect(ledger.balance).toBe(150);

    const redo = await service.start(ORG, USER);
    expect(redo.id).not.toBe(first.id);
    expect(ledger.balance).toBe(50);

    const done = await service.finish(redo.id, ORG, 'DONE');
    expect(done).toEqual({ id: redo.id, status: 'DONE', charged: true });
    await service.finish(redo.id, ORG, 'DONE');
    expect(ledger.balance).toBe(50);
    expect(billing.charge).toHaveBeenCalledTimes(2);
  });

  it('refuses a redo the balance does not cover', async () => {
    const { service, ledger } = build({ free: 1, balance: 20 });
    const first = await service.start(ORG, USER);
    await service.finish(first.id, ORG, 'DONE');
    await expect(service.start(ORG, USER)).rejects.toMatchObject({
      status: 402,
    });
    expect(ledger.balance).toBe(20);
  });

  it('does not charge again when an open run is reopened', async () => {
    const { service, billing } = build();
    await service.start(ORG, USER);
    await service.start(ORG, USER);
    expect(billing.charge).toHaveBeenCalledTimes(1);
  });

  it('does not charge a workspace on a paid plan', async () => {
    const { service, billing } = build({ pays: false });
    const { id } = await service.start(ORG, USER);
    expect(await service.finish(id, ORG, 'DONE')).toMatchObject({
      charged: false,
    });
    expect(billing.charge).not.toHaveBeenCalled();
  });

  it('charges a run opened before it was charged on opening when it finishes', async () => {
    const { service, billing, pays } = build({ free: 0, balance: 0 });
    pays.value = false;
    const { id } = await service.start(ORG, USER);
    pays.value = true;
    expect(await service.finish(id, ORG, 'DONE')).toMatchObject({
      charged: true,
    });
    expect(billing.charge).toHaveBeenCalledTimes(1);
    expect(billing.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeKey: briefOnboardingChargeKey(id),
        allowNegative: true,
      })
    );
  });

  it('refunds a redo that is reported failed', async () => {
    const { service, rows, wallet, ledger } = build({ free: 0, balance: 150 });
    const { id } = await service.start(ORG, USER);
    expect(ledger.balance).toBe(50);
    const failed = await service.finish(id, ORG, 'FAILED', 'boom');
    expect(failed.status).toBe('FAILED');
    expect(wallet.refund).toHaveBeenCalledWith(
      briefOnboardingChargeKey(id),
      expect.any(String)
    );
    expect(ledger.balance).toBe(150);
    expect(rows[0].error).toBe('boom');
  });

  it('refunds an abandoned redo when the stale run is closed', async () => {
    const { service, rows, ledger } = build({ free: 0, balance: 150 });
    await service.start(ORG, USER);
    expect(ledger.balance).toBe(50);
    rows[0].createdAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await service.status(ORG);
    expect(rows[0].status).toBe('FAILED');
    expect(ledger.balance).toBe(150);
  });

  it('gives the free run back when the first run fails', async () => {
    const { service, ledger } = build({ free: 1 });
    const { id } = await service.start(ORG, USER);
    expect(ledger.free).toBe(0);
    await service.finish(id, ORG, 'FAILED');
    expect(ledger.free).toBe(1);
  });

  it('will not finish another workspace run', async () => {
    const { service } = build();
    const { id } = await service.start(ORG, USER);
    await expect(service.finish(id, 'other', 'DONE')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('reports the running and last runs', async () => {
    const { service } = build();
    const { id } = await service.start(ORG, USER);
    expect((await service.status(ORG)).running?.id).toBe(id);
    await service.finish(id, ORG, 'DONE');
    const status = await service.status(ORG);
    expect(status.running).toBeNull();
    expect(status.available).toBe(true);
    expect(status.last).toMatchObject({ id, status: 'DONE' });
  });

  it('says whether opening a new run takes credits', async () => {
    expect((await build({ free: 1 }).service.status(ORG)).nextRunCharged).toBe(
      false
    );
    expect((await build({ free: 0 }).service.status(ORG)).nextRunCharged).toBe(
      true
    );
    expect(
      (await build({ free: null }).service.status(ORG)).nextRunCharged
    ).toBe(true);
    expect(
      (await build({ pays: false, free: 0 }).service.status(ORG))
        .nextRunCharged
    ).toBe(false);
    const open = build({ free: 0, balance: 500 });
    await open.service.start(ORG, USER);
    expect((await open.service.status(ORG)).nextRunCharged).toBe(false);
  });
});
