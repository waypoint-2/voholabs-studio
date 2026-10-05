import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { BriefService } from '@gitroom/nestjs-libraries/database/prisma/brief/brief.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class BriefSaveTool implements AgentToolInterface {
  constructor(private _briefService: BriefService) {}
  name = 'briefSaveTool';

  run() {
    return createTool({
      id: 'briefSaveTool',
      description: `Write to the agent brief — the description of the business that steers everything published on its behalf.
"rules" replaces the whole document, so always read the document with briefListTool first and send back the existing rules plus your changes — anything you leave out is deleted.
Each rule is a heading and the plain text under it. Plain text means plain: no markdown, no HTML, no "#" headings, bullets, tables or bold. Anything sent as markup is stored and rendered literally, so it reads as broken rather than as formatting.
One rule holding a whole formatted document is the wrong shape. Split it into one rule per idea and let each heading do the work its markdown heading would have done — the headings are the document's structure.
Sources hold one document per source, not one document listing them all. A source is a single place the agent can read from, so give each its own short key and its own title ("forum", "discord", "notion"), and put its address in "links" with a note saying what the link is and when to use it. A source document with no links is nearly always a mistake, because the link is the source and the rules only say how to use it.
For Experience use briefLearnTool instead, which revises one lesson at a time rather than replacing the document, and needs no permission.
Use briefListTool for the list of valid categories and keys. Only documents in a category marked canCreate may be created with a new key; everything else must use a key that already exists.`,
      mcp: {
        annotations: {
          title: 'Write Agent Brief',
          readOnlyHint: false,
          // Replacing a document drops any rule left out of the call, so this
          // overwrites rather than accumulates.
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        category: z
          .string()
          .describe('foundation, sources or channels (from briefListTool)'),
        key: z
          .string()
          .describe(
            'The document key. For channels this is the integration id. For a source, invent a short unique key naming that one source ("forum", "notion"), and create a separate document per source rather than collecting them into one.'
          ),
        title: z
          .string()
          .optional()
          .describe('Name of the document. Only used by user-created sources.'),
        rules: z
          .array(
            z.object({
              heading: z.string().describe('What this rule is about'),
              body: z
                .string()
                .describe(
                  'The rule itself, as plain text. No markdown or HTML: it is stored and rendered as written.'
                ),
            })
          )
          .describe(
            'The complete set of rules for this document, one rule per idea. Anything omitted is removed.'
          ),
        links: z
          .array(
            z.object({
              url: z.string(),
              note: z
                .string()
                .optional()
                .describe('What this link is and how to use it'),
            })
          )
          .optional()
          .describe(
            'Only for documents in the sources category, where it is the substance rather than a decoration: the address the agent actually reads from. A source saved without one is a description of a source rather than a source.'
          ),
      }),
      outputSchema: z.object({
        saved: z.boolean().optional(),
        category: z.string().optional(),
        key: z.string().optional(),
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

          const saved = await this._briefService.saveDocument(
            organizationId,
            inputData.category,
            inputData.key,
            {
              ...(inputData.title !== undefined
                ? { title: inputData.title }
                : {}),
              blocks: inputData.rules.map((rule) => ({
                id: makeId(10),
                heading: rule.heading,
                body: rule.body,
              })),
              ...(inputData.links
                ? {
                    links: inputData.links.map((link) => ({
                      id: makeId(10),
                      url: link.url,
                      note: link.note || '',
                    })),
                  }
                : {}),
            }
          );

          return {
            saved: true,
            category: saved.category,
            key: saved.key,
            rules: saved.content.blocks.length,
          };
        } catch (err) {
          return {
            error: `Failed to write the brief: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
