import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { PostRevisionService } from '@gitroom/nestjs-libraries/database/prisma/post-revisions/post-revision.service';
import { BriefRevisionService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief-revision.service';

@Injectable()
export class MarkLearnedTool implements AgentToolInterface {
  constructor(
    private _postRevisionService: PostRevisionService,
    private _briefRevisionService: BriefRevisionService
  ) {}
  name = 'markLearned';

  run() {
    return createTool({
      id: 'markLearned',
      description: `Close off edits you have finished learning from, so postHistory and briefHistory stop showing them to you.
Mark several at once when one lesson covers them — that is the normal case, since a habit shows up across several posts before it is worth writing down.
Use outcome RECORDED once the lesson is actually saved with briefLearnTool, and pass the same topic you used, so you can come back to that document and sharpen the lesson instead of writing a second one about the same thing. Use NO_SIGNAL when there was nothing to learn: a typo, a formatting fix, a detail that will not come up again. Do not leave those unmarked — an unmarked edit comes back forever.`,
      mcp: {
        annotations: {
          title: 'Mark Edits As Learned From',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        kind: z
          .enum(['post', 'brief'])
          .describe('Which queue these ids came from'),
        ids: z
          .array(z.string())
          .min(1)
          .max(25)
          .describe(
            'chainId values from postHistory, or id values ("category/key") from briefHistory'
          ),
        outcome: z
          .enum(['RECORDED', 'NO_SIGNAL'])
          .describe(
            'RECORDED when you saved a lesson from this, NO_SIGNAL when there was nothing to learn'
          ),
        topic: z
          .string()
          .optional()
          .describe(
            'The briefLearnTool topic the lesson went into, when the outcome is RECORDED'
          ),
      }),
      outputSchema: z.object({
        marked: z.number().optional(),
        notFound: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const blocked = paidOnly(context, 'The agent brief', 'brief');
        if (blocked) {
          return { error: blocked };
        }
        try {
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          if (inputData.kind === 'brief') {
            const marked = await this._briefRevisionService.markLearned(
              organizationId,
              inputData.ids,
              inputData.outcome
            );

            return {
              marked: marked.length,
              notFound: inputData.ids.filter(
                (id: string) => !marked.includes(id)
              ),
            };
          }

          const { count, notFound } =
            await this._postRevisionService.markLearned(
              organizationId,
              inputData.ids,
              inputData.outcome,
              inputData.topic
            );

          return { marked: count, notFound };
        } catch (err) {
          return {
            error: `Failed to mark as learned: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
