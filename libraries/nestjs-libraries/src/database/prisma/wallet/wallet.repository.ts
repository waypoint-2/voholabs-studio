import { Injectable } from '@nestjs/common';
import { Prisma, WalletEntry, WalletEntryType } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public balance: number) {
    super('Not enough credits');
  }
}

export interface NewWalletEntry {
  organizationId: string;
  amount: number;
  type: WalletEntryType;
  description: string;
  actionKey?: string;
  quantity?: number;
  unitPrice?: number;
  idempotencyKey?: string;
  reference?: string;
  paidAmount?: number;
  currency?: string;
  meta?: string;
  chargeKey?: string;
  actorId?: string;
}

// Free allowance applied inside a charge: `units` free per period, counted
// from `since` (undefined for once ever).
export interface FreeAllowance {
  units: number;
  since?: Date;
}

export const FREE_DESCRIPTION = 'Included free';

// Sum of quantity of SPEND entries for an action that were not refunded.
const usedUnitsQuery = async (
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
  actionKey: string,
  since?: Date
) => {
  const rows = await client.$queryRaw<{ used: bigint | number | null }[]>`
    SELECT COALESCE(SUM(s."quantity"), 0) AS used
    FROM "WalletEntry" s
    WHERE s."organizationId" = ${organizationId}
      AND s."type" = 'SPEND'
      AND s."actionKey" = ${actionKey}
      AND s."createdAt" >= ${since || new Date(0)}
      AND NOT EXISTS (
        SELECT 1 FROM "WalletEntry" r
        WHERE r."idempotencyKey" = 'refund:' || s."idempotencyKey"
      )`;
  return Number(rows[0]?.used || 0);
};

type WalletTx = Pick<
  Prisma.TransactionClient,
  'wallet' | 'walletEntry' | '$queryRaw'
>;

// Locks the organization's wallet row (creating it first) for the rest of
// the transaction, so two charges at once cannot both see the same balance.
const lockWallet = async (tx: WalletTx, organizationId: string) => {
  await tx.wallet.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
};

// Applies an action's free allowance to a charge about to be written: units
// still free are not charged, and a charge that is entirely free becomes
// "Included free". Must run under the wallet lock.
const applyFree = async (
  tx: WalletTx,
  data: NewWalletEntry,
  free?: FreeAllowance,
  meta: Record<string, unknown> = {}
) => {
  if (!free || free.units <= 0 || !data.actionKey) {
    return;
  }
  const used = await usedUnitsQuery(
    tx,
    data.organizationId,
    data.actionKey,
    free.since
  );
  const quantity = data.quantity ?? 1;
  const freeQuantity = Math.min(quantity, Math.max(0, free.units - used));
  if (freeQuantity > 0) {
    data.amount = (quantity - freeQuantity) * (data.unitPrice || 0);
    data.meta = JSON.stringify({ ...meta, freeQuantity });
    if (freeQuantity === quantity) {
      data.unitPrice = 0;
      data.description = FREE_DESCRIPTION;
    }
  }
};

// The items a charge made by spendItems paid for.
const itemsOf = (meta: string | null) => {
  try {
    const items = JSON.parse(meta || '{}')?.items;
    return Array.isArray(items) ? (items as string[]) : [];
  } catch {
    return [];
  }
};

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string })?.code === 'P2002';

// One thing to settle in WalletRepository.settleCharges: what the chargeKey
// should be charged as now, or null for nothing (its standing charge, if any,
// is refunded).
export interface SettleItem {
  chargeKey: string;
  charge: {
    actionKey: string;
    unitPrice: number;
    description: string;
    reference?: string;
    free?: FreeAllowance;
  } | null;
  // The standing charge was used up (the thing it paid for already
  // happened): charge again under the next key instead of keeping it, and
  // leave it as it is.
  fresh?: boolean;
}

export interface SettleResult {
  chargeKey: string;
  result: 'kept' | 'charged' | 'refunded' | 'repriced' | 'none';
  entry?: { idempotencyKey: string | null; amount: number };
}

