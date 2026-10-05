import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';

@Injectable()
export class BriefLearnTool implements AgentToolInterface {
  constructor(private _briefService: BriefService) {}
  name = 'briefLearnTool';

  run() {
    return createTool({
      id: 'briefLearnTool',
      description: `Record something you have learned about what works for this brand, in the Experience section of the agent brief.
Experience is your own notebook, not the user's instructions, so unlike the rest of the brief you may write here without asking permission first. Say afterwards what you noted. The user can edit what you wrote, so treat a changed lesson as a correction and keep to it.
Write one lesson per call. Give it a heading you will recognise again — writing the same heading twice revises what is there instead of adding a duplicate, which is how a lesson gets sharper over time rather than piling up.
Record what you actually observed, in a form that changes a future decision: what was tried, what happened, and what to do differently. Do not record the user's instructions here — those belong to the Foundation and are theirs to write.
Group related lessons by using the same "topic": one document per channel, per format, per campaign, or whatever division earns its keep.`,
      mcp: {
        annotations: {
          title: 'Record Agent Experience',
          readOnlyHint: false,
          // Revising a lesson replaces that one lesson, never the document.
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        topic: z
          .string()
          .describe(
            'Short stable id for the document this lesson belongs in, e.g. "linkedin" or "launch-posts". Reuse it to keep related lessons together.'
          ),
        title: z
          .string()
          .optional()
          .describe('Human name for the document, set the first time you use a topic.'),
        heading: z
          .string()
          .describe(
            'What the lesson is about. Reusing a heading revises that lesson.'
          ),
        lesson: z
          .string()
          .describe(
            'The lesson as plain text: what was tried, what happened, what to do next time.'
          ),
      }),
      outputSchema: z.object({
        recorded: z.boolean().optional(),
        revised: z.boolean().optional(),
        topic: z.string().optional(),
        rules: z.number().optional(),
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

          const saved = await this._briefService.recordExperience(
            organizationId,
            inputData.topic,
            { heading: inputData.heading, body: inputData.lesson },
            inputData.title
          );

          return {
            recorded: true,
            revised: saved.revised,
            topic: saved.key,
            rules: saved.rules,
          };
        } catch (err) {
          return {
            error: `Failed to record the lesson: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
