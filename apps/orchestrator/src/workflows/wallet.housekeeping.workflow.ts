import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { WalletActivity } from '@gitroom/orchestrator/activities/wallet.activity';

const { walletHousekeeping } = proxyActivities<WalletActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Starts afresh after a week so the history stays short.
const RUNS_PER_HISTORY = 24 * 7;

// Hourly wallet housekeeping (started under RUN_CRON as
// "wallet-housekeeping").
export async function walletHousekeepingWorkflow() {
  await walletHousekeeping();
  for (let run = 1; run < RUNS_PER_HISTORY; run++) {
    await sleep('1 hour');
    await walletHousekeeping();
  }
  await sleep('1 hour');
  await continueAsNew<typeof walletHousekeepingWorkflow>();
}
