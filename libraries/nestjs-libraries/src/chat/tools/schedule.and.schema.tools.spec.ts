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
const maxLength = jest.fn((isPremium: boolean) => (isPremium ? 25000 : 280));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({
    IntegrationManager: class {},
    socialIntegrationList: [
      { identifier: 'discord', maxLength: (...args: any[]) => maxLength(...(args as [boolean])), dto: null },
    ],
  })
);
jest.mock('@gitroom/nestjs-libraries/chat/validation.schemas.helper', () => ({
  getValidationSchemas: () => ({}),
}));

import * as walletShared from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import { IntegrationSchedulePostTool } from '@gitroom/nestjs-libraries/chat/tools/integration.schedule.post';
import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';

const context = () => {
  const store = new Map<string, string>();
  return {
    mcp: { extra: { authInfo: { id: 'org-1' } } },
    requestContext: {
      set: (key: string, value: string) => store.set(key, value),
      get: (key: string) => store.get(key),
    },
  };
};

describe('integrationSchema', () => {
  const tool = new IntegrationValidationTool({
    getAllTools: () => ({ discord: [] }),
    getAllRulesDescription: () => ({ discord: '' }),
  } as any).run() as any;

  it('does not need isPremium, and treats it as false', async () => {
    expect(tool.inputSchema.safeParse({ platform: 'discord' }).success).toBe(
      true
    );
    const result = await tool.execute({ platform: 'discord' }, context());
    expect(maxLength).toHaveBeenCalledWith(false);
    expect(result.output.maxLength).toBe(280);
  });
});

describe('integrationSchedulePostTool', () => {
  const build = () => {
    const createPost = jest.fn(async () => [
      { postId: 'p1', integration: 'i1' },
    ]);
    const tool = new IntegrationSchedulePostTool(
      {
        validatePosts: async () => [
          { name: 'Discord', valid: true, errors: true, tooLong: false },
        ],
        createPost,
      } as any,
      {
        getIntegrationById: async () => ({
          id: 'i1',
          providerIdentifier: 'discord',
        }),
      } as any,
      {} as any,
      {} as any
    ).run() as any;
    return { tool, createPost };
  };

  const post = (type: string) => ({
    integrationId: 'i1',
    date: '2026-12-01T10:00:00Z',
    shortLink: false,
    type,
    postsAndComments: [{ content: '<p>hi</p>', attachments: [] }],
    settings: [],
  });

  beforeEach(() => {
    jest.spyOn(walletShared, 'walletPostCost').mockResolvedValue(3225);
    jest.spyOn(walletShared, 'walletWarning').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not need isPremium', () => {
    const { tool } = build();
    expect(
      tool.inputSchema.safeParse({ socialPost: [post('draft')] }).success
    ).toBe(true);
  });

  it('gives a draft costWhenScheduled, not cost', async () => {
    const { tool } = build();
    const result = await tool.execute(
      { socialPost: [post('draft')] },
      context()
    );
    const [item] = result.output;
    expect(item.cost).toBeUndefined();
    expect(item.costWhenScheduled).toBe(walletShared.toCredits(3225));
  });

  it('gives a scheduled post cost', async () => {
    const { tool } = build();
    const result = await tool.execute(
      { socialPost: [post('schedule')] },
      context()
    );
    const [item] = result.output;
    expect(item.cost).toBe(walletShared.toCredits(3225));
    expect(item.costWhenScheduled).toBeUndefined();
  });
});