// A post row as the post charges read it.
export interface ChargePostRow {
  id: string;
  group: string;
  parentPostId: string | null;
  state: string;
  content: string;
  releaseURL: string | null;
  releaseId: string | null;
  deletedAt: Date | null;
  publishDate: Date;
  intervalInDays: number | null;
  integration: { providerIdentifier: string } | null;
}

@Injectable()
export class WalletRepository {
  constructor(
    private _wallet: PrismaRepository<'wallet'>,
    private _entry: PrismaRepository<'walletEntry'>,
    private _action: PrismaRepository<'billableAction'>,
    private _setting: PrismaRepository<'billingSetting'>,
    private _category: PrismaRepository<'billingCategory'>,
    private _post: PrismaRepository<'post'>,
    private _organization: PrismaRepository<'organization'>,
    private _transaction: PrismaTransaction
  ) {}

  settings() {
    return this._setting.model.billingSetting.findMany();
  }

  categories() {
    return this._category.model.billingCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  actions(includeInactive = false) {
    return this._action.model.billableAction.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ provider: 'asc' }, { key: 'asc' }],
    });
  }

  action(key: string) {
    return this._action.model.billableAction.findUnique({ where: { key } });
  }

  getWallet(organizationId: string) {
    return this._wallet.model.wallet.findUnique({ where: { organizationId } });
  }

  getWalletByCustomer(stripeCustomerId: string) {
    return this._wallet.model.wallet.findFirst({ where: { stripeCustomerId } });
  }

  async ensureWallet(organizationId: string) {
    try {
      return await this._wallet.model.wallet.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      return this._wallet.model.wallet.findUniqueOrThrow({
        where: { organizationId },
      });
    }
  }

  updateWallet(organizationId: string, data: Prisma.WalletUpdateInput) {
    return this._wallet.model.wallet.update({
      where: { organizationId },
      data,
    });
  }

  async balance(organizationId: string) {
    const sum = await this._entry.model.walletEntry.aggregate({
      where: { organizationId },
      _sum: { amount: true },
    });
    return sum._sum.amount || 0;
  }

  entryByKey(idempotencyKey: string) {
    return this._entry.model.walletEntry.findUnique({
      where: { idempotencyKey },
    });
  }

  organizationSubscription(organizationId: string) {
    return this._organization.model.organization.findUnique({
      where: { id: organizationId },
      select: { subscription: true },
    });
  }

  // Posts waiting to publish in a window, on the given providers, for the
  // forecast. Thread replies are rows of their own.
  scheduledPosts(
    organizationId: string,
    providers: string[],
    from: Date,
    to: Date
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId,
        state: 'QUEUE',
        deletedAt: null,
        publishDate: { gte: from, lte: to },
        integration: {
          providerIdentifier: { in: providers },
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        integration: { select: { providerIdentifier: true } },
      },
      orderBy: { publishDate: 'asc' },
    });
  }

  // Every row (live or deleted) of the given post groups, for charging posts
  // when they are scheduled and refunding them when they are not sent.
  postsInGroups(organizationId: string, groups: string[]) {
    if (!groups.length) {
      return Promise.resolve([] as ChargePostRow[]);
    }
    return this._post.model.post.findMany({
      where: { organizationId, group: { in: groups } },
      select: {
        id: true,
        group: true,
        parentPostId: true,
        state: true,
        content: true,
        releaseURL: true,
        releaseId: true,
        deletedAt: true,
        publishDate: true,
        intervalInDays: true,
        integration: { select: { providerIdentifier: true } },
      },
    }) as Promise<ChargePostRow[]>;
  }

  // Live posts on the given providers that repeat ("Repeat post every..."),
  // for the forecast of their next occurrences.
  repeatingPosts(organizationId: string, providers: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId,
        deletedAt: null,
        intervalInDays: { gt: 0 },
        state: { in: ['QUEUE', 'PUBLISHED'] },
        integration: {
          providerIdentifier: { in: providers },
          deletedAt: null,
          disabled: false,
        },
      },
      select: {
        id: true,
        group: true,
        parentPostId: true,
        state: true,
        content: true,
        publishDate: true,
        intervalInDays: true,
        integration: { select: { providerIdentifier: true } },
      },
    });
  }

  // The charge standing for each chargeKey: its latest SPEND, when that was
  // not refunded.
  async standingCharges(organizationId: string, chargeKeys: string[]) {
    const standing = new Map<string, WalletEntry>();
    if (!chargeKeys.length) {
      return standing;
    }
    const spends = await this._entry.model.walletEntry.findMany({
      where: {
        organizationId,
        type: WalletEntryType.SPEND,
        chargeKey: { in: chargeKeys },
      },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, WalletEntry>();
    for (const spend of spends) {
      if (spend.chargeKey && !latest.has(spend.chargeKey)) {
        latest.set(spend.chargeKey, spend);
      }
    }
    const refunds = await this._entry.model.walletEntry.findMany({
      where: {
        idempotencyKey: {
          in: [...latest.values()].map((e) => `refund:${e.idempotencyKey}`),
        },
      },
      select: { idempotencyKey: true },
    });
    const refunded = new Set(refunds.map((r) => r.idempotencyKey));
    for (const [key, entry] of latest) {
      if (!refunded.has(`refund:${entry.idempotencyKey}`)) {
        standing.set(key, entry);
      }
    }
    return standing;
  }

  // Every standing (not refunded) charge of an action for an organization,
  // with its chargeKey and quantity, e.g. to tell which storage units are
  // already paid for.
  async standingChargesOf(organizationId: string, actionKey: string) {
    const spends = await this._entry.model.walletEntry.findMany({
      where: { organizationId, type: WalletEntryType.SPEND, actionKey },
      select: { chargeKey: true, quantity: true, idempotencyKey: true },
    });
    if (!spends.length) {
      return [];
    }
    const refunds = await this._entry.model.walletEntry.findMany({
      where: {
        idempotencyKey: {
          in: spends.map((e) => `refund:${e.idempotencyKey}`),
        },
      },
      select: { idempotencyKey: true },
    });
    const refunded = new Set(refunds.map((r) => r.idempotencyKey));
    return spends
      .filter((e) => !refunded.has(`refund:${e.idempotencyKey}`))
      .map((e) => ({ chargeKey: e.chargeKey, quantity: e.quantity }));
  }

  // Brings several charges to what they should be now, all or nothing, under
  // the wallet lock: charges what has no standing charge, re-prices a
  // standing charge whose action changed (refund, then charge again) and
  // refunds what should no longer be charged. Throws InsufficientCreditsError
  // (with the net amount needed) and writes nothing when the balance does not
  // cover the net amount it would take; giving credits back never fails.
  async settleCharges(
    organizationId: string,
    items: SettleItem[],
    refundDescription: string
  ): Promise<SettleResult[]> {
    if (!items.length) {
      return [];
    }
    return this._transaction.model.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      });
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "organizationId" = ${organizationId} FOR UPDATE`;

      // Plan everything first; nothing is written until the balance check.
      const refunds: NewWalletEntry[] = [];
      const spends: (NewWalletEntry & { chargeKey: string })[] = [];
      const results: SettleResult[] = [];
      let net = 0;
      for (const item of items) {
        const where = {
          organizationId,
          type: WalletEntryType.SPEND,
          chargeKey: item.chargeKey,
        };
        const [latest, count] = await Promise.all([
          tx.walletEntry.findFirst({ where, orderBy: { createdAt: 'desc' } }),
          tx.walletEntry.count({ where }),
        ]);
        const standing =
          latest &&
          !(await tx.walletEntry.findUnique({
            where: { idempotencyKey: `refund:${latest.idempotencyKey}` },
          }))
            ? latest
            : null;

        const refund = () => {
          refunds.push({
            organizationId,
            amount: -standing!.amount,
            type: 'REFUND',
            actionKey: standing!.actionKey || undefined,
            quantity: -standing!.quantity,
            unitPrice: standing!.unitPrice || undefined,
            description: refundDescription,
            idempotencyKey: `refund:${standing!.idempotencyKey}`,
            reference: standing!.reference || undefined,
          });
          net += standing!.amount;
        };

        if (!item.charge) {
          if (standing && !item.fresh) {
            refund();
            results.push({
              chargeKey: item.chargeKey,
              result: 'refunded',
              entry: { idempotencyKey: standing.idempotencyKey, amount: 0 },
            });
          } else {
            results.push({ chargeKey: item.chargeKey, result: 'none' });
          }
          continue;
        }

        if (
          standing &&
          !item.fresh &&
          standing.actionKey === item.charge.actionKey
        ) {
          results.push({
            chargeKey: item.chargeKey,
            result: 'kept',
            entry: {
              idempotencyKey: standing.idempotencyKey,
              amount: standing.amount,
            },
          });
          continue;
        }
        const repriced = !!standing && !item.fresh;
        if (repriced) {
          refund();
        }

        let amount = item.charge.unitPrice;
        let unitPrice = item.charge.unitPrice;
        let description = item.charge.description;
        let meta: string | undefined;
        const free = item.charge.free;
        if (free && free.units > 0) {
          const used =
            (await usedUnitsQuery(
              tx,
              organizationId,
              item.charge.actionKey,
              free.since
            )) +
            spends.filter(
              (s) => s.actionKey === item.charge!.actionKey && s.amount === 0
            ).length;
          if (used < free.units) {
            amount = 0;
            unitPrice = 0;
            description = FREE_DESCRIPTION;
            meta = JSON.stringify({ freeQuantity: 1 });
          }
        }
        spends.push({
          organizationId,
          amount,
          type: 'SPEND',
          actionKey: item.charge.actionKey,
          quantity: 1,
          unitPrice,
          description,
          meta,
          reference: item.charge.reference,
          chargeKey: item.chargeKey,
          idempotencyKey: `${item.chargeKey}#${count + 1}`,
        });
        net += amount;
        results.push({
          chargeKey: item.chargeKey,
          result: repriced ? 'repriced' : 'charged',
          entry: {
            idempotencyKey: `${item.chargeKey}#${count + 1}`,
            amount: -amount,
          },
        });
      }

      if (net > 0) {
        const sum = await tx.walletEntry.aggregate({
          where: { organizationId },
          _sum: { amount: true },
        });
        const balance = sum._sum.amount || 0;
        if (balance < net) {
          throw new InsufficientCreditsError(net, balance);
        }
      }

      for (const refund of refunds) {
        await tx.walletEntry.create({ data: refund });
      }
      for (const spend of spends) {
        await tx.walletEntry.create({
          data: { ...spend, amount: spend.amount ? -spend.amount : 0 },
        });
      }
      return results;
    });
  }

  // What has already been taken back for a top-up's payment (refunds and
  // disputes), as a negative number.
  async clawedBack(organizationId: string, paymentIntentId: string) {
    const sum = await this._entry.model.walletEntry.aggregate({
      where: {
        organizationId,
        type: 'ADJUST',
        reference: paymentIntentId,
        idempotencyKey: { startsWith: `chargeback:${paymentIntentId}:` },
      },
      _sum: { amount: true },
    });
    return sum._sum.amount || 0;
  }

  entries(
    organizationId: string,
    page: number,
    size: number,
    types?: WalletEntryType[]
  ) {
    const where: Prisma.WalletEntryWhereInput = {
      organizationId,
      ...(types?.length ? { type: { in: types } } : {}),
    };
    return Promise.all([
      this._entry.model.walletEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
      }),
      this._entry.model.walletEntry.count({ where }),
    ]);
  }

  // Units of an action charged and not refunded, since a date (or ever), for
  // the free allowance.
  usedUnits(organizationId: string, actionKey: string, since?: Date) {
    return this._transaction.model.$transaction((tx) =>
      usedUnitsQuery(tx, organizationId, actionKey, since)
    );
  }

  // Marks today's short-forecast notice as sent. True only for the first
  // caller of the UTC day, so concurrent callers notify once.
  async claimForecastNotice(organizationId: string, dayStart: Date) {
    const result = await this._wallet.model.wallet.updateMany({
      where: {
        organizationId,
        OR: [
          { forecastNotifiedAt: null },
          { forecastNotifiedAt: { lt: dayStart } },
        ],
      },
      data: { forecastNotifiedAt: new Date() },
    });
    return result.count > 0;
  }

  // Every top-up recorded since a date, across workspaces, for reconciling
  // with Stripe.
  topUpsSince(since: Date) {
    return this._entry.model.walletEntry.findMany({
      where: {
        type: { in: ['TOPUP', 'AUTO_TOPUP'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  entriesByKeys(idempotencyKeys: string[]) {
    if (!idempotencyKeys.length) {
      return Promise.resolve([]);
    }
    return this._entry.model.walletEntry.findMany({
      where: { idempotencyKey: { in: idempotencyKeys } },
    });
  }

  // Spending per action since a date, for the usage breakdown.
  usage(organizationId: string, since: Date) {
    return this._entry.model.walletEntry.groupBy({
      by: ['actionKey'],
      where: {
        organizationId,
        createdAt: { gte: since },
        type: { in: ['SPEND', 'REFUND'] },
      },
      _sum: { amount: true, quantity: true },
    });
  }

  // Spending per day since a date, for the chart.
  daily(organizationId: string, since: Date) {
    return this._entry.model.walletEntry.findMany({
      where: {
        organizationId,
        createdAt: { gte: since },
        type: { in: ['SPEND', 'REFUND'] },
      },
      select: { amount: true, createdAt: true },
    });
  }

  async autoTopUpSpentSince(organizationId: string, since: Date) {
    const sum = await this._entry.model.walletEntry.aggregate({
      where: { organizationId, type: 'AUTO_TOPUP', createdAt: { gte: since } },
      _sum: { paidAmount: true },
    });
    return sum._sum.paidAmount || 0;
  }

  // Adds an entry once, saying whether this call wrote it (false when the
  // idempotency key was already there).
  async addOnce(entry: NewWalletEntry) {
    try {
      return {
        entry: await this._entry.model.walletEntry.create({ data: entry }),
        created: true,
      };
    } catch (err) {
      if (!isUniqueViolation(err) || !entry.idempotencyKey) {
        throw err;
      }
      return {
        entry: await this._entry.model.walletEntry.findUniqueOrThrow({
          where: { idempotencyKey: entry.idempotencyKey },
        }),
        created: false,
      };
    }
  }

  // Adds an entry once. A repeated idempotency key returns the first entry.
  async add(entry: NewWalletEntry) {
    try {
      return await this._entry.model.walletEntry.create({ data: entry });
    } catch (err) {
      if (!isUniqueViolation(err) || !entry.idempotencyKey) {
        throw err;
      }
      return this._entry.model.walletEntry.findUniqueOrThrow({
        where: { idempotencyKey: entry.idempotencyKey },
      });
    }
  }

  // Spends credits if the balance covers them. The wallet row is locked for
  // the duration, so two charges at once cannot both see the same balance.
  // amount is positive here and stored negative.
  //
  // chargeKey names the thing being paid for (a post, say). It is charged at
  // most once while that charge stands; after a refund, the next attempt is
  // charged again under a new key (chargeKey#2, #3 ...).
  //
  // allowNegative charges even when the balance does not cover it, for
  // things already used (storage above the free amount), so the balance goes
  // below zero instead of the charge being lost.
  //
  // free applies the action's free allowance under the same lock: units still
  // free are not charged, and a charge that is entirely free is written as a
  // zero SPEND ("Included free") so it counts against the allowance.
  async spend(
    entry: NewWalletEntry & {
      chargeKey: string;
      allowNegative?: boolean;
      free?: FreeAllowance;
    }
  ) {
    const { chargeKey, allowNegative, free, ...data } = entry;
    return this._transaction.model.$transaction(async (tx) => {
      await lockWallet(tx, data.organizationId);

      const previous = {
        organizationId: data.organizationId,
        type: WalletEntryType.SPEND,
        chargeKey,
      };
      const [latest, count] = await Promise.all([
        tx.walletEntry.findFirst({
          where: previous,
          orderBy: { createdAt: 'desc' },
        }),
        tx.walletEntry.count({ where: previous }),
      ]);
      if (
        latest &&
        !(await tx.walletEntry.findUnique({
          where: { idempotencyKey: `refund:${latest.idempotencyKey}` },
        }))
      ) {
        return latest;
      }

      await applyFree(tx, data, free);

      if (data.amount > 0) {
        const sum = await tx.walletEntry.aggregate({
          where: { organizationId: data.organizationId },
          _sum: { amount: true },
        });
        const balance = sum._sum.amount || 0;
        if (!allowNegative && balance < data.amount) {
          throw new InsufficientCreditsError(data.amount, balance);
        }
      }

      return tx.walletEntry.create({
        data: {
          ...data,
          amount: data.amount ? -data.amount : 0,
          chargeKey,
          idempotencyKey: `${chargeKey}#${count + 1}`,
        },
      });
    });
  }

  // Charges for the items (e.g. posts read) not already charged under
  // `chargePrefix`, under the wallet lock, so each item is paid at most once
  // per prefix whichever request asks first. The prefix names the period
  // and the organization (e.g. xread:<org>:<UTC day>:); each charge under it
  // is <prefix><n> and lists its items in `meta`. A refunded charge frees its
  // items again. Returns null when every item was already charged.
  async spendItems(
    entry: Omit<NewWalletEntry, 'amount' | 'quantity' | 'chargeKey'> & {
      chargePrefix: string;
      items: string[];
      // Units charged per new item.
      unitsPerItem: number;
      allowNegative?: boolean;
      free?: FreeAllowance;
    }
  ) {
    const { chargePrefix, items, unitsPerItem, allowNegative, free, ...rest } =
      entry;
    return this._transaction.model.$transaction(async (tx) => {
      await lockWallet(tx, rest.organizationId);

      const earlier = await tx.walletEntry.findMany({
        where: {
          organizationId: rest.organizationId,
          type: WalletEntryType.SPEND,
          chargeKey: { startsWith: chargePrefix },
        },
      });
      const refunded = new Set(
        (
          await tx.walletEntry.findMany({
            where: {
              idempotencyKey: {
                in: earlier.map((e) => `refund:${e.idempotencyKey}`),
              },
            },
            select: { idempotencyKey: true },
          })
        ).map((r) => r.idempotencyKey)
      );
      const charged = new Set<string>();
      for (const e of earlier) {
        if (refunded.has(`refund:${e.idempotencyKey}`)) {
          continue;
        }
        for (const item of itemsOf(e.meta)) {
          charged.add(item);
        }
      }
      const fresh = [...new Set(items)].filter((i) => !charged.has(i));
      if (!fresh.length) {
        return null;
      }

      const quantity = fresh.length * unitsPerItem;
      const data: NewWalletEntry = {
        ...rest,
        quantity,
        amount: quantity * (rest.unitPrice || 0),
        meta: JSON.stringify({ items: fresh }),
      };
      await applyFree(tx, data, free, { items: fresh });

      if (data.amount > 0 && !allowNegative) {
        const sum = await tx.walletEntry.aggregate({
          where: { organizationId: rest.organizationId },
          _sum: { amount: true },
        });
        const balance = sum._sum.amount || 0;
        if (balance < data.amount) {
          throw new InsufficientCreditsError(data.amount, balance);
        }
      }

      const chargeKey = `${chargePrefix}${earlier.length + 1}`;
      return tx.walletEntry.create({
        data: {
          ...data,
          amount: data.amount ? -data.amount : 0,
          chargeKey,
          idempotencyKey: `${chargeKey}#1`,
        },
      });
    });
  }
}
