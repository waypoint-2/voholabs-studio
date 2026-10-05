import { Injectable, Logger } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import {
  InsufficientCreditsError,
  WalletService,
  walletPaymentRequired,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { WalletBillingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.billing.service';

// The price row for media storage. Its unit, free amount and price come from
// the row; nothing about the size of a unit or the free amount is in code.
export const STORAGE_ACTION_KEY = 'storage.gb';

const UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

// "gb" or "gb_month" -> bytes in one unit; undefined for anything else.
const bytesPerUnit = (unit: string) =>
  UNIT_BYTES[(unit || '').toLowerCase().split('_')[0]];

export const notEnoughCreditsToStoreMessage = () =>
  'Not enough credits to store this file. Top up to upload it.';

// The chargeKey of one storage unit: charged once per organization, ever.
export const storageUnitChargeKey = (organizationId: string, unit: number) =>
  `storage:${organizationId}:${unit}`;

// Media storage above the free amount, for organizations that pay from their
// wallet. Checked before an upload is stored: when the file takes the library
// into a started unit above the free amount that is not paid for yet, that
// unit is charged then, once. A balance that cannot pay (after auto top-up)
// refuses the upload with the wallet 402, so the file is never stored.
// Deleting files gives nothing back, and a unit paid for stays paid for.
@Injectable()
export class WalletStorageService {
  private _logger = new Logger(WalletStorageService.name);

  constructor(
    private _media: MediaRepository,
    private _wallet: WalletService,
    private _billing: WalletBillingService
  ) {}

  // The storage price row, or undefined when storage is not chargeable (no
  // active row, or a unit that is not a size). Fail closed: without it the
  // free plan's cap stays and nothing is charged.
  async rule() {
    const priced = await this._wallet.price(STORAGE_ACTION_KEY);
    if (!priced) {
      return undefined;
    }
    const unitBytes = bytesPerUnit(priced.action.unit);
    if (!unitBytes) {
      this._logger.error(
        `${STORAGE_ACTION_KEY} has unit "${priced.action.unit}", which is not a size; storage is not charged`
      );
      return undefined;
    }
    return {
      price: priced.price,
      unitBytes,
      freeUnits: Math.max(0, priced.action.freeUnits || 0),
    };
  }

  // Whole units above the free amount, usage rounded up.
  unitsOver(bytes: number, rule: { unitBytes: number; freeUnits: number }) {
    return Math.max(
      0,
      Math.ceil(Math.max(0, bytes) / rule.unitBytes) - rule.freeUnits
    );
  }

  // Whether this organization's storage has no hard cap because it pays for
  // it from the wallet. Paid plans and free organizations keep their plan's
  // cap.
  async liftsCap(organizationId: string) {
    return (
      (await this._wallet.paysFromWallet(organizationId)) &&
      !!(await this.rule())
    );
  }

  // Before an upload of `incomingBytes` is stored: pays for every unit above
  // the free amount the library would then be in that is not paid for yet.
  // Tops up automatically when that can cover it, otherwise throws the wallet
  // 402 and charges nothing. `charge: false` only checks that it could be
  // paid (balance plus what auto top-up can still add), for a size announced
  // before the bytes arrive. Returns the units charged now.
  async payForUpload(
    organizationId: string,
    incomingBytes: number,
    options: { charge?: boolean } = {}
  ) {
    if (!(await this._wallet.paysFromWallet(organizationId))) {
      return 0;
    }
    const rule = await this.rule();
    if (!rule) {
      return 0;
    }
    const used = await this._media.getStorageUsed(organizationId);
    const units = this.unitsOver(used + Math.max(0, incomingBytes || 0), rule);
    if (!units) {
      return 0;
    }
    const unpaid = await this.unpaidUnits(organizationId, units);
    if (!unpaid.length) {
      return 0;
    }
    const cost = unpaid.length * rule.price;

    if (options.charge === false) {
      const balance = await this._wallet.balance(organizationId);
      if (
        balance < cost &&
        balance + (await this._wallet.autoTopUpHeadroom(organizationId)) < cost
      ) {
        throw walletPaymentRequired(notEnoughCreditsToStoreMessage());
      }
      return 0;
    }

    if (!(await this._billing.autoTopUpFor(organizationId, cost))) {
      throw walletPaymentRequired(notEnoughCreditsToStoreMessage());
    }
    for (const unit of unpaid) {
      try {
        await this._billing.charge({
          organizationId,
          actionKey: STORAGE_ACTION_KEY,
          chargeKey: storageUnitChargeKey(organizationId, unit),
          quantity: 1,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw walletPaymentRequired(notEnoughCreditsToStoreMessage());
        }
        throw err;
      }
    }
    return unpaid.length;
  }

  // Units 1..units above the free amount that no standing storage charge
  // pays for. A unit is paid by its own entry (storage:<org>:<unit>), or by
  // an earlier monthly charge: under the old scheme a month's entries
  // (storage:<org>:<YYYY-MM> and storage:<org>:<YYYY-MM>:<unit>) paid for
  // units 1..their total quantity, so the largest month counts as paid.
  async unpaidUnits(organizationId: string, units: number) {
    const prefix = `storage:${organizationId}:`;
    const paid = new Set<number>();
    const months = new Map<string, number>();
    for (const charge of await this._wallet.standingChargesOf(
      organizationId,
      STORAGE_ACTION_KEY
    )) {
      if (!charge.chargeKey?.startsWith(prefix)) {
        continue;
      }
      const rest = charge.chargeKey.slice(prefix.length);
      if (/^\d+$/.test(rest)) {
        paid.add(Number(rest));
        continue;
      }
      const month = /^(\d{4}-\d{2})(?::\d+)?$/.exec(rest);
      if (month) {
        months.set(
          month[1],
          (months.get(month[1]) || 0) + Math.max(0, charge.quantity || 0)
        );
      }
    }
    const byMonths = Math.max(0, ...months.values());
    const unpaid: number[] = [];
    for (let unit = byMonths + 1; unit <= units; unit++) {
      if (!paid.has(unit)) {
        unpaid.push(unit);
      }
    }
    return unpaid;
  }
}
