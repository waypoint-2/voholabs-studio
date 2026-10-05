// Run with Node's built-in runner (no extra setup, Graph is always mocked):
//   node --experimental-strip-types --test libraries/nestjs-libraries/src/integrations/social/recent.media.spec.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyGraphFailure,
  decodeCursor,
  encodeCursor,
  fetchRecentMediaPage,
  listRecentMedia,
  MEDIA_FIELDS,
  normalizeMediaItem,
  parseLimit,
  RecentMediaError,
  toRecentMediaErrorResponse,
} from './recent.media.ts';
import type {
  GraphFetch,
  RecentMediaDeps,
  RecentMediaIntegration,
  RecentMediaOptions,
  RecentMediaPage,
} from './recent.media.ts';

const SECRET = 'EAAB-secret-page-token';
const USER_SECRET = 'user-secret-token';

const graphImage = {
  id: '17900000000000001',
  caption: 'An image',
  media_type: 'IMAGE',
  media_product_type: 'FEED',
  media_url: 'https://cdn.example/img1.jpg',
  permalink: 'https://www.instagram.com/p/AAA/',
  timestamp: '2026-10-04T01:14:00+0000',
  // Fields that must never reach the response.
  like_count: 99,
  comments_count: 4,
  owner: { id: '555' },
  access_token: SECRET,
};

const graphVideo = {
  id: '17900000000000002',
  media_type: 'VIDEO',
  media_product_type: 'FEED',
  media_url: 'https://cdn.example/vid.mp4',
  thumbnail_url: 'https://cdn.example/vid.jpg',
  permalink: 'https://www.instagram.com/p/BBB/',
  timestamp: '2026-10-03T10:00:00+0000',
};

const graphReel = { ...graphVideo, id: '17900000000000003', media_product_type: 'REELS' };

const graphCarousel = {
  id: '17900000000000004',
  caption: 'A carousel',
  media_type: 'CAROUSEL_ALBUM',
  media_product_type: 'FEED',
  media_url: 'https://cdn.example/c1.jpg',
  permalink: 'https://www.instagram.com/p/CCC/',
  timestamp: '2026-10-02T10:00:00+0000',
  children: {
    data: [
      { id: 'c1', media_type: 'IMAGE', media_url: 'https://cdn.example/c1.jpg' },
      {
        id: 'c2',
        media_type: 'VIDEO',
        media_url: 'https://cdn.example/c2.mp4',
        thumbnail_url: 'https://cdn.example/c2.jpg',
      },
      { id: 'c3', media_type: 'IMAGE', media_url: 'https://cdn.example/c3.jpg' },
    ],
  },
};

const graphNoMediaUrl = {
  id: '17900000000000005',
  media_type: 'VIDEO',
  permalink: 'https://www.instagram.com/p/DDD/',
  timestamp: '2026-10-01T10:00:00+0000',
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const errResponse = (status: number, body: unknown) => ({
  ok: false,
  status,
  json: async () => body,
});

const recorder = (responses: Array<ReturnType<typeof okResponse> | Error>) => {
  const calls: string[] = [];
  const fetchImpl: GraphFetch = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra Graph call');
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchImpl };
};

describe('parseLimit', () => {
  it('defaults to 25 and accepts 1..50', () => {
    assert.equal(parseLimit(undefined), 25);
    assert.equal(parseLimit('1'), 1);
    assert.equal(parseLimit('50'), 50);
  });
  it('rejects 0, 51, abc, empty, decimals and arrays', () => {
    for (const bad of ['0', '51', 'abc', '', '2.5', '-1', ['1', '2'], null]) {
      assert.throws(() => parseLimit(bad), (e: unknown) => e instanceof RecentMediaError && e.code === 'bad_request');
    }
  });
});

describe('cursor', () => {
  it('round-trips and is opaque', () => {
    const after = 'QVFIUkN4abc_-=';
    const cursor = encodeCursor(after);
    assert.notEqual(cursor, after);
    assert.equal(decodeCursor(cursor), after);
    assert.equal(decodeCursor(undefined), undefined);
  });
  it('rejects malformed cursors', () => {
    const bad = [
      '',
      'not base64!',
      'e30', // {}
      Buffer.from(JSON.stringify({ v: 2, a: 'x' })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, a: 'x&access_token=evil' })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, a: 7 })).toString('base64url'),
      'A'.repeat(2000),
      ['x'],
    ];
    for (const raw of bad) {
      assert.throws(() => decodeCursor(raw), (e: unknown) => e instanceof RecentMediaError && e.code === 'bad_request');
    }
  });
});

