import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { AllProvidersSettings } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings';
import { Integration } from '@prisma/client';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  attachmentUrl,
  hostExternalAttachments,
  withPostLinks,
} from '@gitroom/nestjs-libraries/chat/tools/post.write.shared';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { WalletService } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  addPendingWalletPost,
  orgFromContext,
  PendingWalletPosts,
  toCredits,
  walletPostCost,
  walletRefusal,
  walletWarning,
} from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';

@Injectable()
export class IntegrationSchedulePostTool implements AgentToolInterface {
  constructor(
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _walletService: WalletService
  ) {}
  name = 'integrationSchedulePostTool';

  run() {
    return createTool({
      id: 'schedulePostTool',
      mcp: {
        annotations: {
          title: 'Schedule Social Media Post',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `
This tool allows you to schedule a post to a social media platform, based on integrationSchema tool.
So for example:

If the user want to post a post to LinkedIn with one comment
- socialPost array length will be one
- postsAndComments array length will be two (one for the post, one for the comment)

If the user want to post 20 posts for facebook each in individual days without comments
- socialPost array length will be 20
- postsAndComments array length will be one

If the tools return errors, you would need to rerun it with the right parameters, don't ask again, just run it

LINKING TO ANOTHER POST (echoing a post to other channels):
To put the live URL of another post inside this one, write "(post:<postId>)" in the
content. It is replaced with that post's real URL at the moment this post publishes,
so you CAN schedule "here is my new X post: <link>" before the X post exists.
- Get the postId from postsList, or from the output of a previous call to this tool.
- The referenced post must be scheduled EARLIER than this one.
- To echo a post you are creating now, call this tool twice: once for the original
  post, then again for the echo using the postId this tool returned.
- If the referenced post has not published by the time this one is due, this post
  waits for it, and fails instead of publishing a broken link. So an echo never goes
  out without its link.
- The reference expands to a full URL, so leave room for it in character limits.
`,
      inputSchema: z.object({
        socialPost: z
          .array(
            z.object({
              integrationId: z
                .string()
                .describe('The id of the integration (not internal id)'),
              isPremium: z
                .boolean()
                .optional()
                .describe(
                  'Only matters for X: whether the account is X Premium. Defaults to false; leave it out for every other platform.'
                ),
              date: z.string().describe('The date of the post in UTC time'),
              shortLink: z
                .boolean()
                .describe(
                  'If the post has a link inside, we can ask the user if they want to add a short link'
                ),
              type: z
                .enum(['draft', 'schedule', 'now'])
                .describe(
                  'The type of the post, if we pass now, we should pass the current date also'
                ),
              postsAndComments: z
                .array(
                  z.object({
                    content: z
                      .string()
                      .describe(
                        "The content of the post, HTML, Each line must be wrapped in <p> here is the possible tags: h1, h2, h3, u, strong, li, ul, p (you can't have u and strong together). Use \"(post:<postId>)\" to embed another post's live URL - see the tool description."
                      ),
                    attachments: z
                      .array(attachmentUrl)
                      .describe(
                        'The images/videos of the post (URLs or media-library paths). An external URL is automatically copied into the media library before saving, so the post stores a durable path instead of a link that can expire.'
                      ),
                    linkToPostIds: z
                      .array(z.string())
                      .optional()
                      .describe(
                        "Ids of other posts whose live URL should appear in this post - this is how you echo a post to another channel. Any id listed here that is not already written as \"(post:<id>)\" in the content is appended to it. The URL is filled in when THIS post publishes, so it works even though the other post has not published yet and its releaseURL is still null. Get the ids from postsList (\"linkReference\") or from this tool's own output. The referenced post must be scheduled earlier than this one; if it has not published by the time this one is due, this post waits for it and then fails rather than publishing a broken link."
                      ),
                  })
                )
                .describe(
                  'first item is the post, every other item is the comments'
                ),
              settings: z
                .array(
                  z.object({
                    key: z
                      .string()
                      .describe('Name of the settings key to pass'),
                    value: z
                      .any()
                      .describe(
                        'Value of the key, always prefer the id then label if possible'
                      ),
                  })
                )
                .describe(
                  'This relies on the integrationSchema tool to get the settings [input:settings]'
                ),
            })
          )
          .describe('Individual post'),
      }),
      outputSchema: z.object({
        output: z
          .array(
            z.object({
              postId: z.string(),
              integration: z.string(),
              cost: z
                .number()
                .optional()
                .describe(
                  'Credits taken from the wallet for this post and its replies, now, as it is scheduled (per occurrence for a repeating post)'
                ),
              costWhenScheduled: z
                .number()
                .optional()
                .describe(
                  'For a draft: what it will take from the wallet once it is put on the schedule. Nothing is charged for a draft.'
                ),
              walletWarning: z.string().optional(),
            })
          )
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organization = orgFromContext(context);
        const organizationId = organization?.id;
        const finalOutput = [];
        // Wallet posts that will publish, so the warning can be added once
        // every post is on the calendar.
        const walletPosts: { cost: number }[] = [];
        // What those posts take from the wallet, priced before any of them is
        // queued (see walletWarning).
        const pending: PendingWalletPosts = new Map();
        const costs = new Map<number, number>();

        const integrations = {} as Record<string, Integration>;
        for (const platform of inputData.socialPost) {
          integrations[platform.integrationId] =
            await this._integrationService.getIntegrationById(
              organizationId,
              platform.integrationId
            );

          // Same server-side validation as the dashboard / public API
          // (settings DTO + media checkValidity + empty / too-long content).
          const settings = platform.settings.reduce(
            (acc: AllProvidersSettings, s: { key: string; value: any }) => ({
              ...acc,
              [s.key]: s.value,
            }),
            {} as AllProvidersSettings
          );

          const [validation] = await this._postsService.validatePosts(
            organizationId,
            [
              {
                integration: { id: platform.integrationId },
                settings,
                value: platform.postsAndComments.map((p: any) => ({
                  content: withPostLinks(p),
                  image: (p.attachments || []).map((path: string) => ({
                    path,
                  })),
                })),
              },
            ]
          );

          // outputSchema wraps everything in `output`, so a bare { errors }
          // here fails tool-output validation and the agent is shown a schema
          // error instead of the reason its post was rejected.
          const rejected = (errors: string) => ({ output: { errors } });

          if (validation.emptyContent) {
            return rejected(
              `${validation.name}: Your post should have at least one character or one image.`
            );
          }

          if (platform.type !== 'draft') {
            if (!validation.valid) {
              return rejected(
                `${validation.name}: ${
                  validation.settingsError || 'Please fix your settings'
                }, please fix it, and try integrationSchedulePostTool again.`
              );
            }

            if (validation.errors !== true) {
              return rejected(
                `${validation.name}: ${validation.errors}, please fix it, and try integrationSchedulePostTool again.`
              );
            }

            if (validation.tooLong) {
              return rejected(
                `${validation.name}: The maximum characters is ${validation.maximumCharacters}, please fix it, and try integrationSchedulePostTool again.`
              );
            }
          }
        }

        // Copy-on-attach: re-host every attachment that is not already on our
        // own storage, so a temporary external URL can never be saved onto a
        // post. Done after validation (a rejected call uploads nothing) and
        // before any createPost (a failed copy leaves every post unwritten).
        // Deduped across the whole call, so a URL shared by several posts is
        // fetched once.
        let rehost: (path: string) => string;
        try {
          const hosted = await hostExternalAttachments({
            mediaService: this._mediaService,
            organizationId,
            paths: inputData.socialPost.flatMap((platform) =>
              platform.postsAndComments.flatMap(
                (item) => item.attachments || []
              )
            ),
          });
          rehost = (path: string) => hosted.get(path) ?? path;
        } catch (err) {
          return {
            output: {
              errors:
                err instanceof Error
                  ? err.message
                  : 'Failed to copy an external attachment into the media library.',
            },
          };
        }

        // What the wallet will take when each post publishes, read from the
        // content as createPost saves it. Never blocks the schedule.
        for (const [index, post] of inputData.socialPost.entries()) {
          const integration = integrations[post.integrationId];
          if (!integration) {
            continue;
          }
          const contents = post.postsAndComments.map((p: any) =>
            withPostLinks(p)
          );
          const cost = await walletPostCost(
            this._walletService,
            organization,
            integration.providerIdentifier,
            contents
          );
          if (cost === undefined) {
            continue;
          }
          costs.set(index, cost);
          if (post.type !== 'draft') {
            addPendingWalletPost(
              pending,
              integration.providerIdentifier,
              contents,
              cost
            );
          }
        }
        const warning = await walletWarning(
          this._walletService,
          organizationId,
          pending
        );

        for (const [index, post] of inputData.socialPost.entries()) {
          const integration = integrations[post.integrationId];

          if (!integration) {
            throw new Error('Integration not found');
          }

          const body: CreatePostDto = {
            date: post.date,
            type: post.type as 'draft' | 'schedule' | 'now',
            shortLink: post.shortLink,
            tags: [],
            posts: [
              {
                integration,
                group: makeId(10),
                settings: {
                  ...post.settings.reduce(
                    (acc: AllProvidersSettings, s: { key: string; value: any }) => ({
                      ...acc,
                      [s.key]: s.value,
                    }),
                    {} as AllProvidersSettings
                  ),
                  // The channel's real platform, never one the caller supplies.
                  __type: integration.providerIdentifier,
                } as AllProvidersSettings,
                value: post.postsAndComments.map((p: any) => ({
                  content: withPostLinks(p),
                  id: makeId(10),
                  delay: 0,
                  image: p.attachments.map((path: any) => ({
                    id: makeId(10),
                    path: rehost(path),
                  })),
                })),
              },
            ],
          };
          let output;
          try {
            output = await this._postsService.createPost(
              organizationId,
              body,
              'MCP'
            );
          } catch (err) {
            // A channel the wallet has not opened yet: the agent gets the
            // reason and the top-up link, not a raw tool failure.
            const refusal = walletRefusal(err);
            if (!refusal) {
              throw err;
            }
            const scheduled = finalOutput.map((p: any) => p.postId);
            return {
              output: {
                errors: scheduled.length
                  ? `${refusal} Already scheduled in this call, do not schedule them again: ${scheduled.join(
                      ', '
                    )}.`
                  : refusal,
              },
            };
          }

          const cost = costs.get(index);
          for (const item of output) {
            if (cost !== undefined) {
              // "cost" is what was taken now. A draft is not charged until it
              // is scheduled, so it only says what that will take.
              if (post.type === 'draft') {
                item.costWhenScheduled = toCredits(cost);
              } else {
                item.cost = toCredits(cost);
                walletPosts.push(item);
              }
            }
          }
          finalOutput.push(...output);
        }

        if (warning) {
          for (const item of walletPosts) {
            (item as any).walletWarning = warning;
          }
        }

        return {
          output: finalOutput,
        };
      },
    });
  }
}
