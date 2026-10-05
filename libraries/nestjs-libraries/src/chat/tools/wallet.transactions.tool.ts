import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  notOnWalletMessage,
  onPaidPlan,
  orgFromContext,
  toCredits,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

@Injectable()
export class WalletTransactionsTool implements AgentToolInterface {
  constructor(private _wallet: WalletService) {}
  name = 'walletTransactions';

  run() {
    return createTool({
      id: 'walletTransactions',
      description: `List the workspace's wallet credit transactions (top-ups, charges, refunds, grants, adjustments), newest first. Paginated: if next_cursor is not null, pass it as cursor to get the next page.
Credits are signed: positive adds to the balance, negative spends. For the current balance call walletBalance.`,
      inputSchema: z.object({
        cursor: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Pass next_cursor from the previous response to fetch the next page'),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of transactions per page (1-100, default 10)'),
      }),
      mcp: {
        annotations: {
          title: 'Wallet Transactions',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        items: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            credits: z
              .number()
              .describe('Signed credits, 2 decimals: positive adds, negative spends'),
            type: z.string(),
            quantity: z.number(),
            time: z.string().describe('ISO time'),
          })
        ),
        next_cursor: z.number().nullable(),
        total: z.number().optional(),
        message: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = orgFromContext(context);
        if (!org?.id) {
          return {
            items: [],
            next_cursor: null,
            error: 'Could not read the account behind this connection.',
          };
        }
        if (onPaidPlan(org)) {
          return { items: [], next_cursor: null, message: notOnWalletMessage };
        }

        const page = inputData.cursor ?? 0;
        const size = inputData.size ?? 10;
        try {
          const [entries, total] = await this._wallet.entries(
            org.id,
            page,
            size
          );
          return {
            items: entries.map((e) => ({
              id: e.id,
              name: e.description || e.actionKey || e.type,
              credits: toCredits(e.amount),
              type: e.type,
              quantity: e.quantity,
              time: new Date(e.createdAt).toISOString(),
            })),
            next_cursor: (page + 1) * size < total ? page + 1 : null,
            total,
          };
        } catch (err) {
          return {
            items: [],
            next_cursor: null,
            error: 'Could not read the wallet right now. Try again shortly.',
          };
        }
      },
    });
  }
}
