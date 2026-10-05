// The wallet layer of PostsService must never touch a paid plan's posts: no
// charge, no wallet read, and a wallet error can't remove, draft or block a
// post. Plain stubs only.
jest.mock('@gitroom/nestjs-libraries/dtos/posts/create.post.dto', () => ({}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/track/product.analytics', () => ({
  captureOrgEvent: jest.fn(),
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/post-revisions/post-revision.service',
  () => ({ PostRevisionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/wallet/wallet.alert', () => ({
  walletAlert: jest.fn(async () => undefined),
}));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

const ACTIVE = {
  subscription: {
    subscriptionTier: 'ULTIMATE',
    cancelAt: null,
    deletedAt: null,
  },
};

const setup = (org: any) => {
  const repository: any = {
    organizationSubscription: jest.fn(async () => org),
    organizationBillingState: jest.fn(async () => org),
    createOrUpdatePost: jest.fn(async () => ({
      posts: [{ id: 'p1', group: 'g1', state: 'QUEUE' }],
    })),
    deletePost: jest.fn(async () => ({ id: 'p1' })),
    changeState: jest.fn(async () => ({
      id: 'p1',
      group: 'g1',
      organizationId: 'org',
    })),
    getPostById: jest.fn(async () => ({
      id: 'p1',
      group: 'g1',
      state: 'QUEUE',
      publishDate: new Date(),
      integration: { providerIdentifier: 'x' },
    })),
    changeDate: jest.fn(async () => ({})),
    updatePost: jest.fn(),
  };
  const walletError = new Error('wallet is down');
  const walletPosts: any = {
    assertCanSchedule: jest.fn(async () => {
      throw walletError;
    }),
    settleGroups: jest.fn(async () => {
      throw walletError;
    }),
  };
  const walletService: any = {
    providerLocked: jest.fn(),
    getWallet: jest.fn(async () => {
      throw walletError;
    }),
  };
  const integrationService: any = {
    canUseProvider: jest.fn(async () => true),
  };
  const integrationManager: any = {
    getSocialIntegration: jest.fn(() => ({ stripLinks: () => false })),
  };
  const revisions: any = {
    captureSnapshot: jest.fn(async () => undefined),
    resolveChainId: jest.fn(async () => undefined),
    deleteChain: jest.fn(async () => undefined),
  };
  const temporal: any = {};
  const service = new PostsService(
    repository,
    integrationManager,
    integrationService,
    {} as any,
    {} as any,
    {} as any,
    temporal,
    {} as any,
    revisions,
    walletService,
    walletPosts
  );
  (service as any).startWorkflow = jest.fn(async () => undefined);
  return { service, repository, walletPosts, walletService };
};

const body: any = {
  type: 'schedule',
  date: '2026-10-10T10:00:00',
  shortLink: false,
  tags: [],
  posts: [
    {
      group: 'g1',
      integration: { id: 'i1' },
      settings: { __type: 'x' },
      value: [{ content: 'hello', image: [] }],
    },
  ],
};

describe('PostsService on a paid plan', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('saves without ever calling the wallet', async () => {
    const { service, repository, walletPosts } = setup({
      ...ACTIVE,
      wallet: null,
    });
    const result = await service.createPost('org', body, 'APP' as any);
    expect(result).toEqual([{ postId: 'p1', integration: 'i1' }]);
    expect(walletPosts.assertCanSchedule).not.toHaveBeenCalled();
    expect(walletPosts.settleGroups).not.toHaveBeenCalled();
    expect(repository.deletePost).not.toHaveBeenCalled();
    expect(repository.changeState).not.toHaveBeenCalled();
  });

  it('a wallet error cannot delete or draft the post (leftover wallet)', async () => {
    const { service, repository, walletPosts } = setup({
      ...ACTIVE,
      wallet: { id: 'w1' },
    });
    const result = await service.createPost(
      'org',
      { ...body, posts: [{ ...body.posts[0] }] },
      'APP' as any
    );
    expect(result).toEqual([{ postId: 'p1', integration: 'i1' }]);
    expect(walletPosts.assertCanSchedule).not.toHaveBeenCalled();
    // Only a refund of what is left, which fails quietly.
    expect(walletPosts.settleGroups).toHaveBeenCalledWith(
      'org',
      expect.any(Array),
      expect.objectContaining({ refundOnly: true })
    );
    expect(repository.deletePost).not.toHaveBeenCalled();
    expect(repository.changeState).not.toHaveBeenCalled();
  });

  it('status, date, delete and failure skip the wallet', async () => {
    const { service, repository, walletPosts } = setup({
      ...ACTIVE,
      wallet: null,
    });
    await expect(
      service.changePostStatus('org', 'p1', 'schedule')
    ).resolves.toEqual({ id: 'p1', state: 'QUEUE' });
    await service.changePostStatus('org', 'p1', 'draft');
    await service.changeDate('org', 'p1', '2026-10-11T10:00:00');
    await service.deletePost('org', 'g1');
    await service.changeState('p1', 'ERROR');
    expect(walletPosts.settleGroups).not.toHaveBeenCalled();
    // changeDate never had to put the post back.
    expect(repository.changeDate).toHaveBeenCalledTimes(1);
  });

  it('the calendar does not read why posts failed', async () => {
    const { service, repository } = setup({ ...ACTIVE, wallet: null });
    repository.getPosts = jest.fn(async () => [{ id: 'p1' }]);
    const posts = await service.getPosts('org', {} as any);
    expect(posts).toEqual([{ id: 'p1' }]);
    expect(repository.getPosts).toHaveBeenCalledWith('org', {}, undefined);
  });
});

describe('PostsService without a paid plan', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('still settles the wallet and drafts an unpaid save', async () => {
    const { service, repository, walletPosts } = setup({
      subscription: null,
      wallet: { id: 'w1' },
    });
    walletPosts.assertCanSchedule.mockResolvedValue(undefined);
    await expect(
      service.createPost('org', body, 'APP' as any)
    ).rejects.toThrow('wallet is down');
    expect(walletPosts.settleGroups).toHaveBeenCalled();
    expect(repository.changeState).toHaveBeenCalledWith('p1', 'DRAFT');
  });
});