describe('normalizeMediaItem (response whitelist)', () => {
  it('maps an image and drops everything outside the whitelist', () => {
    const item = normalizeMediaItem(graphImage)!;
    assert.deepEqual(item, {
      provider_post_id: '17900000000000001',
      permalink: 'https://www.instagram.com/p/AAA/',
      media_type: 'image',
      is_reel: false,
      caption: 'An image',
      published_at: '2026-10-04T01:14:00.000Z',
      thumbnail_url: 'https://cdn.example/img1.jpg',
      media_url: 'https://cdn.example/img1.jpg',
      children: [],
    });
    const json = JSON.stringify(item);
    for (const forbidden of ['access_token', SECRET, 'like_count', 'comments_count', 'owner', '___']) {
      assert.equal(json.includes(forbidden), false, forbidden);
    }
  });
  it('maps video, reel and a post without media_url', () => {
    const video = normalizeMediaItem(graphVideo)!;
    assert.equal(video.media_type, 'video');
    assert.equal(video.is_reel, false);
    assert.equal(video.thumbnail_url, 'https://cdn.example/vid.jpg');
    const reel = normalizeMediaItem(graphReel)!;
    assert.equal(reel.media_type, 'video');
    assert.equal(reel.is_reel, true);
    const none = normalizeMediaItem(graphNoMediaUrl)!;
    assert.equal(none.media_url, null);
    assert.equal(none.thumbnail_url, null);
    assert.equal(none.caption, null);
  });
  it('keeps carousel children in order with mixed types', () => {
    const item = normalizeMediaItem(graphCarousel)!;
    assert.equal(item.media_type, 'carousel');
    assert.deepEqual(
      item.children.map((c) => [c.provider_media_id, c.media_type]),
      [['c1', 'image'], ['c2', 'video'], ['c3', 'image']]
    );
    assert.equal(item.children[1].thumbnail_url, 'https://cdn.example/c2.jpg');
    assert.equal(item.children[0].thumbnail_url, 'https://cdn.example/c1.jpg');
  });
  it('drops items it cannot identify or order and ignores non-https urls', () => {
    assert.equal(normalizeMediaItem({ ...graphImage, id: undefined }), null);
    assert.equal(normalizeMediaItem({ ...graphImage, timestamp: 'garbage' }), null);
    assert.equal(normalizeMediaItem({ ...graphImage, media_type: 'STORY' }), null);
    assert.equal(normalizeMediaItem('nope'), null);
    const item = normalizeMediaItem({ ...graphImage, media_url: 'javascript:alert(1)', permalink: 'http://x' })!;
    assert.equal(item.media_url, null);
    assert.equal(item.permalink, null);
  });
});

describe('classifyGraphFailure', () => {
  const code = (status: number, error: object, cursor = false) =>
    classifyGraphFailure(status, { error }, cursor).code;
  it('maps Graph errors to fixed codes', () => {
    assert.equal(code(400, { code: 190 }), 'reconnect_required');
    assert.equal(code(400, { code: 100, error_subcode: 463 }), 'reconnect_required');
    assert.equal(code(400, { code: 10 }), 'missing_permission');
    assert.equal(code(403, { code: 200 }), 'missing_permission');
    for (const c of [4, 17, 32, 613]) assert.equal(code(400, { code: c }), 'rate_limited');
    assert.equal(classifyGraphFailure(429, undefined, false).code, 'rate_limited');
    assert.equal(code(400, { code: 100 }, true), 'bad_request');
    assert.equal(code(400, { code: 100 }, false), 'provider_unavailable');
    assert.equal(code(500, { code: 2 }), 'provider_unavailable');
    assert.equal(classifyGraphFailure(502, 'html', false).code, 'provider_unavailable');
  });
  it('never repeats the provider message', () => {
    const e = classifyGraphFailure(400, { error: { code: 190, message: `bad token ${SECRET}` } }, false);
    assert.equal(e.message.includes(SECRET), false);
  });
});

