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
export class BriefAssetTool implements AgentToolInterface {
  constructor(private _briefService: BriefService) {}
  name = 'briefAssetTool';

  run() {
    return createTool({
      id: 'briefAssetTool',
      description: `Register a brand file — a logo, a product shot, a video — in Branding & assets, so it is on hand the next time something is made for this brand.
Get the file into the media library first (uploadFromUrlTool, uploadMediaTool or createUploadLinkTool) and pass the "path" it returns as the url. Files uploaded that way already live in the account's own storage.
Always write a note saying when to reach for this file and when not to — a logo on a dark background, a shot that is only for launches, a video that must never be cropped. A file with no note is nearly useless later.`,
      mcp: {
        annotations: {
          title: 'Register Brand Asset',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        action: z
          .enum(['add', 'remove'])
          .optional()
          .describe(
            'add (the default) registers a file; remove takes the files in "assetIds" off'
          ),
        name: z
          .string()
          .optional()
          .describe('What this file is called. Required to add.'),
        url: z
          .string()
          .optional()
          .describe(
            'The media library path, or a URL the file already lives at. Required to add.'
          ),
        mime: z
          .string()
          .optional()
          .describe('Content type, e.g. image/png or video/mp4'),
        note: z
          .string()
          .optional()
          .describe('When to use this file, and when not to. Required to add.'),
        assetIds: z
          .array(z.string())
          .optional()
          .describe(
            'For remove: the ids of the files to take off, from briefListTool'
          ),
      }),
      outputSchema: z.object({
        registered: z.boolean().optional(),
        removed: z.array(z.string()).optional(),
        notFound: z
          .array(z.string())
          .optional()
          .describe('Ids asked to remove that are not on the document'),
        assets: z.number().optional(),
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

          if (inputData.action === 'remove') {
            if (!inputData.assetIds?.length) {
              return {
                error:
                  'Pass "assetIds" with the ids of the files to remove (from briefListTool).',
              };
            }
            const result = await this._briefService.removeAssets(
              organizationId,
              inputData.assetIds
            );
            return {
              removed: result.removed,
              ...(result.notFound.length ? { notFound: result.notFound } : {}),
              assets: result.assets,
            };
          }

          if (!inputData.name || !inputData.url || !inputData.note) {
            return {
              error:
                'To add a file pass "name", "url" and "note" (when to use it, and when not to).',
            };
          }

          const saved = await this._briefService.registerAsset(organizationId, {
            name: inputData.name,
            url: inputData.url,
            mime: inputData.mime,
            note: inputData.note,
          });

          return { registered: true, assets: saved.assets };
        } catch (err) {
          return {
            error: `Failed to update the brand files: ${
              err instanceof Error ? err.message : 'Unexpected error'
            }`,
          };
        }
      },
    });
  }
}
