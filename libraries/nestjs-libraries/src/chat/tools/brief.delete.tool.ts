import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';
import { hasAccess } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';

@Injectable()
export class BriefDeleteTool implements AgentToolInterface {
  constructor(private _briefService: BriefService) {}
  name = 'briefDeleteTool';

  run() {
    return createTool({
      id: 'briefDeleteTool',
      description: `Delete a document from the agent brief, with everything written in it. This cannot be undone, so say what you are removing.
Only user-created documents and your own Experience can be deleted. The Foundation documents and the per-channel documents are part of the product and will be refused; to empty one of those, use briefSaveTool with an empty list of rules instead.
Retire an Experience document when what is in it turned out to be wrong or no longer applies. A lesson you no longer stand behind is worse than no lesson.`,
      mcp: {
        annotations: {
          title: 'Delete Agent Brief Document',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        category: z.string().describe('The category of the document'),
        key: z.string().describe('The key of the document to delete'),
      }),
      outputSchema: z.object({
        deleted: z.boolean().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const blocked = paidOnly(context, 'The agent brief', 'brief');
        if (blocked) {
          return { error: blocked };
        }
        try {
          const organization = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          );

          // A paid plan is answered as before: a delete of a document that
          // is not there reports deleted.
          const { deleted } = await this._briefService.deleteDocument(
            organization.id,
            inputData.category,
            inputData.key,
            true,
            false,
            !hasAccess(organization)
          );

          if (!deleted) {
            return {
              deleted: false,
              error: `There is no "${inputData.key}" document in ${inputData.category}, so nothing was deleted. briefListTool lists the documents that exist.`,
            };
          }

          return { deleted: true };
        } catch (err) {
          return {
            error: `Failed to delete the document: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