describe('fetchRecentMediaPage', () => {
  it('builds a single read-only Graph request and pages', async () => {
    const { calls, fetchImpl } = recorder([
      okResponse({
        data: [graphImage, graphVideo],
        paging: { cursors: { after: 'AFTER1' }, next: 'https://graph.facebook.com/next' },
      }),
    ]);
    const page = await fetchRecentMediaPage({
      host: 'graph.facebook.com',
      id: '1784',
      token: `${SECRET}___${USER_SECRET}`,
      limit: 30,
      after: 'PREV',
      fetchImpl,
    });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0]);
    assert.equal(url.host, 'graph.facebook.com');
    assert.equal(url.pathname, '/v21.0/1784/media');
    assert.equal(url.searchParams.get('limit'), '30');
    assert.equal(url.searchParams.get('after'), 'PREV');
    assert.equal(url.searchParams.get('fields'), MEDIA_FIELDS);
    assert.equal(url.searchParams.get('access_token'), SECRET);
    assert.equal(calls[0].includes(USER_SECRET), false);
    assert.equal(page.media.length, 2);
    assert.equal(page.nextAfter, 'AFTER1');
    assert.equal(JSON.stringify(page).includes(SECRET), false);
  });
  it('last page has no next cursor; empty account returns []', async () => {
    const last = await fetchRecentMediaPage({
      host: 'graph.instagram.com',
      id: '1',
      token: SECRET,
      limit: 25,
      fetchImpl: recorder([okResponse({ data: [graphImage], paging: { cursors: { after: 'X' } } })]).fetchImpl,
    });
    assert.equal(last.nextAfter, null);
    const empty = await fetchRecentMediaPage({
      host: 'graph.instagram.com',
      id: '1',
      token: SECRET,
      limit: 25,
      fetchImpl: recorder([okResponse({ data: [] })]).fetchImpl,
    });
    assert.deepEqual(empty, { media: [], nextAfter: null });
  });
  it('omits after when there is no cursor', async () => {
    const { calls, fetchImpl } = recorder([okResponse({ data: [] })]);
    await fetchRecentMediaPage({ host: 'graph.instagram.com', id: '1', token: SECRET, limit: 5, fetchImpl });
    assert.equal(new URL(calls[0]).searchParams.has('after'), false);
  });
  it('turns network errors into provider_unavailable without leaking the token', async () => {
    const { fetchImpl } = recorder([new Error(`connect ECONNRESET https://graph.facebook.com/?access_token=${SECRET}`)]);
    await assert.rejects(
      fetchRecentMediaPage({ host: 'graph.facebook.com', id: '1', token: SECRET, limit: 5, fetchImpl }),
      (e: unknown) =>
        e instanceof RecentMediaError && e.code === 'provider_unavailable' && !e.message.includes(SECRET)
    );
  });
  it('maps a Graph error body and a non-JSON or malformed body', async () => {
    await assert.rejects(
      fetchRecentMediaPage({
        host: 'graph.facebook.com',
        id: '1',
        token: SECRET,
        limit: 5,
        fetchImpl: recorder([errResponse(400, { error: { code: 190, message: SECRET } })]).fetchImpl,
      }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'reconnect_required' && !e.message.includes(SECRET)
    );
    await assert.rejects(
      fetchRecentMediaPage({
        host: 'graph.facebook.com',
        id: '1',
        token: SECRET,
        limit: 5,
        fetchImpl: recorder([okResponse({ nothing: true })]).fetchImpl,
      }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'provider_unavailable'
    );
    await assert.rejects(
      fetchRecentMediaPage({
        host: 'graph.facebook.com',
        id: '1',
        token: SECRET,
        limit: 5,
        fetchImpl: async () => ({
          ok: false,
          status: 503,
          json: async () => {
            throw new Error('not json');
          },
        }),
      }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'provider_unavailable'
    );
  });
});

describe('listRecentMedia (tenant scope, state checks, no side effects)', () => {
  const ORG = 'org-A';
  const base: RecentMediaIntegration = {
    id: 'int-1',
    organizationId: ORG,
    providerIdentifier: 'instagram',
    type: 'social',
    internalId: '1784',
    token: `${SECRET}___${USER_SECRET}`,
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    deletedAt: null,
  };
  const samplePage: RecentMediaPage = { media: [normalizeMediaItem(graphImage)!], nextAfter: 'NEXT' };

  const build = (overrides: Partial<RecentMediaIntegration> | null, byOrg?: Record<string, RecentMediaIntegration>) => {
    const providerCalls: Array<{ id: string; token: string; opts: RecentMediaOptions }> = [];
    const lookups: Array<[string, string]> = [];
    const deps: RecentMediaDeps = {
      getIntegration: async (orgId, id) => {
        lookups.push([orgId, id]);
        if (byOrg) return byOrg[orgId] && byOrg[orgId].id === id ? byOrg[orgId] : null;
        return overrides === null ? null : { ...base, ...overrides };
      },
      getProvider: () => ({
        recentMedia: async (id, token, opts) => {
          providerCalls.push({ id, token, opts });
          return samplePage;
        },
      }),
    };
    return { deps, providerCalls, lookups };
  };

  it('returns the page with an opaque cursor for the owning organization', async () => {
    const { deps, providerCalls } = build({});
    const result = await listRecentMedia(deps, ORG, 'int-1', { limit: 30 });
    assert.equal(providerCalls.length, 1);
    assert.deepEqual(providerCalls[0].opts, { limit: 30 });
    assert.equal(result.integrationId, 'int-1');
    assert.equal(result.provider, 'instagram');
    assert.equal(result.media.length, 1);
    assert.equal(decodeCursor(result.nextCursor!), 'NEXT');
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  });

  it('another tenant requesting this integration id gets not_found and no provider call', async () => {
    const { deps, providerCalls, lookups } = build(null, { [ORG]: base });
    await assert.rejects(
      listRecentMedia(deps, 'org-B', 'int-1', { limit: 25 }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'not_found' && e.status === 404
    );
    assert.deepEqual(lookups, [['org-B', 'int-1']]);
    assert.equal(providerCalls.length, 0);
  });

  it('defence in depth: a row from the wrong organization is not served', async () => {
    const { deps, providerCalls } = build({ organizationId: 'org-B' });
    await assert.rejects(
      listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'not_found'
    );
    assert.equal(providerCalls.length, 0);
  });

  it('unknown and soft-deleted integrations are not_found with no provider call', async () => {
    for (const setup of [build(null), build({ deletedAt: new Date() })]) {
      await assert.rejects(
        listRecentMedia(setup.deps, ORG, 'int-1', { limit: 25 }),
        (e: unknown) => e instanceof RecentMediaError && e.code === 'not_found'
      );
      assert.equal(setup.providerCalls.length, 0);
    }
  });

  it('non-Instagram and non-social integrations are unsupported_provider', async () => {
    for (const overrides of [{ providerIdentifier: 'x' }, { type: 'article' }]) {
      const { deps, providerCalls } = build(overrides);
      await assert.rejects(
        listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
        (e: unknown) => e instanceof RecentMediaError && e.code === 'unsupported_provider' && e.status === 400
      );
      assert.equal(providerCalls.length, 0);
    }
  });

  it('disabled, refreshNeeded and in-between-steps integrations are reconnect_required with no Graph call', async () => {
    for (const overrides of [{ disabled: true }, { refreshNeeded: true }, { inBetweenSteps: true }]) {
      const { deps, providerCalls } = build(overrides);
      await assert.rejects(
        listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
        (e: unknown) => e instanceof RecentMediaError && e.code === 'reconnect_required' && e.status === 409
      );
      assert.equal(providerCalls.length, 0);
    }
  });

  it('an expired token (Graph 190) is reconnect_required after exactly one call and the core has no way to disconnect', async () => {
    let calls = 0;
    const deps: RecentMediaDeps = {
      getIntegration: async () => base,
      getProvider: () => ({
        recentMedia: async (id, token, opts) => {
          calls += 1;
          return fetchRecentMediaPage({
            host: 'graph.facebook.com',
            id,
            token,
            limit: opts.limit,
            fetchImpl: recorder([errResponse(400, { error: { code: 190 } })]).fetchImpl,
          });
        },
      }),
    };
    // RecentMediaDeps exposes only a read and a provider lookup: there is no
    // refresh or disconnect dependency to call.
    assert.deepEqual(Object.keys(deps).sort(), ['getIntegration', 'getProvider']);
    await assert.rejects(
      listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'reconnect_required'
    );
    assert.equal(calls, 1);
  });

  it('unexpected provider failures become provider_unavailable', async () => {
    const deps: RecentMediaDeps = {
      getIntegration: async () => base,
      getProvider: () => ({
        recentMedia: async () => {
          throw new Error(`boom ${SECRET}`);
        },
      }),
    };
    await assert.rejects(
      listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'provider_unavailable' && !e.message.includes(SECRET)
    );
  });

  it('a provider without recentMedia is unsupported_provider', async () => {
    const deps: RecentMediaDeps = { getIntegration: async () => base, getProvider: () => ({}) };
    await assert.rejects(
      listRecentMedia(deps, ORG, 'int-1', { limit: 25 }),
      (e: unknown) => e instanceof RecentMediaError && e.code === 'unsupported_provider'
    );
  });
});

describe('toRecentMediaErrorResponse', () => {
  it('returns fixed bodies and hides unknown errors', () => {
    assert.deepEqual(toRecentMediaErrorResponse(new RecentMediaError('not_found')), {
      status: 404,
      body: { code: 'not_found', message: 'Integration not found.' },
    });
    const unknown = toRecentMediaErrorResponse(new Error(`secret ${SECRET}`));
    assert.equal(unknown.status, 502);
    assert.equal(unknown.body.code, 'provider_unavailable');
    assert.equal(JSON.stringify(unknown).includes(SECRET), false);
  });
});
