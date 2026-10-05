import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class FindSlotTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'findSlotTool';

  run() {
    return createTool({
      id: 'findSlotTool',
      description: `Find the next free time slot in the posting schedule, based on the times configured for the channel.
Use it when the user asks to post "at the next free slot" or doesn't give a date, then pass the returned date to integrationSchedulePostTool.`,
      mcp: {
        annotations: {
          title: 'Find Next Free Slot',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        integrationId: z
          .string()
          .optional()
          .describe(
            'Optional channel (integration) id from the integrationList tool, to use that channel own posting times'
          ),
      }),
      outputSchema: z.object({
        date: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          const date = await this._postsService.findFreeDateTime(
            organizationId,
            inputData.integrationId
          );

          return { date: String(date) };
        } catch (err) {
          return {
            error: `Failed to find a free slot: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
