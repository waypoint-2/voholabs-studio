// A paid plan's MCP answers as it did before the wallet: the same tools,
// the same shapes, no wallet reads.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import { readFileSync } from 'fs';
import { join } from 'path';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PostsStatusTool } from '@gitroom/nestjs-libraries/chat/tools/posts.status.tool';
import { AnalyticsChannelTool } from '@gitroom/nestjs-libraries/chat/tools/analytics.channel.tool';
import { BriefAssetTool } from '@gitroom/nestjs-libraries/chat/tools/brief.asset.tool';

const PAID = {
  id: 'org-1',
  subscription: { subscriptionTier: 'ULTIMATE', cancelAt: null },
};
const FREE = {
  id: 'org-1',
  subscription: { subscriptionTier: 'FREE', cancelAt: '2020-01-01' },
};

const context = (org: any) => {
  const store = new Map<string, string>();
  return {
    mcp: { extra: { authInfo: org } },
    requestContext: {
      set: (key: string, value: string) => store.set(key, value),
      get: (key: string) => store.get(key),
    },
  };
};

// tool.list imports every tool; its name lists are read from the source.
const toolList = readFileSync(join(__dirname, 'tool.list.ts'), 'utf8');
const namesIn = (constant: string) =>
  Array.from(
    (
      toolList.match(
        new RegExp(`export const ${constant} = \\[([\\s\\S]*?)\\];`)
      )?.[1] || ''
    ).matchAll(/'(\w+)'/g)
  ).map((match) => match[1]);
const notOnPlanToolNames = namesIn('notOnPlanToolNames');
const paidToolNames = namesIn('paidToolNames');

describe('the tools a paid plan is served', () => {
  it('leaves out the wallet and skills tools, and only those', () => {
    expect(notOnPlanToolNames.sort()).toEqual(
      [
        'skillGet',
        'skillsList',
        'walletBalance',
        'walletPrices',
        'walletTransactions',
      ].sort()
    );
    // Nothing a paid plan had before is left out.
    expect(
      paidToolNames.filter(
        (name) =>
          notOnPlanToolNames.includes(name) &&
          !['skillsList', 'skillGet'].includes(name)
      )
    ).toEqual([]);
  });

  it('keeps briefAssetTool marked as not destructive', () => {
    const tool = new BriefAssetTool({} as any).run() as any;
    expect(tool.mcp.annotations.destructiveHint).toBe(false);
  });
});

describe('postsList', () => {
  const post = {
    id: 'p1',
    group: 'g1',
    state: 'ERROR',
    publishDate: new Date(0),
    content: 'hi',
    releaseURL: null,
    error: '{"message":"boom"}',
    errorKind: null,
    integration: { id: 'i1', name: 'X', providerIdentifier: 'x' },
  };
  const make = () => {
    const postsService = {
      getPosts: jest.fn(async () => [post]),
      extractPostReferences: () => [] as string[],
    };
    const mediaService = { getMediaByPathsForOrg: jest.fn(async () => []) };
    const tool = new PostsListTool(
      postsService as any,
      mediaService as any
    ).run() as any;
    return { tool, postsService };
  };

  it('returns no failure reason to a paid plan and does not ask for one', async () => {
    const { tool, postsService } = make();
    const result = await tool.execute({}, context(PAID));
    expect(postsService.getPosts.mock.calls[0][2]).not.toHaveProperty(
      'includeError'
    );
    expect(result.posts[0]).not.toHaveProperty('error');
    expect(result.posts[0]).not.toHaveProperty('errorKind');
  });

  it('returns the failure reason without a paid plan', async () => {
    const { tool, postsService } = make();
    const result = await tool.execute({}, context(FREE));
    expect(postsService.getPosts.mock.calls[0][2]).toMatchObject({
      includeError: true,
    });
    expect(result.posts[0]).toHaveProperty('errorKind');
  });
});

describe('postStatusTool', () => {
  it('drafts with DRAFT (it used to queue the post)', async () => {
    const postsService = {
      changePostStatus: jest.fn(async () => ({})),
      getPostsRecursively: jest.fn(),
    };
    const tool = new PostsStatusTool(postsService as any, {} as any).run() as any;
    await tool.execute({ id: 'p1', status: 'DRAFT' }, context(PAID));
    expect(postsService.changePostStatus).toHaveBeenCalledWith(
      'org-1',
      'p1',
      'draft'
    );
  });

  it('queues on a paid plan without reading the wallet', async () => {
    const postsService = {
      changePostStatus: jest.fn(async () => ({})),
      getPostsRecursively: jest.fn(),
    };
    const tool = new PostsStatusTool(postsService as any, {} as any).run() as any;
    const result = await tool.execute(
      { id: 'p1', status: 'QUEUE' },
      context(PAID)
    );
    expect(result).toEqual({ changed: true, status: 'QUEUE' });
    expect(postsService.getPostsRecursively).not.toHaveBeenCalled();
  });

  it('passes a raw error through on a paid plan', async () => {
    const postsService = {
      changePostStatus: jest.fn(async () => {
        throw new Error('Post not found');
      }),
    };
    const tool = new PostsStatusTool(postsService as any, {} as any).run() as any;
    const result = await tool.execute(
      { id: 'p1', status: 'DRAFT' },
      context(PAID)
    );
    expect(result).toEqual({
      error: 'Failed to change the post status: Post not found',
    });
  });
});

describe('channelAnalyticsTool', () => {
  const rows = [{ label: 'Impressions', data: [] }];

  it('answers a paid plan as before: cache only, no dates', async () => {
    const integrationService = {
      checkAnalytics: jest.fn(async () => rows),
      analyticsUpdatedAt: jest.fn(async () => '2026-10-01T00:00:00.000Z'),
    };
    const tool = new AnalyticsChannelTool(integrationService as any).run() as any;
    const result = await tool.execute(
      { id: 'c1', fresh: true },
      context(PAID)
    );
    expect(result).toEqual({ analytics: rows });
    expect(integrationService.checkAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'org-1' }),
      'c1',
      '30'
    );
    expect(integrationService.analyticsUpdatedAt).not.toHaveBeenCalled();
  });

  it('dates the answer and honours fresh without a paid plan', async () => {
    const integrationService = {
      checkAnalytics: jest.fn(async () => rows),
      analyticsUpdatedAt: jest.fn(async () => null),
    };
    const tool = new AnalyticsChannelTool(integrationService as any).run() as any;
    const result = await tool.execute({ id: 'c1', fresh: true }, context(FREE));
    expect(integrationService.checkAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      'c1',
      '30',
      false,
      true
    );
    expect(result).toHaveProperty('note');
  });
});
