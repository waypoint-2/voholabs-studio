import { Injectable } from '@nestjs/common';
import {
  InsufficientCreditsError,
  postChargeKey,
  postWasSent,
  walletPaymentRequired,
  WalletService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { WalletBillingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import {
  ChargePostRow,
  SettleItem,
  WalletRepository,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.repository';

// Posts are paid for when they are scheduled (Add to calendar, Post now, the
// public API, an agent, a draft put on the schedule), never when they are
// saved as drafts. Every part of a thread is its own post and its own charge
// (`post:<id>`). Editing re-prices only what changed; deleting, moving back
// to draft or failing to send gives the credits back, part by part, for
// whatever was not sent. Publishing reuses the charge (the same chargeKey),
// so a post is never paid twice, and a post queued before this existed is
// simply charged when it publishes, as before.

export const notEnoughCreditsToScheduleMessage = () =>
  'Not enough credits in your wallet to schedule this. Top up (or turn on automatic top-up), then schedule it again.';

export const REFUND_REASONS = {
  deleted: 'Refund: the post was deleted',
  draft: 'Refund: the post was moved back to drafts',
  edited: 'Refund: the post was edited',
  notSent: 'Refund: the post was not published',
  includedInPlan: 'Refund: posts are included in your plan',
} as const;

const providerOf = (identifier?: string | null) =>
  (identifier || '').toLowerCase().split('-')[0];

export interface SchedulePlan {
  // The provider identifier of the channel (settings.__type).
  identifier: string;
  // Each part as it will be saved, in order, with its id when it exists.
  values: { id?: string; content: string }[];
  // The group being edited, if any.
  group?: string;
  // Whether this save puts the post on the schedule.
  scheduled: boolean | 'keep';
}

@Injectable()
export class WalletPostsService {
  constructor(
    private _wallet: WalletService,
    private _billing: WalletBillingService,
    private _repository: WalletRepository
  ) {}

  // The providers this workspace pays per post for, or an empty set when it
  // does not pay from its wallet (no wallet, free, frozen or a paid plan).
  private async chargedProviders(organizationId: string) {
    if (!(await this._wallet.paysFromWallet(organizationId))) {
      return new Set<string>();
    }
    return new Set(await this._wallet.postProviders());
  }

  // What a post should be charged as now, or null when it should not be.
  private async desiredCharge(
    charged: Set<string>,
    identifier: string,
    content: string,
    reference: string
  ): Promise<SettleItem['charge']> {
    if (!charged.has(providerOf(identifier))) {
      return null;
    }
    const actionKey = await this._wallet.postActionKey(identifier, content);
    const priced = await this._wallet.price(actionKey);
    if (!priced) {
      return null;
    }
    return {
      actionKey,
      unitPrice: priced.price,
      description: priced.action.name,
      reference,
      free: this._wallet.freeAllowance(priced.action),
    };
  }

  private async plan(
    organizationId: string,
    rows: ChargePostRow[],
    options: {
      mainState?: Record<string, string>;
      fresh?: string[];
      refundOnly?: boolean;
    }
  ) {
    const charged = options.refundOnly
      ? new Set<string>()
      : await this.chargedProviders(organizationId);
    const mainState = new Map<string, string>();
    for (const row of rows) {
      if (!row.deletedAt && !row.parentPostId) {
        mainState.set(row.group, row.state);
      }
    }
    const fresh = new Set(options.fresh || []);
    const items: SettleItem[] = [];
    for (const row of rows) {
      // A part that went out keeps its charge, whatever happens next.
      if (postWasSent(row)) {
        continue;
      }
      const state = options.mainState?.[row.group] ?? mainState.get(row.group);
      const charge =
        !row.deletedAt && state === 'QUEUE'
          ? await this.desiredCharge(
              charged,
              row.integration?.providerIdentifier || '',
              row.content,
              row.id
            )
          : null;
      items.push({
        chargeKey: postChargeKey(row.id),
        charge,
        fresh: fresh.has(row.id),
      });
    }
    return items;
  }

  // Applies the plan; a short balance is topped up automatically when that
  // can cover it, otherwise refused with a 402 the app turns into the top-up.
  private async apply(
    organizationId: string,
    items: SettleItem[],
    reason: string,
    topUp = true
  ) {
    if (!topUp) {
      return this._repository.settleCharges(organizationId, items, reason);
    }
    try {
      return await this._repository.settleCharges(
        organizationId,
        items,
        reason
      );
    } catch (err) {
      if (!(err instanceof InsufficientCreditsError)) {
        throw err;
      }
      if (!(await this._billing.autoTopUpFor(organizationId, err.needed))) {
        throw walletPaymentRequired(notEnoughCreditsToScheduleMessage());
      }
      return this._repository.settleCharges(organizationId, items, reason);
    } finally {
      // Like every other charge: keep the balance above the auto top-up
      // threshold for the next one, then check what is scheduled next.
      this._billing
        .autoTopUp(organizationId)
        .catch(() => false)
        .then(() => this._billing.notifyIfShort(organizationId))
        .catch(() => undefined);
    }
  }

  // Brings the charges of these post groups in line with their rows: queued
  // posts are charged (or re-priced), anything deleted, drafted or failed and
  // not sent is refunded. `mainState` pretends a group is in that state (to
  // charge before putting it on the schedule); `fresh` lists posts that went
  // out before and are going out again, so their old charge stays used up.
  async settleGroups(
    organizationId: string,
    groups: string[],
    options: {
      reason: string;
      mainState?: Record<string, string>;
      fresh?: string[];
      // Only give back: nothing is charged and no automatic top-up runs
      // (an organization on a paid plan).
      refundOnly?: boolean;
    }
  ) {
    if (!groups.length || !(await this._wallet.getWallet(organizationId))) {
      return [];
    }
    const rows = await this._repository.postsInGroups(organizationId, groups);
    const items = await this.plan(organizationId, rows, options);
    return this.apply(
      organizationId,
      items,
      options.reason,
      !options.refundOnly
    );
  }

  // Gives back the charges standing for these posts (as long as they were
  // not sent), e.g. when publishing finds the workspace no longer pays from
  // its wallet.
  async refundPosts(organizationId: string, postIds: string[], reason: string) {
    if (!postIds.length || !(await this._wallet.getWallet(organizationId))) {
      return [];
    }
    return this._repository.settleCharges(
      organizationId,
      postIds.map((id) => ({ chargeKey: postChargeKey(id), charge: null })),
      reason
    );
  }

  // Before anything is saved: refuses (402) a save that schedules more than
  // the balance covers, after topping up automatically when that can cover
  // it. What an edited group already paid counts towards its new price.
  async assertCanSchedule(organizationId: string, plans: SchedulePlan[]) {
    if (!plans.length || !(await this._wallet.getWallet(organizationId))) {
      return;
    }
    const charged = await this.chargedProviders(organizationId);
    if (!plans.some((p) => charged.has(providerOf(p.identifier)))) {
      return;
    }

    let net = 0;
    for (const plan of plans) {
      const rows = plan.group
        ? await this._repository.postsInGroups(organizationId, [plan.group])
        : [];
      const sent = new Set(rows.filter(postWasSent).map((r) => r.id));
      const main = rows.find((r) => !r.deletedAt && !r.parentPostId);
      const scheduled =
        plan.scheduled === 'keep' ? main?.state === 'QUEUE' : plan.scheduled;

      if (scheduled) {
        for (const value of plan.values) {
          if (value.id && sent.has(value.id)) {
            continue;
          }
          const charge = await this.desiredCharge(
            charged,
            plan.identifier,
            value.content,
            value.id || ''
          );
          net += charge?.unitPrice || 0;
        }
      }
      const standing = await this._repository.standingCharges(
        organizationId,
        rows.filter((r) => !postWasSent(r)).map((r) => postChargeKey(r.id))
      );
      for (const entry of standing.values()) {
        net += entry.amount;
      }
    }

    if (net <= 0) {
      return;
    }
    if (!(await this._billing.autoTopUpFor(organizationId, net))) {
      throw walletPaymentRequired(notEnoughCreditsToScheduleMessage());
    }
  }
}
