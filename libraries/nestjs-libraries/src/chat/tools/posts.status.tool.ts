import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { errorMessageForAgent } from '@gitroom/nestjs-libraries/chat/tools/post.error.shared';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  addPendingWalletPost,
  walletRefusal,
  onPaidPlan,
  orgFromContext,
  PendingWalletPosts,
  toCredits,
  walletPostCost,
  walletWarning,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

@Injectable()
export class PostsStatusTool implements AgentToolInterface {
  constructor(
    private _postsService: PostsService,
    private _walletService: WalletService
  ) {}
  name = 'postStatusTool';

  // What a post put back on the schedule will take from the wallet, and the
  // warning when the credits will not cover it. Read before the post is
  // queued, so the forecast does not already count it. Never blocks.
  private async walletLine(organization: any, id: string) {
    try {
      const posts = await this._postsService.getPostsRecursively(
        id,
        true,
        organization?.id,
        true
      );
      const identifier = (posts?.[0] as any)?.integration?.providerIdentifier;
      if (!identifier) {
        return {};
      }
      const contents = posts.map((p) => p.content || '');
      const cost = await walletPostCost(
        this._walletService,
        organization,
        identifier,
        contents
      );
      if (cost === undefined) {
        return {};
      }
      const pending: PendingWalletPosts = new Map();
      // Already queued: the forecast counts it, so counting it here again
      // would warn about credits it does not need.
      if (posts[0].state !== 'QUEUE') {
        addPendingWalletPost(pending, identifier, contents, cost);
      }
      const warning = await walletWarning(
        this._walletService,
        organization.id,
        pending
      );
      return {
        cost: toCredits(cost),
        ...(warning ? { walletWarning: warning } : {}),
      };
    } catch (err) {
      return {};
    }
  }

  run() {
    return createTool({
      id: 'postStatusTool',
      description: `Move a post between draft and the schedule.
Setting it to DRAFT takes a queued post off the schedule so it will not publish, without deleting it. Setting it to QUEUE puts a draft back on the schedule at its existing time, so check that time is still in the future before doing it, or it may go out immediately.
Use postsList to find the post. This does nothing to a post that has already been published.`,
      mcp: {
        annotations: {
          title: 'Change Post Status',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        id: z.string().describe('The post id, from postsList'),
        status: z
          .enum(['QUEUE', 'DRAFT'])
          .describe('QUEUE puts it on the schedule, DRAFT takes it off'),
      }),
      outputSchema: z.object({
        changed: z.boolean().optional(),
        status: z.string().optional(),
        cost: z
          .number()
          .optional()
          .describe(
            'Credits taken from the wallet for this post and its replies, now, as it goes on the schedule'
          ),
        walletWarning: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const organization = orgFromContext(context);
          const organizationId = organization.id;

          // A paid plan never pays from the wallet: nothing to add.
          const paidPlan = onPaidPlan(organization);
          const wallet =
            inputData.status === 'QUEUE' && !paidPlan
              ? await this.walletLine(organization, inputData.id)
              : {};

          // changePostStatus takes 'draft' | 'schedule'.
          await this._postsService.changePostStatus(
            organizationId,
            inputData.id,
            inputData.status === 'DRAFT' ? 'draft' : 'schedule'
          );

          return { changed: true, status: inputData.status, ...wallet };
        } catch (err) {
          const refusal = walletRefusal(err);
          if (refusal) {
            return { error: refusal };
          }
          return {
            error: `Failed to change the post status: ${
              onPaidPlan(orgFromContext(context))
                ? err instanceof Error
                  ? err.message
                  : 'Unexpected error'
                : errorMessageForAgent(err)
            }`,
          };
        }
      },
    });
  }
}
