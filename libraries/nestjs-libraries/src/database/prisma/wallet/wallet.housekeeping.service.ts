import { Injectable, Logger } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  WalletBillingService,
  walletPaymentsEnabled,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';
import { hasAccess } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';

// The reconciliation looks back this many days, once a UTC day, from this
// hour on.
const RECONCILE_DAYS = 2;
const RECONCILE_HOUR_UTC = 6;

// Periodic wallet jobs, run hourly by the wallet-housekeeping workflow (only
// where RUN_CRON starts it). Every step is idempotent and cheap, and one
// failing step never stops the others.
@Injectable()
export class WalletHousekeepingService {
  private _logger = new Logger(WalletHousekeepingService.name);
  private _reconciledOn?: string;

  constructor(
    private _media: MediaRepository,
    private _wallet: WalletService,
    private _billing: WalletBillingService
  ) {}

  // Storage is not charged here: it is paid for when a file is uploaded
  // (WalletStorageService), once per unit, so nothing depends on this
  // workflow running.
  async run() {
    const notified = await this.step('short forecast notices', () =>
      this.notifyShort()
    );
    const reconciled = await this.step('reconciliation', () =>
      this.reconcile()
    );
    return { notified, reconciled };
  }

  private async step<T>(name: string, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (err) {
      this._logger.error(`Wallet housekeeping: ${name} failed: ${err}`);
      return undefined;
    }
  }

  // Tells each pay-as-you-go organization, at most once a day, when the paid
  // usage it has scheduled in the next 48 hours is not covered. The forecast
  // only looks at providers charged per post (X today) and returns at once
  // for an organization with nothing scheduled there.
  private async notifyShort() {
    let checked = 0;
    for (const org of await this._media.storageOfWalletOrganizations()) {
      if (hasAccess({ subscription: org.subscription })) {
        continue;
      }
      try {
        await this._wallet.notifyIfShort(org.organizationId);
        checked++;
      } catch (err) {
        this._logger.error(
          `Short forecast notice failed for ${org.organizationId}: ${err}`
        );
      }
    }
    return checked;
  }

  // Compares the ledger's top-ups with Stripe once a day and alerts only when
  // they disagree.
  private async reconcile() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (
      !walletPaymentsEnabled() ||
      this._reconciledOn === today ||
      now.getUTCHours() < RECONCILE_HOUR_UTC
    ) {
      return false;
    }
    const result = await this._billing.reconcile(RECONCILE_DAYS);
    this._reconciledOn = today;

    const stripeOnly = result.stripeOnly.length;
    const ledgerOnly = result.ledgerOnly.length;
    const mismatched = result.mismatched.length;
    if (stripeOnly || ledgerOnly || mismatched) {
      await walletAlert(
        `Reconciliation (last ${result.days} days): ${stripeOnly} paid in Stripe but not credited, ${ledgerOnly} credited without a Stripe payment, ${mismatched} with different amounts. Details: GET /admin/wallet/reconcile?days=${result.days}`
      );
    }
    return true;
  }
}
