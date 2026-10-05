import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import dayjs from 'dayjs';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  creditsText,
  notOnWalletMessage,
  onPaidPlan,
  orgFromContext,
  toCredits,
  topUpUrl,
  walletForecast,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

@Injectable()
export class WalletBalanceTool implements AgentToolInterface {
  constructor(private _wallet: WalletService) {}
  name = 'walletBalance';

  run() {
    return createTool({
      id: 'walletBalance',
      description: `Get the workspace's available wallet credits: the balance, whether it is on pay-as-you-go, whether the wallet is frozen, the auto top-up settings, and whether the paid usage scheduled in the coming hours is covered (the window is "forecast.windowHours").
Pay-per-use features (such as some channels) are paid from these credits when each post is published, never when it is scheduled. A post whose credits are short when it is due does not go out.
For the transaction history call walletTransactions; for what things cost call walletPrices.`,
      inputSchema: z.object({}),
      mcp: {
        annotations: {
          title: 'Wallet Balance',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        usesWallet: z
          .boolean()
          .describe('False on a paid plan, which never uses credits'),
        message: z.string().optional(),
        balance: z.number().optional().describe('Credits, 2 decimals'),
        balanceText: z.string().optional(),
        payAsYouGo: z
          .boolean()
          .optional()
          .describe('True after the first top-up, while the wallet is not frozen'),
        frozen: z.boolean().optional(),
        autoTopUp: z
          .object({
            enabled: z.boolean(),
            belowCredits: z.number().nullable(),
            amount: z.string().nullable(),
            monthlyLimit: z.string().nullable(),
            usedThisMonth: z.string(),
            card: z.string().nullable(),
          })
          .optional(),
        forecast: z
          .object({
            windowHours: z.number(),
            neededCredits: z.number(),
            short: z.boolean(),
          })
          .nullable()
          .optional()
          .describe(
            'Paid usage scheduled in the coming hours; short means it is not covered by the balance and auto top-up'
          ),
        topUpUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = orgFromContext(context);
        if (!org?.id) {
          return {
            usesWallet: false,
            error: 'Could not read the account behind this connection.',
          };
        }
        if (onPaidPlan(org)) {
          return { usesWallet: false, message: notOnWalletMessage };
        }

        try {
          // Read fresh: the organization in the context is a snapshot taken
          // when the request came in.
          const [wallet, balance, payAsYouGo, forecast, spentAuto] =
            await Promise.all([
              this._wallet.getWallet(org.id),
              this._wallet.balance(org.id),
              this._wallet.isPayAsYouGo(org.id),
              walletForecast(this._wallet, org.id),
              this._wallet.autoTopUpSpentSince(
                org.id,
                dayjs().startOf('month').toDate()
              ),
            ]);
          const frozen = !!(wallet as any)?.frozenAt;
          const money = (amount?: number | null) =>
            amount === null || amount === undefined
              ? Promise.resolve(null)
              : this._wallet.formatMoney(amount).catch(() => null);

          const [amount, monthlyLimit, usedThisMonth] = await Promise.all([
            money(wallet?.autoTopUpAmount),
            money(wallet?.autoTopUpMonthlyCap),
            money(spentAuto || 0),
          ]);

          const short = !!forecast?.short;
          const message = frozen
            ? 'This wallet is frozen. Contact support to use it again.'
            : !payAsYouGo
            ? `This workspace is on the free plan. Top up the wallet to start pay-as-you-go and open the pay-per-use features: ${topUpUrl()}`
            : short
            ? `Scheduled usage in the next ${forecast!.windowHours} hours needs ${creditsText(
                forecast!.needed
              )}. You have ${creditsText(
                balance
              )}. Anything not covered won't go out. Top up: ${topUpUrl()}`
            : undefined;

          return {
            usesWallet: true,
            ...(message ? { message } : {}),
            balance: toCredits(balance),
            balanceText: creditsText(balance),
            payAsYouGo: payAsYouGo && !frozen,
            frozen,
            autoTopUp: {
              enabled: !!wallet?.autoTopUp,
              belowCredits:
                wallet?.autoTopUpThreshold === null ||
                wallet?.autoTopUpThreshold === undefined
                  ? null
                  : toCredits(wallet.autoTopUpThreshold),
              amount,
              monthlyLimit,
              usedThisMonth: usedThisMonth || '0',
              card: wallet?.cardLast4
                ? `${wallet.cardBrand || 'card'} ending ${wallet.cardLast4}`
                : null,
            },
            forecast: forecast
              ? {
                  windowHours: forecast.windowHours,
                  neededCredits: toCredits(forecast.needed),
                  short,
                }
              : null,
            ...(short || !payAsYouGo ? { topUpUrl: topUpUrl() } : {}),
          };
        } catch (err) {
          return {
            usesWallet: true,
            error: 'Could not read the wallet right now. Try again shortly.',
          };
        }
      },
    });
  }
}
