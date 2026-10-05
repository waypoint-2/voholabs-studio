jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);

import {
  cleanErrorText,
  describePostError,
  errorMessageForAgent,
  POST_ERROR_MAX,
} from '@gitroom/nestjs-libraries/chat/tools/post.error.shared';
import { notEnoughCreditsMessage } from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';

// A post's stored error as the workflow writes it: JSON.stringify of a
// Temporal ActivityFailure, proto failure included.
const temporalFailure = (type: string, message: string) =>
  JSON.stringify({
    cause: { type, nonRetryable: true, details: [{ identifier: 'x' }] },
    failure: {
      message: 'Activity task failed',
      stackTrace:
        'ActivityFailure: Activity task failed\n    at /app/libraries/nestjs-libraries/src/integrations/social/x.provider.ts:120:11',
      cause: {
        message,
        stackTrace: 'at /app/apps/orchestrator/src/activities/post.activity.ts:88:5',
        applicationFailureInfo: {
          type,
          details: {
            payloads: [
              {
                metadata: { encoding: 'anNvbi9wbGFpbg==' },
                data: 'eyJpZGVudGlmaWVyIjoieCIsImpzb24iOiJ7XCJlcnJvclwiOlwiYmFkXCJ9In0aaaaaaaaaaaaaaaa',
              },
            ],
          },
        },
      },
      activityFailureInfo: { identity: '1234@worker-7f9c', activityId: '12' },
    },
    activityType: 'postSocial',
    activityId: '12',
    retryState: 'NON_RETRYABLE_FAILURE',
    identity: '1234@worker-7f9c',
  });

const expectClean = (text: string | null) => {
  expect(text).toBeTruthy();
  expect(text!.length).toBeLessThanOrEqual(POST_ERROR_MAX);
  expect(text).not.toMatch(/\/app\//);
  expect(text).not.toMatch(/worker-7f9c/);
  expect(text).not.toMatch(/eyJ/);
  expect(text).not.toMatch(/\n/);
};

describe('describePostError', () => {
  it('returns nulls for a post with no error', () => {
    expect(describePostError(null)).toEqual({ error: null, errorKind: null });
  });

  it('reads a failed token refresh as refresh_needed', () => {
    const result = describePostError(
      temporalFailure('refresh_token', 'Token expired')
    );
    expect(result.errorKind).toBe('refresh_needed');
    expectClean(result.error);
  });

  it('reads the workflow\'s own "Refresh channel needed" too', () => {
    expect(describePostError('Refresh channel needed').errorKind).toBe(
      'refresh_needed'
    );
    expect(describePostError('Channel disabled').errorKind).toBe(
      'channel_disabled'
    );
  });

  it("keeps the platform's own reason for a rejected post", () => {
    const result = describePostError(
      temporalFailure(
        'bad_body',
        'Your Tweet text is too long. See /app/libraries/x.ts:10:2 for details'
      )
    );
    expect(result.errorKind).toBe('provider');
    expect(result.error).toContain('Your Tweet text is too long');
    expectClean(result.error);
  });

  it('caps a long platform reason at one short line', () => {
    const result = describePostError(
      temporalFailure('bad_body', `${'word '.repeat(200)}\nsecond line`)
    );
    expectClean(result.error);
    expect(result.error).not.toContain('second line');
  });

  it('says only that it failed for an unrecognised serialized failure', () => {
    const result = describePostError(temporalFailure('other', ''));
    expect(result).toEqual({
      error: 'The post could not be published.',
      errorKind: 'unknown',
    });
  });

  it('marks a link to a post that never published as reference', () => {
    expect(
      describePostError(
        'This post links to a post that will never publish (abc)'
      ).errorKind
    ).toBe('reference');
  });

  it('keeps the wallet kind and its message', () => {
    const result = describePostError(
      temporalFailure('wallet', notEnoughCreditsMessage()),
      'wallet'
    );
    expect(result.errorKind).toBe('wallet');
    expect(result.error).toBe(cleanErrorText(notEnoughCreditsMessage()));
  });

  it('cleans a plain error with a stack trace', () => {
    const result = describePostError(
      'Error: socket hang up\n    at TLSSocket.onClose (/app/node_modules/x.js:1:1)'
    );
    expect(result).toEqual({ error: 'Error: socket hang up', errorKind: 'unknown' });
  });

  it('keeps URLs readable', () => {
    expect(cleanErrorText('Request to https://api.x.com/2/tweets failed')).toBe(
      'Request to https://api.x.com/2/tweets failed'
    );
  });

  it('cleans a thrown error message', () => {
    expect(
      errorMessageForAgent(new Error('boom at /app/libraries/a/b.ts:1:2'))
    ).toBe('boom');
    expect(errorMessageForAgent('nope')).toBe('Unexpected error');
  });
});

describe('postsList', () => {
  const posts = [
    {
      id: 'p1',
      state: 'ERROR',
      publishDate: new Date('2026-10-01T10:00:00Z'),
      content: 'one',
      error: temporalFailure('refresh_token', 'Token expired'),
      errorKind: null,
      integration: { id: 'i1', name: 'X', providerIdentifier: 'x' },
    },
    {
      id: 'p2',
      state: 'QUEUE',
      publishDate: new Date('2026-10-02T10:00:00Z'),
      content: 'two',
      error: null,
      errorKind: null,
      integration: { id: 'i1', name: 'X', providerIdentifier: 'x' },
    },
  ];
  const postsService = {
    getPosts: jest.fn(async () => posts),
    extractPostReferences: () => [] as string[],
  };
  const mediaService = { getMediaByPathsForOrg: jest.fn(async () => []) };
  const tool = new PostsListTool(
    postsService as any,
    mediaService as any
  ).run() as any;

  const context = () => {
    const store = new Map<string, string>([
      // Without a paid plan: a paid plan gets the list without reasons.
      [
        'organization',
        JSON.stringify({
          id: 'org-1',
          subscription: { subscriptionTier: 'FREE', cancelAt: '2020-01-01' },
        }),
      ],
    ]);
    return {
      requestContext: {
        set: (key: string, value: string) => store.set(key, value),
        get: (key: string) => store.get(key),
      },
    };
  };

  it('returns a short error and its kind, never the stored failure', async () => {
    const result = await tool.execute({}, context());
    const failed = result.posts.find((post: any) => post.id === 'p1');
    expect(failed.errorKind).toBe('refresh_needed');
    expectClean(failed.error);
    expect(result.posts.find((post: any) => post.id === 'p2')).toMatchObject({
      error: null,
      errorKind: null,
    });
  });

  it('filters by state', async () => {
    const result = await tool.execute({ state: 'ERROR' }, context());
    expect(result.posts.map((post: any) => post.id)).toEqual(['p1']);
    expect(result.total).toBe(1);
  });
});
