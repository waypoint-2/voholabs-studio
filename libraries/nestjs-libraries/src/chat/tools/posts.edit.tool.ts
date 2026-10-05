import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { AllProvidersSettings } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { errorMessageForAgent } from '@gitroom/nestjs-libraries/chat/tools/post.error.shared';
import {
  attachmentUrl,
  describeMedia,
  hostExternalAttachments,
  mediaOutput,
  readPostMedia,
  withPostLinks,
} from '@gitroom/nestjs-libraries/chat/tools/post.write.shared';
import {
  onPaidPlan,
  orgFromContext,
  walletRefusal,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

@Injectable()
export class PostsEditTool implements AgentToolInterface {
  constructor(
    private _postsService: PostsService,
    private _mediaService: MediaService
  ) {}
  name = 'editPostTool';

  run() {
    return createTool({
      id: 'editPostTool',
      description: `Change a post that is already on the calendar, in place. Use postsList to find it, then pass its "id".
This is how you rewrite a post's text — never delete and re-create it for that. The post keeps its id, its channel, its settings and, above all, its attachments: anything you do not pass is left exactly as it was, so editing the words of a post that carries a video keeps that video on it.
Pass only what changes. "content" replaces the text of the post itself; "comments" replaces the thread items / comments after it; "attachments" replaces the media on the post; "date" moves it; "settings" is merged over the settings it already has, so you can fix one key without resending the rest.
The output reports the post as it now stands, including its attachments, so you can confirm the media survived.

What it does to the schedule:
- A queued post stays queued and its publishing job is rebuilt around the new content. If its date has already passed, it can go out immediately — pass a future "date" if you are editing something overdue.
- A draft stays a draft.
- A post that has ALREADY PUBLISHED can only be corrected on the calendar. The message live on the social network is not touched, and the tool tells you so ("livePostUnchanged"). Say that to the user rather than letting them believe the live post changed.

To remove media rather than replace it, pass "clearAttachments" — an empty "attachments" array is treated as "no change", so it cannot silently strip a video.`,
      mcp: {
        annotations: {
          title: 'Edit Scheduled Post',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        id: z
          .string()
          .describe('The id of the post to edit (from postsList)'),
        content: z
          .string()
          .optional()
          .describe(
            "The new content of the post, HTML, each line wrapped in <p> — possible tags: h1, h2, h3, u, strong, li, ul, p (you can't have u and strong together). Omit to leave the text as it is. Use \"(post:<postId>)\" to embed another post's live URL."
          ),
        attachments: z
          .array(attachmentUrl)
          .optional()
          .describe(
            'An external URL passed here is automatically copied into the media library before saving, so the post stores a durable path instead of a link that can expire. Replaces the ENTIRE media list of the post with exactly these (URLs / media library paths). A partial list drops everything you left out: send one path to a three-image post and the other two images are gone. To swap a single image or video and keep the rest, use replacePostAsset instead of this field. OMIT THIS to keep the media that is already attached — that is what you want when you are only rewriting the text. An empty array is ignored; use clearAttachments to remove media.'
          ),
        clearAttachments: z
          .boolean()
          .optional()
          .describe(
            'Remove every attachment from the post. Only pass this when the user asked for the media to go.'
          ),
        comments: z
          .array(
            z.object({
              content: z
                .string()
                .describe('The content of this thread item / comment, HTML'),
              attachments: z
                .array(attachmentUrl)
                .optional()
                .describe(
                  'Replaces the media on this item. Omit to keep whatever the item at this position already had.'
                ),
              clearAttachments: z
                .boolean()
                .optional()
                .describe('Remove every attachment from this item'),
              linkToPostIds: z
                .array(z.string())
                .optional()
                .describe(
                  "Ids of other posts whose live URL should appear in this item, appended as \"(post:<id>)\" when the content does not already reference them"
                ),
            })
          )
          .optional()
          .describe(
            'Replaces every thread item / comment that follows the post: the list you pass becomes the whole thread, so you must resend EVERY item with its exact current content even when changing only one — leave one out and it is deleted. To change just one item\'s image or video, replacePostAsset with commentIndex does it without resending anything. Omit to leave the thread alone; pass an empty array to delete it all. Items map by position onto the existing ones, so a comment keeps its media unless you say otherwise.'
          ),
        date: z
          .string()
          .optional()
          .describe(
            'New publish date, UTC ISO string. Omit to keep the current one.'
          ),
        settings: z
          .array(
            z.object({
              key: z.string().describe('Name of the settings key to change'),
              value: z.any().describe('Value of the key'),
            })
          )
          .optional()
          .describe(
            'Channel settings to change, from integrationSchema. Merged over the settings the post already has, so only pass the keys you are changing.'
          ),
        linkToPostIds: z
          .array(z.string())
          .optional()
          .describe(
            "Ids of other posts whose live URL should appear in this post, appended as \"(post:<id>)\" when the content does not already reference them. The URL is filled in when this post publishes."
          ),
      }),
      outputSchema: z.object({
        id: z.string().optional(),
        group: z
          .string()
          .nullable()
          .optional()
          .describe(
            'The group id after the edit — editing gives the post a new group, so use this one from now on'
          ),
        state: z.string().optional(),
        publishDate: z.string().optional(),
        content: z.string().optional(),
        attachments: z.array(mediaOutput).optional(),
        comments: z
          .array(
            z.object({
              id: z.string(),
              content: z.string(),
              attachments: z.array(mediaOutput),
            })
          )
          .optional(),
        livePostUnchanged: z
          .boolean()
          .optional()
          .describe(
            'The post had already published: only the calendar entry was corrected, the message on the social network is untouched'
          ),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        try {
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          const existing = await this._postsService.getPostsRecursively(
            inputData.id,
            true,
            organizationId,
            true
          );

          const current = existing?.[0] as any;

          if (!current) {
            return { error: `Could not find a post with id ${inputData.id}` };
          }

          if (current.parentPostId) {
            return {
              error:
                'That id belongs to a thread item, not to the post itself. Pass the id postsList returns for the post, and change its thread items with "comments".',
            };
          }

          const integrationId =
            current.integration?.id || current.integrationId || '';

          if (!integrationId) {
            return {
              error:
                'This post has no channel attached, so there is nothing to edit against.',
            };
          }

          const changesNothing =
            inputData.content === undefined &&
            inputData.attachments === undefined &&
            inputData.comments === undefined &&
            inputData.settings === undefined &&
            !inputData.clearAttachments &&
            !inputData.date;

          if (changesNothing) {
            return {
              error:
                'Nothing to change — pass at least one of content, attachments, clearAttachments, comments, date or settings.',
            };
          }

          // Copy-on-attach: any attachment not already on our own storage is
          // fetched and re-hosted before anything is written, so a temporary
          // external URL can never be saved onto a post. Throws (caught
          // below) when a URL cannot be copied — the post is untouched then.
          const hosted = await hostExternalAttachments({
            mediaService: this._mediaService,
            organizationId,
            paths: [
              ...(inputData.attachments || []),
              ...(inputData.comments || []).flatMap(
                (comment) => comment.attachments || []
              ),
            ],
          });
          const rehost = (path: string) => hosted.get(path) ?? path;

          // An empty attachments array reads as "no attachments" but almost
          // always means "I had nothing to say about the media". Treat it as
          // no change, so rewriting the text of a post can never strip its
          // video by omission; clearAttachments is the explicit way to remove.
          const replacementFor = (item: {
            attachments?: string[];
            clearAttachments?: boolean;
          }) =>
            item.clearAttachments
              ? []
              : item.attachments?.length
              ? item.attachments.map((path: string) => ({
                  id: makeId(10),
                  path: rehost(path),
                }))
              : undefined;

          const items = existing.map((post: any) => ({
            id: post.id,
            content: post.content || '',
            delay: post.delay || 0,
            image: readPostMedia(post),
          }));

          const [post, ...comments] = items;

          const value = [
            {
              ...post,
              content: withPostLinks({
                content:
                  inputData.content === undefined
                    ? post.content
                    : inputData.content,
                linkToPostIds: inputData.linkToPostIds,
              }),
              image: replacementFor(inputData) ?? post.image,
            },
            ...(inputData.comments === undefined
              ? comments
              : inputData.comments.map((comment: any, index: number) => {
                  // Positional: the second comment sent edits the second
                  // comment that is there, and keeps its media and its id.
                  const previous = comments[index];

                  return {
                    id: previous?.id || makeId(10),
                    delay: previous?.delay || 0,
                    content: withPostLinks(comment),
                    image: replacementFor(comment) ?? previous?.image ?? [],
                  };
                })),
          ];

          const currentSettings = (() => {
            try {
              return JSON.parse(current.settings || '{}') || {};
            } catch (err) {
              return {};
            }
          })();

          const settings = {
            ...currentSettings,
            ...(inputData.settings || []).reduce(
              (acc: AllProvidersSettings, s: { key: string; value: any }) => ({
                ...acc,
                [s.key]: s.value,
              }),
              {} as AllProvidersSettings
            ),
            __type:
              current.integration?.providerIdentifier ||
              currentSettings.__type,
          } as AllProvidersSettings;

          // A published post can only be corrected on the calendar: 'update'
          // leaves the state alone and does not start a publishing workflow.
          const type =
            current.state === 'DRAFT'
              ? 'draft'
              : current.state === 'QUEUE'
              ? 'schedule'
              : 'update';

          // Same server-side validation the dashboard and integrationSchedulePostTool run.
          const [validation] = await this._postsService.validatePosts(
            organizationId,
            [
              {
                integration: { id: integrationId },
                settings,
                value: value.map((v) => ({
                  content: v.content,
                  image: v.image,
                })),
              },
            ]
          );

          if (validation.emptyContent) {
            return {
              error: `${validation.name}: Your post should have at least one character or one image.`,
            };
          }

          if (type !== 'draft') {
            if (!validation.valid) {
              return {
                error: `${validation.name}: ${
                  validation.settingsError || 'Please fix your settings'
                }, please fix it, and try editPostTool again.`,
              };
            }

            if (validation.errors !== true) {
              return {
                error: `${validation.name}: ${validation.errors}, please fix it, and try editPostTool again.`,
              };
            }

            if (validation.tooLong) {
              return {
                error: `${validation.name}: The maximum characters is ${validation.maximumCharacters}, please fix it, and try editPostTool again.`,
              };
            }
          }

          await this._postsService.createPost(
            organizationId,
            {
              type,
              date:
                inputData.date || new Date(current.publishDate).toISOString(),
              // The stored content is already shortlinked if it ever was, and
              // re-running it would shorten the links a second time.
              shortLink: false,
              tags: (current.tags || []).map((t: any) => ({
                value: t.tag?.id,
                label: t.tag?.name,
              })),
              ...(current.intervalInDays
                ? { inter: current.intervalInDays }
                : {}),
              posts: [
                {
                  integration: { id: integrationId },
                  // Passing the existing group is what makes this an edit: the
                  // rows are upserted under a new group, and whatever still
                  // carries the old one — a comment that was dropped — is soft
                  // deleted.
                  group: current.group,
                  reviewed: !!current.reviewed,
                  settings,
                  value,
                },
              ],
            } as any,
            'MCP'
          );

          const [updated, ...updatedComments] =
            (await this._postsService.getPostsRecursively(
              inputData.id,
              true,
              organizationId,
              true
            )) as any[];

          return {
            id: updated?.id || inputData.id,
            group: updated?.group ?? null,
            state: updated?.state || current.state,
            publishDate: new Date(
              updated?.publishDate || current.publishDate
            ).toISOString(),
            content: updated?.content || '',
            attachments: describeMedia(updated),
            comments: (updatedComments || []).map((comment: any) => ({
              id: comment.id,
              content: comment.content || '',
              attachments: describeMedia(comment),
            })),
            ...(type === 'update' ? { livePostUnchanged: true } : {}),
          };
        } catch (err) {
          const refusal = walletRefusal(err);
          if (refusal) {
            return { error: refusal };
          }
          return {
            error: `Failed to edit the post: ${
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
