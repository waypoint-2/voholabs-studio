import { captureOrgEvent } from '@gitroom/nestjs-libraries/track/product.analytics';
import {
  BadRequestException,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import {
  hasAccess,
  paidOnlyChannelMessage,
  providerNeedsPaidPlan,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';
import {
  notEnoughCreditsMessage,
  WalletService,
  walletFrozenMessage,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import {
  REFUND_REASONS,
  WalletPostsService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.posts.service';
import { walletAlert } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import dayjs from 'dayjs';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  Integration,
  Post,
  Media,
  From,
  CreationMethod,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { shuffle } from 'lodash';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import utc from 'dayjs/plugin/utc';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  minifyPostsList,
  minifyPosts,
} from '@gitroom/helpers/utils/posts.list.minify';
import axios from 'axios';
import sharp from 'sharp';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Readable } from 'stream';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
dayjs.extend(utc);
import * as Sentry from '@sentry/nestjs';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { UnresolvedPostReference } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const POST_REFERENCE_REGEX = /\(post:[a-zA-Z0-9-_]+\)/g;

type PostUrl = {
  id: string;
  releaseURL: string | null;
  state: State;
  deletedAt: Date | null;
};

// Why a post failed, in a form the app and the API can act on without reading
// the message: 'wallet' when the wallet stopped it (not enough credits when it
// was due, or a wallet on hold), otherwise null. Derived from the stored error,
// which holds the message as is or inside a serialized failure.
export type PostErrorKind = 'wallet' | null;

const WALLET_ERROR_MESSAGES = [notEnoughCreditsMessage(), walletFrozenMessage()];

export const postErrorKind = (error?: string | null): PostErrorKind =>
  !!error &&
  WALLET_ERROR_MESSAGES.some(
    (message) =>
      error.includes(message) ||
      error.includes(JSON.stringify(message).slice(1, -1))
  )
    ? 'wallet'
    : null;

// Adds `errorKind` next to a post's `error`.
const withErrorKind = <T extends { error?: string | null }>(post: T) => ({
  ...post,
  errorKind: postErrorKind(post.error),
});

// Adds `errorKind` and drops `error`, for lists that never carried the error.
const errorKindOnly = <T extends { error?: string | null }>({
  error,
  ...post
}: T) => ({
  ...post,
  errorKind: postErrorKind(error),
});

export type PostDependencies = {
  status: 'ready' | 'pending' | 'dead';
  pending: string[];
  dead: string[];
};
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { stripLinks } from '@gitroom/helpers/utils/strip.links';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { weightedLength } from '@gitroom/helpers/utils/count.length';
import { PostRevisionService } from '@gitroom/nestjs-libraries/database/prisma/post-revisions/post-revision.service';

type PostWithConditionals = Post & {
  integration?: Integration;
  childrenPost: Post[];
};

@Injectable()
export class PostsService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _postRepository: PostsRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _shortLinkService: ShortLinkService,
    private _openaiService: OpenaiService,
    private _temporalService: TemporalService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _postRevisionService: PostRevisionService,
    private _walletService: WalletService,
    private _walletPosts: WalletPostsService
  ) {}

  // What the wallet has to do with this organization's posts:
  // - 'wallet': it is not on a paid plan, so posts may be charged (and a
  //   charge that can't be paid stops the save);
  // - 'refund': it is on a paid plan but has a wallet, so charges left from
  //   before the plan can only be given back, never taken, and a wallet
  //   error never touches the post;
  // - 'none': a paid plan and no wallet: the wallet is not involved at all.
  private async walletMode(orgId: string): Promise<'wallet' | 'refund' | 'none'> {
    let org: Awaited<
      ReturnType<PostsRepository['organizationBillingState']>
    > | null;
    try {
      org = await this._postRepository.organizationBillingState(orgId);
    } catch (err) {
      return hasAccess(
        await this._postRepository.organizationSubscription(orgId)
      )
        ? 'none'
        : 'wallet';
    }
    if (!hasAccess(org)) {
      return 'wallet';
    }
    return org?.wallet ? 'refund' : 'none';
  }

  // Refunds what was charged for the unsent posts of these groups (deleted,
  // drafted, failed). Giving credits back must never break the action that
  // triggered it, so a failure only alerts.
  private async refundGroups(
    orgId: string,
    groups: string[],
    reason: string,
    refundOnly = false
  ) {
    try {
      await this._walletPosts.settleGroups(orgId, groups, {
        reason,
        refundOnly,
      });
    } catch (err) {
      await walletAlert(
        `Refund failed for post groups ${groups.join(
          ', '
        )} (organization ${orgId}): ${(err as Error)?.message || err}`
      ).catch(() => undefined);
    }
  }

  // Is publishing actually moving? A stall is at least 3 posts that came due
  // 15 to 60 minutes ago and still have a live publishing job, while nothing
  // has finished in the last hour. One or two late posts are not a stall: a
  // job can legitimately be waiting (e.g. a post whose time was edited after
  // its job started). Overdue posts with no job at all (left behind by an
  // earlier outage) are reported but never count: restarting would not
  // publish them.
  async publishingHealth() {
    const now = Date.now();
    const minutes = (m: number) => new Date(now - m * 60_000);
    const activity = await this._postRepository.publishingActivity(
      minutes(60),
      minutes(15),
      minutes(60)
    );

    const client = this._temporalService.client.getRawClient()!;
    const withTimeout = <T>(p: Promise<T>) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ]);

    let scheduler = true;
    try {
      await withTimeout(client.workflowService.getSystemInfo({}));
    } catch (err) {
      scheduler = false;
    }

    // Which overdue posts still have a running publishing job
    let waitingOnScheduler = 0;
    let withoutJob = 0;
    if (scheduler) {
      for (const post of activity.overdue) {
        try {
          const job = await withTimeout(
            client.workflow.getHandle(`post_${post.id}`).describe()
          );
          if (job.status.name === 'RUNNING') {
            waitingOnScheduler++;
          } else {
            withoutJob++;
          }
        } catch (err: any) {
          if (err?.message === 'timeout') {
            scheduler = false;
            break;
          }
          withoutJob++;
        }
      }
    }

    const stalled = waitingOnScheduler >= 3 && activity.finished === 0;
    return {
      healthy: scheduler && !stalled,
      scheduler,
      stalled,
      overdue: activity.overdue.length,
      waitingOnScheduler,
      withoutJob,
      oldestOverdue: activity.overdue[0]?.publishDate || null,
      finished: activity.finished,
    };
  }

  async organizationHasPaidPlan(orgId: string) {
    return hasAccess(
      await this._postRepository.organizationSubscription(orgId)
    );
  }

  searchForMissingThreeHoursPosts() {
    return this._postRepository.searchForMissingThreeHoursPosts();
  }

  // The one place a post becomes PUBLISHED, so it is also where the revision
  // chain learns what actually went out.
  async updatePost(id: string, postId: string, releaseURL: string) {
    const post = await this._postRepository.updatePost(id, postId, releaseURL);
    captureOrgEvent(post.organizationId, 'post_published', { in_thread: !!post.parentPostId });

    try {
      await this._postRevisionService.markPublished(
        post.organizationId,
        post.id,
        post.group
      );
    } catch (err) {
      // Bookkeeping must never fail a publish.
    }

    return post;
  }

  async getMissingContent(
    orgId: string,
    postId: string,
    forceRefresh = false
  ): Promise<{ id: string; url: string }[]> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || post.releaseId !== 'missing') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.missing) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    try {
      return await integrationProvider.missing(
        getIntegration.internalId,
        getIntegration.token
      );
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.getMissingContent(orgId, postId, true);
      }
    }

    return [];
  }

  async getPostById(postId: string, orgId: string) {
    return this._postRepository.getPostById(postId, orgId);
  }

  async updateReleaseId(orgId: string, postId: string, releaseId: string) {
    return this._postRepository.updateReleaseId(postId, orgId, releaseId);
  }

  async setReviewed(orgId: string, postId: string, reviewed: boolean) {
    return this._postRepository.setReviewed(orgId, postId, reviewed);
  }

  async checkPostAnalytics(
    orgId: string,
    postId: string,
    date: number,
    forceRefresh = false
  ): Promise<AnalyticsData[] | { missing: true }> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId) {
      return [];
    }

    if (post.releaseId === 'missing') {
      return { missing: true };
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.postAnalytics) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    // const getIntegrationData = await ioRedis.get(
    //   `integration:${orgId}:${post.id}:${date}`
    // );
    // if (getIntegrationData) {
    //   return JSON.parse(getIntegrationData);
    // }

    // A wallet workspace pays for the post read, once per post and UTC day,
    // before the network is asked. Its balance must be above zero (auto
    // top-up may refill it), else the wallet 402 is thrown and the network
    // is not asked; the charge itself may then take the balance below zero.
    let charge: string | false | undefined;
    if (
      await this._integrationService.paysFromWallet(
        orgId,
        getIntegration.providerIdentifier
      )
    ) {
      if (
        !(await this._integrationService.assertCanReadAnalytics(
          orgId,
          getIntegration.providerIdentifier,
          'post'
        ))
      ) {
        return [];
      }
      charge = await this._integrationService.chargeApiUse({
        orgId,
        identifier: getIntegration.providerIdentifier,
        action: 'post_read',
        chargeKey: `${getIntegration.providerIdentifier
          .toLowerCase()
          .split('-')[0]}read:post:${post.id}:${dayjs
          .utc()
          .format('YYYY-MM-DD')}`,
        reference: post.id,
        allowNegative: true,
      });
      if (!charge) {
        return [];
      }
    }

    try {
      const loadAnalytics = await integrationProvider.postAnalytics(
        getIntegration.internalId,
        getIntegration.token,
        post.releaseId,
        date
      );
      if (charge && !loadAnalytics?.length) {
        await this._integrationService.refundApiUse(
          charge,
          'Refund: the post could not be read'
        );
      }
      await ioRedis.set(
        `integration:${orgId}:${post.id}:${date}`,
        JSON.stringify(loadAnalytics),
        'EX',
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? 1
          : 3600
      );
      return loadAnalytics;
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.checkPostAnalytics(orgId, postId, date, true);
      }
    }

    return [];
  }

  async getStatistics(orgId: string, id: string) {
    const getPost = await this.getPostsRecursively(id, true, orgId, true);
    const content = getPost.map((p) => p.content);
    const shortLinksTracking = await this._shortLinkService.getStatistics(
      content
    );

    return {
      clicks: shortLinksTracking,
    };
  }

  async mapTypeToPost(
    body: CreatePostDto,
    organization: string,
    replaceDraft: boolean = false
  ): Promise<CreatePostDto> {
    if (!body?.posts?.every((p) => p?.integration?.id)) {
      throw new BadRequestException('All posts must have an integration id');
    }

    const mappedValues = {
      ...body,
      type: replaceDraft ? 'schedule' : body?.type,
      posts: await Promise.all(
        body?.posts?.map(async (post) => {
          const integration = await this._integrationService.getIntegrationById(
            organization,
            post.integration.id
          );

          if (!integration) {
            throw new BadRequestException(
              `Integration with id ${post.integration.id} not found`
            );
          }

          return {
            type: replaceDraft ? 'schedule' : body?.type,
            ...post,
            settings: {
              ...(post.settings || ({} as any)),
              __type: integration.providerIdentifier,
            },
          };
        }) || []
      ),
    };

    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    return await validationPipe.transform(mappedValues, {
      type: 'body',
      metatype: CreatePostDto,
    });
  }

  async getPostsRecursively(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ): Promise<PostWithConditionals[]> {
    const post = await this._postRepository.getPost(
      id,
      includeIntegration,
      orgId,
      isFirst
    );

    if (!post) {
      return [];
    }

    return [
      post!,
      ...(post?.childrenPost?.length
        ? await this.getPostsRecursively(
            post?.childrenPost?.[0]?.id,
            false,
            orgId,
            false
          )
        : []),
    ];
  }

  async getPosts(
    orgId: string,
    query: GetPostsDto,
    options?: {
      includeMedia?: boolean;
      includeSettings?: boolean;
      includeThread?: boolean;
      // Also return the stored `error` (every item has `errorKind`).
      includeError?: boolean;
    }
  ) {
    // Why a post failed is only read for an organization without a paid
    // plan (the calendar marks posts the wallet stopped) or when asked for.
    const walletErrors =
      !options?.includeError &&
      !(await this.organizationHasPaidPlan(orgId).catch(() => true));
    if (!options?.includeError && !walletErrors) {
      return this._postRepository.getPosts(orgId, query, options);
    }
    const posts = await this._postRepository.getPosts(orgId, query, {
      ...options,
      includeError: true,
    });
    return posts.map((post: { error?: string | null }) =>
      options?.includeError ? withErrorKind(post) : errorKindOnly(post)
    );
  }

  async getPostIdsInGroup(orgId: string, group: string) {
    return this._postRepository.getPostIdsInGroup(orgId, group);
  }

  /**
   * Which posts would break if `ids` went away — the other side of
   * `getPostDependencies`, which only ever looks outward from one post. Posts
   * that reference each other inside the same group are left out: a thread
   * linking to itself does not survive or die independently.
   */
  async getPostsReferencing(orgId: string, ids: string[]) {
    const referencing = await this._postRepository.getPostsReferencing(
      orgId,
      ids
    );

    return referencing.filter((post) => !ids.includes(post.id));
  }

  async getPostsMinified(orgId: string, query: GetPostsDto) {
    return minifyPosts({
      posts: await this.getPosts(orgId, query),
    });
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    if (await this.organizationHasPaidPlan(orgId).catch(() => true)) {
      return minifyPostsList(
        await this._postRepository.getPostsList(orgId, query)
      );
    }
    const list = await this._postRepository.getPostsList(orgId, query, true);
    return minifyPostsList({
      ...list,
      posts: list.posts.map(errorKindOnly),
    });
  }

  async updateMedia(id: string, imagesList: any[], convertToJPEG = false) {
    try {
      let imageUpdateNeeded = false;
      const getImageList = await Promise.all(
        (
          await Promise.all(
            (imagesList || []).map(async (p: any) => {
              if (!p.path && p.id) {
                imageUpdateNeeded = true;
                return this._mediaService.getMediaById(p.id);
              }

              return p;
            })
          )
        )
          .map((m) => {
            return {
              ...m,
              url:
                m.path.indexOf('http') === -1
                  ? process.env.FRONTEND_URL +
                    '/' +
                    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                    m.path
                  : m.path,
              type: 'image',
              path:
                m.path.indexOf('http') === -1
                  ? process.env.UPLOAD_DIRECTORY + m.path
                  : m.path,
            };
          })
          .map(async (m) => {
            if (!convertToJPEG) {
              return m;
            }

            if (hasExtension(m.path, 'png')) {
              imageUpdateNeeded = true;
              const response = await axios.get(m.url, {
                responseType: 'arraybuffer',
              });

              const imageBuffer = Buffer.from(response.data);

              // Use sharp to get the metadata of the image
              const buffer = await sharp(imageBuffer)
                .jpeg({ quality: 100 })
                .toBuffer();

              const { path, originalname } = await this.storage.uploadFile({
                buffer,
                mimetype: 'image/jpeg',
                size: buffer.length,
                path: '',
                fieldname: '',
                destination: '',
                stream: new Readable(),
                filename: '',
                originalname: '',
                encoding: '',
              });

              return {
                ...m,
                name: originalname,
                url:
                  path.indexOf('http') === -1
                    ? process.env.FRONTEND_URL +
                      '/' +
                      process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                      path
                    : path,
                type: 'image',
                path:
                  path.indexOf('http') === -1
                    ? process.env.UPLOAD_DIRECTORY + path
                    : path,
              };
            }

            return m;
          })
      );

      if (imageUpdateNeeded) {
        await this._postRepository.updateImages(
          id,
          JSON.stringify(getImageList)
        );
      }

      return getImageList;
    } catch (err: any) {
      return imagesList;
    }
  }

  async getPostGroupDebugExport(orgId: string, group: string) {
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const errors = await this._postRepository.getErrorsByPostIds(
      loadAll.map((p) => p.id)
    );
    const posts = this.arrangePostsByGroup(loadAll, undefined);
    const rootPost = posts[0] as any;

    return {
      type: 'draft' as const,
      shortLink: false,
      date: rootPost.publishDate.toISOString(),
      tags:
        rootPost.tags?.map((t: any) => ({
          value: t.tag.id,
          label: t.tag.name,
        })) || [],
      posts: [
        {
          integration: { id: 'REPLACE_WITH_LOCAL_INTEGRATION_ID' },
          group: rootPost.group,
          settings: JSON.parse(rootPost.settings || '{}'),
          value: posts.map((post) => ({
            content: post.content,
            image: JSON.parse(post.image || '[]'),
            delay: post.delay || 0,
          })),
        },
      ],
      _debug: {
        providerIdentifier: rootPost.integration?.providerIdentifier,
        providerName: rootPost.integration?.name,
        state: rootPost.state,
        error: rootPost.error,
        errors: errors.map((e) => ({
          message: e.message,
          platform: e.platform,
          body: e.body,
          createdAt: e.createdAt,
        })),
        originalGroup: group,
        originalPublishDate: rootPost.publishDate,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  async getPostsByGroup(orgId: string, group: string) {
    const convertToJPEG = false;
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const posts = this.arrangePostsByGroup(loadAll, undefined);

    return {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...withErrorKind(post),
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };
  }

  arrangePostsByGroup(all: any, parent?: string): PostWithConditionals[] {
    const findAll = all
      .filter((p: any) =>
        !parent ? !p.parentPostId : p.parentPostId === parent
      )
      .map(({ integration, ...all }: any) => ({
        ...all,
        ...(!parent ? { integration } : {}),
      }));

    return [
      ...findAll,
      ...(findAll.length
        ? findAll.flatMap((p: any) => this.arrangePostsByGroup(all, p.id))
        : []),
    ];
  }

  async getPost(orgId: string, id: string, convertToJPEG = false) {
    const posts = await this.getPostsRecursively(id, true, orgId, true);
    const list = {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...withErrorKind(post),
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };

    return list;
  }

  /**
   * Sanity posts that published before the article's own address was worked out
   * hold a link to the Studio document instead. That is what a `(post:<id>)`
   * echo pointing at one of them gets replaced with, so a queued echo to an
   * already published article still goes out wrong until this is run.
   *
   * Dry by default: it reports what it would change and writes nothing.
   */
  async repairSanityReleaseUrls(dryRun = true) {
    const provider = this._integrationManager.getSocialIntegration(
      'sanity'
    ) as any;

    if (typeof provider?.liveUrlForDocument !== 'function') {
      return { scanned: 0, changed: 0, dryRun, posts: [] as any[] };
    }

    const posts = await this._postRepository.getPublishedPostsByProvider(
      'sanity'
    );

    const changes: { id: string; from: string; to: string }[] = [];

    for (const post of posts) {
      const documentId = (() => {
        try {
          return JSON.parse(post.settings || '{}')?.documentId || '';
        } catch (err) {
          return '';
        }
      })();

      if (!documentId) {
        continue;
      }

      // One bad channel must not stop the rest of the repair.
      const url = await provider
        .liveUrlForDocument(post.integration.token, documentId)
        .catch(() => '');

      if (!url || url === post.releaseURL) {
        continue;
      }

      changes.push({ id: post.id, from: post.releaseURL || '', to: url });

      if (!dryRun) {
        await this._postRepository.setReleaseURL(post.id, url);
      }
    }

    return {
      scanned: posts.length,
      changed: changes.length,
      dryRun,
      posts: changes,
    };
  }

  async getOldPosts(orgId: string, date: string) {
    return this._postRepository.getOldPosts(orgId, date);
  }

  /**
   * Pulls the ids out of every `(post:<id>)` reference in a blob of text. The
   * references can sit anywhere on the post - the content, or a setting such as
   * an article's canonical link - so callers hand us the serialized post.
   */
  public extractPostReferences(text: string): string[] {
    return Array.from(
      new Set(
        (text.match(POST_REFERENCE_REGEX) || []).map((e) =>
          e.replace('(post:', '').replace(')', '')
        )
      )
    );
  }

  /**
   * The live URL of a referenced post, or undefined if it doesn't have one -
   * because it is gone, hasn't published, or published without the provider
   * handing us back a URL.
   */
  private resolvedPostUrl(urls: PostUrl[], id: string): string | undefined {
    const found = urls.find((u) => u.id === id);
    if (!found || found.deletedAt || found.state !== 'PUBLISHED') {
      return undefined;
    }

    // Some providers store a comma separated list; the first one is the post.
    return (found.releaseURL || '').split(',')[0].trim() || undefined;
  }

  /**
   * Tells the caller whether every `(post:<id>)` reference in a post can be
   * resolved right now, and if not, whether it is worth waiting:
   *  - `pending`: the referenced post is still queued, its URL is coming.
   *  - `dead`:    the referenced post is deleted, errored, parked as a draft, or
   *               published without a URL. Waiting will never help.
   */
  public async getPostDependencies(
    orgId: string,
    posts: Post[]
  ): Promise<PostDependencies> {
    const ids = this.extractPostReferences(JSON.stringify(posts));
    if (!ids.length) {
      return { status: 'ready', pending: [], dead: [] };
    }

    const urls = await this._postRepository.getPostUrls(orgId, ids);
    const pending: string[] = [];
    const dead: string[] = [];

    for (const id of ids) {
      if (this.resolvedPostUrl(urls, id)) {
        continue;
      }

      const found = urls.find((u) => u.id === id);
      if (found && !found.deletedAt && found.state === 'QUEUE') {
        pending.push(id);
        continue;
      }

      dead.push(id);
    }

    return {
      status: dead.length ? 'dead' : pending.length ? 'pending' : 'ready',
      pending,
      dead,
    };
  }

  /**
   * Swaps every `(post:<id>)` reference for the referenced post's live URL, at
   * the moment we publish. If any of them still can't be resolved we throw
   * instead of substituting an empty string - a post whose whole point is to
   * link somewhere must not go out with the link missing.
   */
  public async updateTags(orgId: string, post: Post[]): Promise<Post[]> {
    const plainText = JSON.stringify(post);
    const ids = this.extractPostReferences(plainText);
    if (!ids.length) {
      return post;
    }

    const urls = await this._postRepository.getPostUrls(orgId, ids);
    const unresolved = ids.filter((id) => !this.resolvedPostUrl(urls, id));
    if (unresolved.length) {
      throw new UnresolvedPostReference(unresolved);
    }

    const newPlainText = ids.reduce((acc, value) => {
      const findUrl = this.resolvedPostUrl(urls, value)!;
      return acc.replace(
        new RegExp(`\\(post:${value}\\)`, 'g'),
        // A function replacement so `$` in a URL isn't read as a capture group.
        () => findUrl
      );
    }, plainText);

    return this.updateTags(orgId, JSON.parse(newPlainText) as Post[]);
  }

  public async checkInternalPlug(
    integration: Integration,
    orgId: string,
    id: string,
    settings: any
  ) {
    const plugs = Object.entries(settings).filter(([key]) => {
      return key.indexOf('plug-') > -1;
    });

    if (plugs.length === 0) {
      return [];
    }

    const parsePlugs = plugs.reduce((all, [key, value]) => {
      const [_, name, identifier] = key.split('--');
      all[name] = all[name] || { name };
      all[name][identifier] = value;
      return all;
    }, {} as any);

    const list: {
      name: string;
      integrations: { id: string }[];
      delay: string;
      active: boolean;
    }[] = Object.values(parsePlugs);

    return (list || []).flatMap((trigger) => {
      return (trigger?.integrations || []).flatMap((int) => ({
        type: 'internal-plug',
        post: id,
        originalIntegration: integration.id,
        integration: int.id,
        plugName: trigger.name,
        orgId: orgId,
        delay: +trigger.delay,
        information: trigger,
      }));
    });
  }

  public async checkPlugs(
    orgId: string,
    providerName: string,
    integrationId: string
  ) {
    const loadAllPlugs = this._integrationManager.getAllPlugs();
    const getPlugs = await this._integrationService.getPlugs(
      orgId,
      integrationId
    );

    const currentPlug = loadAllPlugs.find((p) => p.identifier === providerName);

    return getPlugs
      .filter((plug) => {
        return currentPlug?.plugs?.some(
          (p: any) => p.methodName === plug.plugFunction
        );
      })
      .map((plug) => {
        const runPlug = currentPlug?.plugs?.find(
          (p: any) => p.methodName === plug.plugFunction
        )!;
        return {
          type: 'global',
          plugId: plug.id,
          delay: runPlug.runEveryMilliseconds,
          totalRuns: runPlug.totalRuns,
        };
      });
  }

  /**
   * Takes the already-published messages of a group down from the platform
   * itself. deletePost only clears our calendar, so this is opt-in and separate:
   * the caller has to ask for it. Must run *before* deletePost, since it reads
   * the rows that deletePost soft-deletes.
   *
   * Best-effort per post: one channel refusing does not stop the others.
   */
  /**
   * Where a post lands inside the connected account, when the provider can say
   * — a Discord channel, for instance. Best-effort: a surface asking for a
   * label must never fail because the platform was slow.
   */
  async describeTarget(
    integration: { providerIdentifier: string } | null | undefined,
    settings: string | null | undefined
  ): Promise<string | undefined> {
    if (!integration) {
      return undefined;
    }

    try {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      if (!provider?.describeTarget) {
        return undefined;
      }

      return await provider.describeTarget(
        integration as Integration,
        JSON.parse(settings || '{}')
      );
    } catch (err) {
      return undefined;
    }
  }

  async deletePostsFromPlatform(orgId: string, group: string) {
    const posts = await this._postRepository.getPostsByGroup(orgId, group);
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const post of posts) {
      // Nothing to take down for a queued or draft post.
      if (post.state !== State.PUBLISHED || !post.releaseId) {
        continue;
      }

      const integration = post.integration;
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      if (!provider?.deletePost) {
        errors.push(
          `${integration.providerIdentifier} does not support deleting a published post`
        );
        continue;
      }

      try {
        await provider.deletePost(
          integration.internalId,
          integration.token,
          post.releaseId,
          {
            settings: JSON.parse(post.settings || '{}'),
            releaseURL: post.releaseURL,
          },
          integration
        );
        deleted.push(post.releaseId);
      } catch (err) {
        errors.push(
          `${integration.providerIdentifier}: ${
            err instanceof Error ? err.message : 'Unexpected error'
          }`
        );
      }
    }

    return { deleted, errors };
  }

  async deletePost(orgId: string, group: string) {
    // Resolved before the delete, while the group still points at live rows.
    let chainId: string | undefined;
    try {
      chainId = await this._postRevisionService.resolveChainId(
        orgId,
        [],
        group
      );
    } catch (err) {}

    const post = await this._postRepository.deletePost(orgId, group);
    const walletMode = await this.walletMode(orgId).catch(() => 'none');
    if (walletMode !== 'none') {
      await this.refundGroups(
        orgId,
        [group],
        REFUND_REASONS.deleted,
        walletMode === 'refund'
      );
    }

    if (!chainId && post?.id) {
      try {
        chainId = await this._postRevisionService.resolveChainId(orgId, [
          post.id,
        ]);
      } catch (err) {}
    }

    // A deleted post leaves no history behind.
    if (chainId) {
      try {
        await this._postRevisionService.deleteChain(orgId, chainId);
      } catch (err) {}
    }

    if (post?.id) {
      try {
        const workflows = this._temporalService.client
          .getRawClient()
          ?.workflow.list({
            query: `postId="${post.id}" AND ExecutionStatus="Running"`,
          });

        for await (const executionInfo of workflows) {
          try {
            const workflow =
              await this._temporalService.client.getWorkflowHandle(
                executionInfo.workflowId
              );
            if (
              workflow &&
              (await workflow.describe()).status.name !== 'TERMINATED'
            ) {
              await workflow.terminate();
            }
          } catch (err) {}
        }
      } catch (err) {}
    }

    return { error: true };
  }

  async countPostsFromDay(orgId: string, date: Date) {
    return this._postRepository.countPostsFromDay(orgId, date);
  }

  getPostByForWebhookId(id: string) {
    return this._postRepository.getPostByForWebhookId(id);
  }

  async startWorkflow(
    taskQueue: string,
    postId: string,
    orgId: string,
    state: State
  ) {
    try {
      const workflows = this._temporalService.client
        .getRawClient()
        ?.workflow.list({
          query: `postId="${postId}" AND ExecutionStatus="Running"`,
        });

      for await (const executionInfo of workflows) {
        try {
          const workflow = await this._temporalService.client.getWorkflowHandle(
            executionInfo.workflowId
          );
          if (
            workflow &&
            (await workflow.describe()).status.name !== 'TERMINATED'
          ) {
            await workflow.terminate();
          }
        } catch (err) {}
      }
    } catch (err) {}

    if (state === 'DRAFT') {
      return;
    }

    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('postWorkflowV106', {
          workflowId: `post_${postId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          args: [
            {
              taskQueue: taskQueue,
              postId: postId,
              organizationId: orgId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: postId,
            },
            {
              key: organizationId,
              value: orgId,
            },
          ]),
        });
    } catch (err) {}
  }

  /**
   * Server-side validation that used to live on the client (`checkValidity` +
   * the manage modal loop). Runs the provider's settings DTO validation, the
   * provider `checkValidity` (media rules) and the empty-content / too-long
   * character checks. Returns one result per post so the frontend can show the
   * same toasts it did before — and so `/posts` can refuse to create invalid
   * posts.
   */
  async validatePosts(
    orgId: string,
    posts: Array<{
      integration: { id: string };
      value: Array<{
        content?: string;
        image?: Array<{ path: string; thumbnail?: string }>;
      }>;
      settings?: any;
    }>
  ) {
    return Promise.all(
      (posts || []).map(async (post) => {
        const integration = await this._integrationService.getIntegrationById(
          orgId,
          post?.integration?.id
        );

        if (!integration) {
          throw new BadRequestException(
            `Integration with id ${post?.integration?.id} not found`
          );
        }

        const provider = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );

        let additionalSettings: any[] = [];
        try {
          additionalSettings = JSON.parse(
            integration.additionalSettings || '[]'
          );
        } catch {
          additionalSettings = [];
        }

        const settings = post.settings || {};
        const media = (post.value || []).map((p) => p.image || []);

        // Settings DTO validation — mirrors the client `form.trigger()`.
        let valid = true;
        let settingsError = '';
        if (provider?.dto) {
          const instance = plainToInstance(provider.dto, settings, {
            enableImplicitConversion: false,
          });
          const validationErrors = await validate(instance as object, {
            skipMissingProperties: false,
          });
          settingsError = this.firstValidationError(validationErrors);
          valid = validationErrors.length === 0;
        }

        // Provider-specific media validation (the old client `checkValidity`).
        let errors: string | true = true;
        try {
          errors = await provider.checkValidity(
            media,
            settings,
            additionalSettings
          );
        } catch (err: any) {
          errors = err?.message || 'Invalid media';
        }

        // Settings that pass the DTO but would still fail at publish time, such
        // as a Discord channel the bot cannot post in. Reported as a settings
        // error so every surface (dashboard, public API, MCP) shows it while
        // the post is being scheduled rather than after it silently fails.
        if (valid && provider.validateSettings) {
          try {
            const settingsValidity = await provider.validateSettings(
              integration,
              settings,
              {
                hasMedia: media.some((m) => (m || []).length > 0),
                // Plain text of the main post: a provider may need it to check
                // a setting, such as deriving a Discord forum thread title.
                content: stripHtmlValidation(
                  'none',
                  (post.value || [])[0]?.content || '',
                  true
                ),
              }
            );

            if (settingsValidity !== true) {
              valid = false;
              settingsError = settingsValidity;
            }
          } catch (err) {
            // Never block scheduling on a platform hiccup.
          }
        }

        const maximumCharacters = provider.maxLength(additionalSettings);
        const isX = integration.providerIdentifier === 'x';

        const emptyContent = (post.value || []).some((a) => {
          const strip = stripHtmlValidation('normal', a.content || '', true);
          const length = isX ? weightedLength(strip) : strip.length;
          return length === 0 && (a.image || []).length === 0;
        });

        const tooLong = (post.value || []).some((a) => {
          const strip = stripHtmlValidation('normal', a.content || '', true);
          const weighted = isX ? weightedLength(strip) : strip.length;
          const totalCharacters =
            weighted > strip.length ? weighted : strip.length;
          return totalCharacters > (maximumCharacters || 1000000);
        });

        return {
          id: integration.id,
          identifier: integration.providerIdentifier,
          name: integration.name,
          valid,
          settingsError,
          errors,
          emptyContent,
          tooLong,
          maximumCharacters,
        };
      })
    );
  }

  /** Returns the first class-validator message (incl. nested children), or ''. */
  private firstValidationError(errors: any[]): string {
    for (const e of errors || []) {
      if (e?.constraints) {
        return Object.values(e.constraints as Record<string, string>)[0] || '';
      }
      const child = e?.children?.length
        ? this.firstValidationError(e.children)
        : '';
      if (child) {
        return child;
      }
    }
    return '';
  }

  async createPost(
    orgId: string,
    body: CreatePostDto,
    creationMethod: CreationMethod
  ): Promise<any[]> {
    // X is unavailable on the free plan: refuse before anything is
    // saved, whether the post comes from the app, the public API or an agent.
    // A pay-as-you-go workspace may use the ones its wallet charges for; the
    // credits are taken when each post is published, not here.
    for (const type of new Set(
      body.posts.map((post) => (post.settings as any)?.__type as string)
    )) {
      if (
        providerNeedsPaidPlan(type) &&
        !(await this._integrationService.canUseProvider(orgId, type))
      ) {
        throw await this._walletService.providerLocked(
          orgId,
          type,
          paidOnlyChannelMessage()
        );
      }
    }

    // Scheduling takes the credits now (drafts are free): refuse before
    // anything is saved when the wallet can't cover it, even after an
    // automatic top-up. A paid plan is never charged, so it skips this.
    const walletMode = await this.walletMode(orgId);
    if (walletMode === 'wallet') {
      await this._walletPosts.assertCanSchedule(
        orgId,
        body.posts.map((post) => ({
          identifier: (post.settings as any)?.__type,
          values: (post.value || []).map((v) => ({
            id: v.id,
            content: v.content,
          })),
          group: post.group,
          scheduled:
            body.type === 'draft'
              ? false
              : body.type === 'update'
              ? 'keep'
              : true,
        }))
      );
    }

    const postList = [];
    for (const post of body.posts) {
      const provider = this._integrationManager.getSocialIntegration(
        (post.settings as any)?.__type
      );
      const removeLinks = !!provider?.stripLinks?.();

      const messages = (post.value || []).map((p) => p.content);
      // No point shortlinking links on platforms that strip them out anyway
      const updateContent =
        !body.shortLink || removeLinks
          ? messages
          : await this._shortLinkService.convertTextToShortLinks(
              orgId,
              messages
            );

      post.value = (post.value || []).map((p, i) => ({
        ...p,
        content: removeLinks ? stripLinks(updateContent[i]) : updateContent[i],
      }));

      const { posts } = await this._postRepository.createOrUpdatePost(
        body.type,
        orgId,
        body.type === 'now' ? dayjs().format('YYYY-MM-DDTHH:mm:00') : body.date,
        post,
        body.tags,
        creationMethod,
        body.inter
      );

      if (!posts?.length) {
        return [] as any[];
      }

      // Snapshot what was just written, so the original draft can later be
      // compared with whatever actually went out. Awaited so two quick saves
      // cannot race past each other, but never allowed to fail the save.
      try {
        await this._postRevisionService.captureSnapshot({
          orgId,
          oldGroup: post.group,
          newGroup: posts[0].group,
          postIds: posts.map((p) => p.id),
          integrationId: post.integration.id,
          publishDate: posts[0].publishDate,
          value: post.value,
          settings: post.settings,
        });
      } catch (err) {}

      // Charge what is now on the schedule, re-price what changed and give
      // back what left it, before the post can publish.
      await this.settleSavedPost(orgId, post.group, posts, walletMode);

      if (body.type !== 'update') {
        this.startWorkflow(
          post.settings.__type.split('-')[0].toLowerCase(),
          posts[0].id,
          orgId,
          posts[0].state
        ).catch((err) => {});
      }

      Sentry.metrics.count('post_created', 1);
      postList.push({
        postId: posts[0].id,
        integration: post.integration.id,
      });
    }

    return postList;
  }

  // The wallet side of a save: settles the saved group (and the group it
  // replaced). If the balance no longer covers it (spent elsewhere since the
  // check), nothing is left unpaid on the schedule: an edit goes back to
  // drafts, a new post is removed, and the 402 reaches the caller.
  private async settleSavedPost(
    orgId: string,
    previousGroup: string | undefined,
    posts: { id: string; group: string; parentPostId?: string | null }[],
    walletMode: 'wallet' | 'refund' | 'none'
  ) {
    const group = posts[0].group;
    const groups = [group, ...(previousGroup ? [previousGroup] : [])];
    if (walletMode === 'none') {
      return;
    }
    if (walletMode === 'refund') {
      // Nothing is charged on a paid plan: only give back what is left.
      await this.refundGroups(
        orgId,
        groups,
        REFUND_REASONS.includedInPlan,
        true
      );
      return;
    }
    try {
      await this._walletPosts.settleGroups(orgId, groups, {
        reason: REFUND_REASONS.edited,
      });
    } catch (err) {
      if (previousGroup) {
        await this._postRepository.changeState(posts[0].id, 'DRAFT');
        await this.refundGroups(orgId, groups, REFUND_REASONS.draft);
      } else {
        await this._postRepository.deletePost(orgId, group);
      }
      throw err;
    }
  }

  async separatePosts(content: string, len: number) {
    return this._openaiService.separatePosts(content, len);
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const update = await this._postRepository.changeState(id, state, err, body);
    // A post that failed gives back what its unsent parts paid. The part
    // that failed is refunded where it was published (PostActivity); the
    // parts after it were never tried.
    if (state === 'ERROR' && update?.organizationId) {
      const walletMode = await this.walletMode(update.organizationId).catch(
        () => 'none'
      );
      if (walletMode !== 'none') {
        await this.refundGroups(
          update.organizationId,
          [update.group],
          REFUND_REASONS.notSent,
          walletMode === 'refund'
        );
      }
    }
    return update;
  }

  async changePostStatus(
    orgId: string,
    id: string,
    status: 'draft' | 'schedule'
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);
    if (!getPostById) {
      throw new BadRequestException('Post not found');
    }

    const state: State = status === 'draft' ? 'DRAFT' : 'QUEUE';
    const walletMode = await this.walletMode(orgId);
    if (state === 'QUEUE' && walletMode === 'wallet') {
      // Paid before it goes on the schedule; a 402 leaves it as it was.
      await this._walletPosts.settleGroups(orgId, [getPostById.group], {
        reason: REFUND_REASONS.edited,
        mainState: { [getPostById.group]: 'QUEUE' },
      });
    }
    await this._postRepository.changeState(id, state);
    if (state === 'DRAFT' && walletMode !== 'none') {
      await this.refundGroups(
        orgId,
        [getPostById.group],
        REFUND_REASONS.draft,
        walletMode === 'refund'
      );
    }

    try {
      await this.startWorkflow(
        getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
        getPostById.id,
        orgId,
        state
      );
    } catch (err) {}

    return { id, state };
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    action: 'schedule' | 'update' = 'schedule'
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);

    // schedule: Set status to QUEUE and change date (reschedule the post)
    // update: Just change the date without changing the status
    const newDate = await this._postRepository.changeDate(
      orgId,
      id,
      date,
      getPostById.state === 'DRAFT',
      action
    );

    if (
      action === 'schedule' &&
      getPostById.state !== 'DRAFT' &&
      (await this.walletMode(orgId)) === 'wallet'
    ) {
      // Back on the schedule: pay for it (again, if it already went out
      // once). Short of credits, it goes back to how it was.
      try {
        await this._walletPosts.settleGroups(orgId, [getPostById.group], {
          reason: REFUND_REASONS.edited,
          fresh:
            getPostById.releaseURL || getPostById.releaseId
              ? [getPostById.id]
              : [],
        });
      } catch (err) {
        await this._postRepository.changeDate(
          orgId,
          id,
          dayjs(getPostById.publishDate).format(),
          false,
          'update'
        );
        if (getPostById.state === 'PUBLISHED') {
          await this._postRepository.updatePost(
            id,
            getPostById.releaseId!,
            getPostById.releaseURL!
          );
        } else {
          await this._postRepository.changeState(id, getPostById.state);
        }
        throw err;
      }
    }

    if (action === 'schedule') {
      try {
        await this.startWorkflow(
          getPostById.integration.providerIdentifier
            .split('-')[0]
            .toLowerCase(),
          getPostById.id,
          orgId,
          getPostById.state === 'DRAFT' ? 'DRAFT' : 'QUEUE'
        );
      } catch (err) {}
    }

    return newDate;
  }

  async generatePostsDraft(orgId: string, body: CreateGeneratedPostsDto) {
    const getAllIntegrations = (
      await this._integrationService.getIntegrationsList(orgId)
    ).filter((f) => !f.disabled && f.providerIdentifier !== 'reddit');

    // const posts = chunk(body.posts, getAllIntegrations.length);
    const allDates = dayjs()
      .isoWeek(body.week)
      .year(body.year)
      .startOf('isoWeek');

    const dates = [...new Array(7)].map((_, i) => {
      return allDates.add(i, 'day').format('YYYY-MM-DD');
    });

    const findTime = (): string => {
      const totalMinutes = Math.floor(Math.random() * 144) * 10;

      // Convert total minutes to hours and minutes
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      // Format hours and minutes to always be two digits
      const formattedHours = hours.toString().padStart(2, '0');
      const formattedMinutes = minutes.toString().padStart(2, '0');
      const randomDate =
        shuffle(dates)[0] + 'T' + `${formattedHours}:${formattedMinutes}:00`;

      if (dayjs(randomDate).isBefore(dayjs())) {
        return findTime();
      }

      return randomDate;
    };

    for (const integration of getAllIntegrations) {
      for (const toPost of body.posts) {
        const group = makeId(10);
        const randomDate = findTime();

        await this.createPost(
          orgId,
          {
            type: 'draft',
            date: randomDate,
            order: '',
            shortLink: false,
            tags: [],
            posts: [
              {
                group,
                integration: {
                  id: integration.id,
                },
                settings: {
                  __type: integration.providerIdentifier as any,
                  title: '',
                  tags: [],
                  subreddit: [],
                },
                value: [
                  ...toPost.list.map((l) => ({
                    id: '',
                    content: l.post,
                    delay: 0,
                    image: [],
                  })),
                  {
                    id: '',
                    delay: 0,
                    content: `Check out the full story here:\n${
                      body.postId || body.url
                    }`,
                    image: [],
                  },
                ],
              },
            ],
          },
          'WEB'
        );
      }
    }
  }

  findAllExistingCategories() {
    return this._postRepository.findAllExistingCategories();
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._postRepository.findAllExistingTopicsOfCategory(category);
  }

  findPopularPosts(category: string, topic?: string) {
    return this._postRepository.findPopularPosts(category, topic);
  }

  async findFreeDateTime(orgId: string, integrationId?: string) {
    const findTimes = await this._integrationService.findFreeDateTime(
      orgId,
      integrationId
    );
    return this.findFreeDateTimeRecursive(
      orgId,
      findTimes,
      dayjs.utc().startOf('day')
    );
  }

  async createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._postRepository.createPopularPosts(post);
  }

  private async findFreeDateTimeRecursive(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs
  ): Promise<string> {
    const list = await this._postRepository.getPostsCountsByDates(
      orgId,
      times,
      date
    );

    if (!list.length) {
      return this.findFreeDateTimeRecursive(orgId, times, date.add(1, 'day'));
    }

    const num = list.reduce<null | number>((prev, curr) => {
      if (prev === null || prev > curr) {
        return curr;
      }
      return prev;
    }, null) as number;

    return date.clone().add(num, 'minutes').format('YYYY-MM-DDTHH:mm:00');
  }

  getComments(postId: string) {
    return this._postRepository.getComments(postId);
  }

  getTags(orgId: string) {
    return this._postRepository.getTags(orgId);
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._postRepository.createTag(orgId, body);
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._postRepository.editTag(id, orgId, body);
  }

  deleteTag(id: string, orgId: string) {
    return this._postRepository.deleteTag(id, orgId);
  }

  createComment(
    orgId: string,
    userId: string,
    postId: string,
    comment: string
  ) {
    return this._postRepository.createComment(orgId, userId, postId, comment);
  }
}
