import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  onPaidPlan,
  walletRefusal,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { Organization } from '@prisma/client';

@Injectable()
export class AnalyticsChannelTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'channelAnalyticsTool';

  run() {
    return createTool({
      id: 'channelAnalyticsTool',
      description: `How a channel itself is doing: followers, impressions, engagement and whatever else that network reports about the account.
Use integrationList first to get the channel id. Only social channels report analytics; publishing platforms such as a blog or a newsletter return nothing, which is expected rather than an error.
What comes back differs by network, because each one exposes its own metrics. Read the labels rather than assuming a fixed set, and say which network the numbers came from.
Numbers can be a day or two behind what the network's own dashboard shows, so do not present them as live.`,
      mcp: {
        annotations: {
          title: 'Channel Analytics',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        id: z.string().describe('The channel id, from integrationList'),
        days: z
          .number()
          .optional()
          .describe('How many days back to look. Defaults to 30.'),
        fresh: z
          .boolean()
          .optional()
          .describe(
            'Skip the cache and read the network again (may charge post reads on a wallet workspace)'
          ),
      }),
      outputSchema: z.object({
        analytics: z.any().optional(),
        cachedAt: z
          .string()
          .nullable()
          .optional()
          .describe('When these numbers were read from the network (ISO time)'),
        note: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const organization = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ) as Organization;

          const date = String(inputData.days ?? 30);

          // A paid plan reads analytics as it always did: the one-hour
          // cache, no refresh, no cache dates.
          if (onPaidPlan(organization)) {
            const analytics = await this._integrationService.checkAnalytics(
              organization,
              inputData.id,
              date
            );
            if (!analytics?.length) {
              return {
                analytics: [],
                error:
                  'No analytics for this channel. Either the network reports none for this account type, or it is a publishing platform rather than a social one.',
              };
            }
            return { analytics };
          }
          const cachedBefore = inputData.fresh
            ? null
            : await this._integrationService.analyticsUpdatedAt(
                organization.id,
                inputData.id,
                date
              );
          const analytics = await this._integrationService.checkAnalytics(
            organization,
            inputData.id,
            date,
            false,
            !!inputData.fresh
          );
          const cachedAt =
            cachedBefore ||
            (await this._integrationService.analyticsUpdatedAt(
              organization.id,
              inputData.id,
              date
            ));
          const note = cachedBefore
            ? `From the cache, read from the network at ${cachedBefore}. Pass fresh: true for newer numbers.`
            : 'Read from the network just now.';

          if (!analytics?.length) {
            return {
              analytics: [],
              error:
                'No analytics for this channel. Either the network reports none for this account type, or it is a publishing platform rather than a social one.',
            };
          }

          return { analytics, cachedAt, note };
        } catch (err) {
          // Not enough wallet credits: the reason and the top-up link, not a
          // tool failure. The network was not asked.
          const refusal = walletRefusal(err);
          if (refusal) {
            return { error: refusal };
          }
          return {
            error: `Failed to read channel analytics: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
