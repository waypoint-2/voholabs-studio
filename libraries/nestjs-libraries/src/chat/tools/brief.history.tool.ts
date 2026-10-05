import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { BriefRevisionService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief-revision.service';

@Injectable()
export class BriefHistoryTool implements AgentToolInterface {
  constructor(private _briefRevisionService: BriefRevisionService) {}
  name = 'briefHistory';

  run() {
    return createTool({
      id: 'briefHistory',
      description: `See what has changed in the agent brief since it was last marked as reviewed. Who made a change is not recorded, so this includes notes you wrote yourself — read a document before drawing a lesson from it, or you will be learning from your own writing.
What matters is a rule that came back different from how you left it: that is somebody telling you the rule was wrong, and their version is the one to keep. Never restore what they removed.
Returns one entry per document, with the rules added, removed or rewritten. Removed words are marked [-like this-] and added words {+like this+}.
Work out what the change implies beyond the document it happened in, write that down with briefLearnTool, then call markLearned with kind "brief" and the ids returned here, so the same edit is not reviewed again.`,
      mcp: {
        annotations: {
          title: 'Review Brief Edits',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        category: z
          .string()
          .optional()
          .describe('Only this category, e.g. "experience" or "foundation"'),
        key: z.string().optional().describe('Only this document key'),
        includeLearned: z
          .boolean()
          .optional()
          .describe(
            'Also return documents already marked as learned from (default false)'
          ),
      }),
      outputSchema: z.object({
        total: z.number().optional(),
        documents: z
          .array(
            z.object({
              id: z.string(),
              category: z.string(),
              key: z.string(),
              editedAt: z.string(),
              learned: z.boolean(),
              change: z
                .enum(['created', 'edited', 'deleted'])
                .describe(
                  'created: written for the first time. deleted: the document was removed (a deleted source keeps only its name). edited: anything else.'
                ),
              rulesAdded: z.array(z.string()),
              rulesRemoved: z.array(z.string()),
              rulesEdited: z.array(
                z.object({ heading: z.string(), diff: z.string() })
              ),
              alsoChanged: z.array(z.string()),
            })
          )
          .optional(),
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

          const queue = await this._briefRevisionService.getLearningQueue(
            organizationId,
            {
              category: inputData.category,
              key: inputData.key,
              includeLearned: inputData.includeLearned,
            }
          );

          const documents = queue.map((entry) => ({
            id: entry.id,
            category: entry.category,
            key: entry.key,
            editedAt: entry.editedAt.toISOString(),
            learned: entry.learned,
            change: entry.change,
            rulesAdded: entry.diff.blocksAdded,
            rulesRemoved: entry.diff.blocksRemoved,
            rulesEdited: entry.diff.blocksEdited,
            alsoChanged: entry.diff.changed,
          }));

          return { total: documents.length, documents };
        } catch (err) {
          return {
            error: `Failed to read brief history: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
