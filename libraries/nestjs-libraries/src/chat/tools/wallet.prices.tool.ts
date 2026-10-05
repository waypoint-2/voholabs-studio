import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  freeAllowance,
  monthlyRules,
  notOnWalletMessage,
  onPaidPlan,
  orgFromContext,
  priceText,
  pricingModel,
  sectionLabel,
  toCredits,
  topUpUrl,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

@Injectable()
export class WalletPricesTool implements AgentToolInterface {
  constructor(private _wallet: WalletService) {}
  name = 'walletPrices';

  run() {
    return createTool({
      id: 'walletPrices',
      description: `Get the wallet price list: everything that costs credits or opens after the first top-up, grouped into sections, with how each is charged, what is included free and its price in credits.
Prices change over time, so always read them here rather than quoting them from memory. Pass provider (e.g. "x") to see only one provider's rows. Channels not listed are free to use.`,
      inputSchema: z.object({
        provider: z
          .string()
          .optional()
          .describe('Only the rows for this provider, e.g. "x"'),
      }),
      mcp: {
        annotations: {
          title: 'Wallet Prices',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        sections: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            items: z.array(
              z.object({
                key: z.string(),
                name: z.string(),
                description: z.string().nullable(),
                provider: z.string(),
                pricingModel: z.string(),
                includedFree: z.string(),
                price: z.string(),
                credits: z.number().describe('Price of one unit, 2 decimals'),
                howCharged: z.string().optional(),
              })
            ),
          })
        ),
        topUpUrl: z.string().optional(),
        message: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = orgFromContext(context);
        if (!org?.id) {
          return {
            sections: [],
            error: 'Could not read the account behind this connection.',
          };
        }
        if (onPaidPlan(org)) {
          return { sections: [], message: notOnWalletMessage };
        }

        try {
          const sections = await this._wallet.priceSections(
            inputData.provider?.toLowerCase() || undefined
          );
          return {
            sections: sections.map((section) => ({
              key: section.key,
              label: sectionLabel(section.key),
              items: section.actions.map((a) => ({
                key: a.key,
                name: a.name,
                description: a.description,
                provider: a.provider,
                pricingModel: pricingModel(a),
                includedFree: freeAllowance(a),
                price: priceText(a),
                credits: toCredits(a.price),
                ...(a.billing === 'MONTHLY'
                  ? { howCharged: monthlyRules(a) }
                  : {}),
              })),
            })),
            topUpUrl: topUpUrl(),
          };
        } catch (err) {
          return {
            sections: [],
            error: 'Could not read the price list right now. Try again shortly.',
          };
        }
      },
    });
  }
}
