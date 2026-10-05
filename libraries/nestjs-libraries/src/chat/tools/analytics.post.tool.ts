import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  onPaidPlan,
  orgFromContext,
  walletRefusal,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

@Injectable()
export class AnalyticsPostTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postAnalyticsTool';

  run() {
    return createTool({
      id: 'postAnalyticsTool',
      description: `How one published post performed: likes, comments, shares, impressions and whatever else that network reports for a single post.
Use postsList first to get the post id. Only published posts have analytics; a queued or draft post has nothing to report yet.
A post can come back marked "missing", which means it was published but is not linked to the message on the network, so the network cannot be asked about it. That is fixable by connecting its release id, not a failure of this tool.
What comes back differs by network. Read the labels rather than assuming a fixed set, and say which network the numbers came from.`,
      mcp: {
        annotations: {
          title: 'Post Analytics',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        id: z.string().describe('The post id, from postsList'),
        days: z
          .number()
          .optional()
          .describe('How many days back to look. Defaults to 30.'),
        fresh: z
          .boolean()
          .optional()
          .describe(
            'Accepted for symmetry: post analytics are always read live'
          ),
      }),
      outputSchema: z.object({
        analytics: z.any().optional(),
        cachedAt: z.string().nullable().optional(),
        note: z.string().optional(),
        missingReleaseId: z.boolean().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          const analytics = await this._postsService.checkPostAnalytics(
            organizationId,
            inputData.id,
            inputData.days ?? 30
          );

          if (analytics && (analytics as { missing?: true }).missing) {
            return {
              missingReleaseId: true,
              error:
                'This post was published but is not linked to the message on the network, so its performance cannot be read. Connect its release id first.',
            };
          }

          if (!Array.isArray(analytics) || !analytics.length) {
            return {
              analytics: [],
              error:
                'No analytics for this post. It may not be published yet, or the network reports none for this post type.',
            };
          }

          // A paid plan gets the answer as it always had it.
          if (onPaidPlan(orgFromContext(context))) {
            return { analytics };
          }
          return {
            analytics,
            cachedAt: null,
            note: 'Read from the network just now (post analytics are not cached).',
          };
        } catch (err) {
          // Not enough wallet credits: the reason and the top-up link, not a
          // tool failure. The network was not asked.
          const refusal = walletRefusal(err);
          if (refusal) {
            return { error: refusal };
          }
          return {
            error: `Failed to read post analytics: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
