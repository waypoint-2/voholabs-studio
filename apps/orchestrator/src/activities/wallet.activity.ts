import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { WalletHousekeepingService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.housekeeping.service';

// Wallet housekeeping activities.
@Injectable()
@Activity()
export class WalletActivity {
  constructor(private _housekeeping: WalletHousekeepingService) {}

  // Storage month pass, short-forecast notices and the daily
  // reconciliation. Idempotent: safe to retry and to run any time.
  @ActivityMethod()
  async walletHousekeeping() {
    return this._housekeeping.run();
  }
}
