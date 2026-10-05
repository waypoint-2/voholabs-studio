import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';

const WALLET_START_ATTEMPTS = 10;
const WALLET_START_RETRY_MS = 60_000;

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  private _logger = new Logger(InfiniteWorkflowRegister.name);

  constructor(private _temporalService: TemporalService) {}

  // Starts the hourly wallet jobs. Already running is fine; any other failure
  // (e.g. Temporal still starting) is logged and retried in the background,
  // so a slow boot never leaves the jobs unstarted.
  private async startWalletHousekeeping(attempt = 1): Promise<void> {
    try {
      await this._temporalService.client
        ?.getRawClient()
        ?.workflow?.start('walletHousekeepingWorkflow', {
          workflowId: 'wallet-housekeeping',
          taskQueue: 'main',
        });
    } catch (err) {
      if (err instanceof WorkflowExecutionAlreadyStartedError) {
        return;
      }
      this._logger.warn(
        `Could not start wallet-housekeeping (attempt ${attempt}): ${err}`
      );
      if (attempt < WALLET_START_ATTEMPTS) {
        setTimeout(
          () => this.startWalletHousekeeping(attempt + 1).catch(() => undefined),
          WALLET_START_RETRY_MS
        );
      }
    }
  }

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflow', {
            workflowId: 'missing-post-workflow',
            taskQueue: 'main',
          });
      } catch (err) {}

      // Hourly wallet jobs (storage month pass, short-forecast notices,
      // reconciliation).
      await this.startWalletHousekeeping();
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
