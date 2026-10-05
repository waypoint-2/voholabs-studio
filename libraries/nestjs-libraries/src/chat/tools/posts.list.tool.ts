import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readPostMedia } from '@gitroom/nestjs-libraries/chat/tools/post.write.shared';
import { guessMimeFromPath } from '@gitroom/nestjs-libraries/chat/tools/media.preview.helper';
import {
  describePostError,
  errorMessageForAgent,
  POST_ERROR_KINDS,
} from '@gitroom/nestjs-libraries/chat/tools/post.error.shared';
import {
  onPaidPlan,
  orgFromContext,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

const DEFAULT_RANGE_IN_DAYS = 30;

const parseSettings = (settings?: string | null) => {
  try {
    return JSON.parse(settings || '{}') || {};
  } catch (err) {
    return {};
  }
};

@Injectable()
export class PostsListTool implements AgentToolInterface {
  constructor(
    private _postsService: PostsService,
    private _mediaService: MediaService
  ) {}
  name = 'postsList';

  run() {
    return createTool({
      id: 'postsList',
      description: `List the posts already on the calendar between two dates, so you can tell the user what is scheduled or find the post they want to change or delete.
Dates are UTC ISO strings. If you don't pass any, it defaults to the next ${DEFAULT_RANGE_IN_DAYS} days — pass a start date in the past to look at posts that were already published.
Every post returns both an "id" and a "group": the group holds a post together with its thread items and comments, and is what deletePostTool removes.
Every post also returns "attachments" — the media it carries, with the same "path" the media library uses. That is how you tell whether a post already has its image or video on it, without opening anything.
A thread comes back whole: "comments" lists the items that follow the post, in order, each with its own text and attachments. Their position in that list is the "commentIndex" replacePostAsset takes, so this is where you find which item carries the image you were asked to change.
TO GET AT the media rather than just know it exists, pass the "path" values to mediaPreview: it returns a loadable resource link per item, in slide order, for video as well as images. A link is not a picture — download each one yourself and show the downloaded asset in your response; do not stop at printing the link or its name, that leaves the user with nothing to look at. Nothing is inlined and nothing is re-encoded, so what you download is the real thing at full quality. Each attachment also carries "mediaId", "originalName" and a "mimeType" hint, so you can tell a video from an image before you load anything.
TO CHANGE A POST, use editPostTool with its "id". It edits in place and keeps whatever you do not pass, attachments included. Deleting and re-creating a post is not the way to reword it: it loses the media, the post's history and its id.

Every post returns its "settings" too — the channel options it was scheduled with, such as which Discord channel it goes to or an X post's reply permissions and AI-disclosure flags. That is what you read back when you need to know how a post is configured, and what editPostTool merges into rather than replacing.

TO LINK ONE POST TO ANOTHER (echoing a post to another channel): every post here returns a "linkReference" like "(post:<id>)". Put that string in another post's content and it is replaced with this post's real URL at the moment that post publishes. It works while "releaseURL" is still null - a queued post has no URL yet, and that is exactly the case this is for. Never copy "releaseURL" to build an echo; use "linkReference".
"references" lists the posts THIS one points at. A chain is only as good as its links: if a post it references is deleted, the reference can never resolve and this post fails at publish time instead of going out with a broken link — a silent no-show. So edit posts rather than deleting them, and check what a delete would break before you run it (deletePostTool refuses and names them).`,
      mcp: {
        annotations: {
          title: 'List Scheduled Posts',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('Start of the range, UTC ISO date (defaults to now)'),
        endDate: z
          .string()
          .optional()
          .describe(
            `End of the range, UTC ISO date (defaults to ${DEFAULT_RANGE_IN_DAYS} days from now)`
          ),
        customer: z
          .string()
          .optional()
          .describe(
            'Optional group (customer) id from the groupList tool, to only list posts of that customer'
          ),
        state: z
          .enum(['QUEUE', 'PUBLISHED', 'ERROR', 'DRAFT'])
          .optional()
          .describe('Only list posts in this state. Omit for every state.'),
      }),
      outputSchema: z.object({
        total: z.number().optional(),
        posts: z
          .array(
            z.object({
              id: z.string(),
              group: z.string().nullable(),
              state: z.string(),
              publishDate: z.string(),
              content: z.string(),
              releaseURL: z.string().nullable(),
              error: z
                .string()
                .nullable()
                .optional()
                .describe(
                  'Why the post failed to publish, when it did, in one short line'
                ),
              errorKind: z
                .enum(POST_ERROR_KINDS)
                .nullable()
                .optional()
                .describe(
                  'Why it failed: wallet, refresh_needed, channel_disabled, reference, provider or unknown. Null when it did not fail.'
                ),
              attachments: z
                .array(
                  z.object({
                    path: z
                      .string()
                      .describe(
                        "The media path — the same value mediaList returns and an attachments field takes. Pass this to mediaPreview for a loadable reference to the asset, or hand it to an external image/video tool's import-by-URL step to edit it. The edited result must come back through uploadFromUrlTool before it can be attached — attach the path uploadFromUrlTool returns, never the external tool's own URL."
                      ),
                    thumbnail: z.string().nullable(),
                    mediaId: z
                      .string()
                      .nullable()
                      .describe(
                        'The media library id, when this attachment still resolves to a library row. Null for one that has since been deleted from the library — the path is still loadable.'
                      ),
                    originalName: z.string().nullable(),
                    mimeType: z
                      .string()
                      .nullable()
                      .describe(
                        'Best-effort type from the file extension, for telling an image from a video before loading it. The authoritative type is the Content-Type you get when you load the URL.'
                      ),
                  })
                )
                .describe('The images and videos attached to this post'),
              comments: z
                .array(
                  z.object({
                    id: z.string(),
                    content: z.string(),
                    attachments: z
                      .array(
                        z.object({
                          path: z.string(),
                          thumbnail: z.string().nullable(),
                          mediaId: z.string().nullable(),
                          originalName: z.string().nullable(),
                          mimeType: z.string().nullable(),
                        })
                      )
                      .describe('The images and videos on this thread item'),
                  })
                )
                .describe(
                  "The thread items that follow this post, in order. Their position here IS the \"commentIndex\" replacePostAsset takes, and the list editPostTool's \"comments\" field replaces wholesale. Empty for a post that is not a thread."
                ),
              settings: z
                .record(z.any())
                .describe(
                  'The channel settings this post was scheduled with (Discord channel, X reply permissions, AI disclosure, and so on)'
                ),
              references: z
                .array(z.string())
                .describe(
                  'Ids of the posts this one embeds a live URL of. If one of them is deleted, this post fails at publish time rather than going out.'
                ),
              linkReference: z
                .string()
                .describe(
                  "Paste this into ANOTHER post's content to embed this post's URL. It is replaced with the real URL when that post publishes, so it works even while releaseURL is still null. Use it instead of releaseURL to link one post to another."
                ),
              channel: z.object({
                id: z.string(),
                name: z.string(),
                platform: z.string(),
              }),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        // A paid plan gets the list as it always had it: no failure reasons.
        const paidPlan = onPaidPlan(orgFromContext(context));
        try {
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          const startDate = inputData.startDate || new Date().toISOString();
          const endDate =
            inputData.endDate ||
            new Date(
              Date.now() + DEFAULT_RANGE_IN_DAYS * 24 * 60 * 60 * 1000
            ).toISOString();

          const posts = await this._postsService.getPosts(
            organizationId,
            {
              startDate,
              endDate,
              customer: inputData.customer,
            },
            {
              includeMedia: true,
              includeSettings: true,
              includeThread: true,
              ...(paidPlan ? {} : { includeError: true }),
            }
          );

          const inState = (posts || []).filter(
            (post: any) => !inputData.state || post.state === inputData.state
          );

          // One lookup for every attachment across the whole page, rather than
          // a query per post. Attachments are stored as bare paths (a post's
          // `image` entries carry no media-library id), so the path is what
          // links them back to the library row and its name.
          // A thread arrives as a chain of single children; flatten it to the
          // list an agent can index into, which is what replacePostAsset's
          // commentIndex counts and what editPostTool's "comments" replaces.
          const threadOf = (post: any): any[] => {
            const items: any[] = [];
            let node = post?.childrenPost?.[0];
            while (node) {
              items.push(node);
              node = node?.childrenPost?.[0];
            }
            return items;
          };

          const allPaths = Array.from(
            new Set(
              inState.flatMap((post: any) =>
                [post, ...threadOf(post)].flatMap((entry: any) =>
                  readPostMedia(entry)
                    .map((media: any) => media?.path)
                    .filter(Boolean)
                )
              )
            )
          ) as string[];

          const mediaByPath = new Map<string, any>(
            (
              await this._mediaService.getMediaByPathsForOrg(
                organizationId,
                allPaths
              )
            ).map((row: any) => [row.path, row])
          );

          const describeAttachments = (entry: any) =>
            readPostMedia(entry).map((media: any) => {
              const path = media?.path || '';
              const row = mediaByPath.get(path);
              return {
                path,
                // A video's thumbnail is stored on the post entry; fall back to
                // the library row for anything scheduled before that was kept.
                thumbnail: media?.thumbnail ?? row?.thumbnail ?? null,
                mediaId: row?.id ?? null,
                originalName: row?.originalName ?? null,
                mimeType: guessMimeFromPath(path),
              };
            });

          const output = inState.map((post: any) => ({
            id: post.id,
            group: post.group ?? null,
            state: post.state,
            publishDate: new Date(post.publishDate).toISOString(),
            content: post.content || '',
            releaseURL: post.releaseURL ?? null,
            ...(paidPlan ? {} : describePostError(post.error, post.errorKind)),
            attachments: describeAttachments(post),
            comments: threadOf(post).map((item: any) => ({
              id: item.id,
              content: item.content || '',
              attachments: describeAttachments(item),
            })),
            settings: parseSettings(post.settings),
            references: this._postsService.extractPostReferences(
              `${post.content || ''}${post.settings || ''}`
            ),
            linkReference: `(post:${post.id})`,
            channel: {
              id: post.integration?.id || '',
              name: post.integration?.name || '',
              platform: post.integration?.providerIdentifier || '',
            },
          }));

          return { total: output.length, posts: output };
        } catch (err) {
          return {
            error: `Failed to list posts: ${
              paidPlan
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
