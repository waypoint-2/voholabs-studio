// Read-only "recent media" support for Instagram integrations.
//
// Backs `GET /public/v1/integrations/:id/media`. Deliberately pure: no Nest,
// Prisma or Temporal imports, so the whole read path (tenant check, error
// mapping, response whitelist, cursor handling) can be unit tested on its own.
//
// Rules this file enforces:
// - the integration must belong to the calling organization (anything else is
//   a 404, and the provider is never contacted);
// - the response is built field by field from a whitelist, never by spreading
//   the Graph object, so no token, id or engagement number can leak through;
// - failures surface only as a fixed set of codes with fixed messages, never
//   as provider bodies, URLs or tokens;
// - the endpoint has no side effects: it never refreshes, disables or
//   disconnects an integration (see the comment on `reconnect_required`).

export type RecentMediaErrorCode =
  | 'bad_request'
  | 'unsupported_provider'
  | 'missing_permission'
  | 'not_found'
  | 'reconnect_required'
  | 'rate_limited'
  | 'provider_unavailable';

const STATUS: Record<RecentMediaErrorCode, number> = {
  bad_request: 400,
  unsupported_provider: 400,
  missing_permission: 403,
  not_found: 404,
  reconnect_required: 409,
  rate_limited: 429,
  provider_unavailable: 502,
};

const MESSAGE: Record<RecentMediaErrorCode, string> = {
  bad_request: 'The request is not valid.',
  unsupported_provider: 'Recent media is only available for Instagram integrations.',
  missing_permission: 'The Instagram connection does not have permission to read media.',
  not_found: 'Integration not found.',
  reconnect_required: 'The Instagram connection needs to be reconnected.',
  rate_limited: 'Instagram is rate limiting requests. Try again later.',
  provider_unavailable: 'Instagram is temporarily unavailable.',
};

export class RecentMediaError extends Error {
  public readonly code: RecentMediaErrorCode;

  // `detail` is only ever a string written in this file, never provider text.
  constructor(code: RecentMediaErrorCode, detail?: string) {
    super(detail ?? MESSAGE[code]);
    this.name = 'RecentMediaError';
    this.code = code;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const toRecentMediaErrorResponse = (
  error: unknown
): { status: number; body: { code: RecentMediaErrorCode; message: string } } => {
  const known =
    error instanceof RecentMediaError
      ? error
      : new RecentMediaError('provider_unavailable');
  return {
    status: known.status,
    body: { code: known.code, message: known.message },
  };
};

export type RecentMediaType = 'image' | 'video' | 'carousel';

export interface RecentMediaChild {
  provider_media_id: string;
  media_type: 'image' | 'video';
  media_url: string | null;
  thumbnail_url: string | null;
}

export interface RecentMediaItem {
  provider_post_id: string;
  permalink: string | null;
  media_type: RecentMediaType;
  is_reel: boolean;
  caption: string | null;
  published_at: string;
  thumbnail_url: string | null;
  media_url: string | null;
  children: RecentMediaChild[];
}

export interface RecentMediaOptions {
  limit: number;
  // The raw Graph `after` cursor. Clients only ever see the opaque wrapper.
  after?: string;
}

export interface RecentMediaPage {
  media: RecentMediaItem[];
  nextAfter: string | null;
}

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 50;
const MAX_CHILDREN = 20;

export const parseLimit = (raw: unknown): number => {
  if (raw === undefined) {
    return DEFAULT_LIMIT;
  }
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) {
    throw new RecentMediaError('bad_request', 'limit must be an integer from 1 to 50.');
  }
  const value = Number(raw);
  if (value < 1 || value > MAX_LIMIT) {
    throw new RecentMediaError('bad_request', 'limit must be an integer from 1 to 50.');
  }
  return value;
};

const AFTER_PATTERN = /^[A-Za-z0-9+/=_-]{1,512}$/;

export const encodeCursor = (after: string): string =>
  Buffer.from(JSON.stringify({ v: 1, a: after }), 'utf8').toString('base64url');

export const decodeCursor = (raw: unknown): string | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  const invalid = () => new RecentMediaError('bad_request', 'cursor is not valid.');
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw invalid();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  const value = parsed as { v?: unknown; a?: unknown } | null;
  if (!value || value.v !== 1 || typeof value.a !== 'string' || !AFTER_PATTERN.test(value.a)) {
    throw invalid();
  }
  return value.a;
};

const httpsUrl = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 2048 && /^https:\/\//i.test(value)
    ? value
    : null;

const nonEmptyString = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;

const isoTime = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const mapChild = (raw: unknown): RecentMediaChild | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const child = raw as Record<string, unknown>;
  const id = nonEmptyString(child.id, 64);
  const type =
    child.media_type === 'IMAGE' ? 'image' : child.media_type === 'VIDEO' ? 'video' : null;
  if (!id || !type) {
    return null;
  }
  const mediaUrl = httpsUrl(child.media_url);
  return {
    provider_media_id: id,
    media_type: type,
    media_url: mediaUrl,
    thumbnail_url: httpsUrl(child.thumbnail_url) ?? (type === 'image' ? mediaUrl : null),
  };
};

// Explicit whitelist. An item that cannot be ordered or identified is dropped
// rather than guessed at.
export const normalizeMediaItem = (raw: unknown): RecentMediaItem | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const id = nonEmptyString(item.id, 64);
  const publishedAt = isoTime(item.timestamp);
  const type: RecentMediaType | null =
    item.media_type === 'IMAGE'
      ? 'image'
      : item.media_type === 'VIDEO'
        ? 'video'
        : item.media_type === 'CAROUSEL_ALBUM'
          ? 'carousel'
          : null;
  if (!id || !publishedAt || !type) {
    return null;
  }
  const mediaUrl = httpsUrl(item.media_url);
  const rawChildren = (item.children as { data?: unknown } | undefined)?.data;
  const children =
    type === 'carousel' && Array.isArray(rawChildren)
      ? rawChildren
          .slice(0, MAX_CHILDREN)
          .map(mapChild)
          .filter((c): c is RecentMediaChild => c !== null)
      : [];
  return {
    provider_post_id: id,
    permalink: httpsUrl(item.permalink),
    media_type: type,
    is_reel: item.media_product_type === 'REELS',
    caption: nonEmptyString(item.caption, 100_000),
    published_at: publishedAt,
    thumbnail_url: httpsUrl(item.thumbnail_url) ?? (type === 'video' ? null : mediaUrl),
    media_url: mediaUrl,
    children,
  };
};

// `reconnect_required` covers an expired or revoked token. This read path does
// not try to refresh it: RefreshIntegrationService.refresh() disables and
// disconnects the channel when a refresh fails, which a read must never do.
export const classifyGraphFailure = (
  httpStatus: number,
  body: unknown,
  hadCursor: boolean
): RecentMediaError => {
  const error = (body as { error?: { code?: unknown; error_subcode?: unknown } } | null | undefined)
    ?.error;
  const code = typeof error?.code === 'number' ? error.code : undefined;
  const subcode = typeof error?.error_subcode === 'number' ? error.error_subcode : undefined;

  if (code === 190 || subcode === 460 || subcode === 463 || subcode === 467) {
    return new RecentMediaError('reconnect_required');
  }
  if (httpStatus === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return new RecentMediaError('rate_limited');
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return new RecentMediaError('missing_permission');
  }
  if (code === 100 && hadCursor) {
    return new RecentMediaError('bad_request', 'cursor is not valid.');
  }
  return new RecentMediaError('provider_unavailable');
};

export type GraphHost = 'graph.facebook.com' | 'graph.instagram.com';

export type GraphFetch = (
  url: string,
  init: { signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';

export const fetchRecentMediaPage = async (input: {
  host: GraphHost;
  id: string;
  token: string;
  limit: number;
  after?: string;
  fetchImpl?: GraphFetch;
  timeoutMs?: number;
}): Promise<RecentMediaPage> => {
  // Same token handling as the analytics calls: the first part is the access
  // token, anything after `___` is the user token the Facebook flow appends.
  const accessToken = input.token.split('___')[0];
  if (!accessToken) {
    throw new RecentMediaError('reconnect_required');
  }

  const url = new URL(`https://${input.host}/v21.0/${encodeURIComponent(input.id)}/media`);
  url.searchParams.set('fields', MEDIA_FIELDS);
  url.searchParams.set('limit', String(input.limit));
  if (input.after) {
    url.searchParams.set('after', input.after);
  }
  url.searchParams.set('access_token', accessToken);

  const doFetch = input.fetchImpl ?? (fetch as unknown as GraphFetch);
  let response: Awaited<ReturnType<GraphFetch>>;
  try {
    response = await doFetch(url.toString(), {
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    });
  } catch {
    // The underlying error can carry the request URL, and so the token.
    throw new RecentMediaError('provider_unavailable');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const payload = body as
    | { data?: unknown; error?: unknown; paging?: { cursors?: { after?: unknown }; next?: unknown } }
    | null
    | undefined;
  if (!response.ok || payload?.error) {
    throw classifyGraphFailure(response.status, body, !!input.after);
  }
  if (!payload || !Array.isArray(payload.data)) {
    throw new RecentMediaError('provider_unavailable');
  }

  const media = payload.data
    .map(normalizeMediaItem)
    .filter((m): m is RecentMediaItem => m !== null);
  const after = payload.paging?.cursors?.after;
  const hasNext = typeof payload.paging?.next === 'string';
  return {
    media,
    nextAfter: hasNext && typeof after === 'string' && after.length > 0 ? after : null,
  };
};

export const INSTAGRAM_IDENTIFIERS = ['instagram', 'instagram-standalone'];

export interface RecentMediaIntegration {
  id: string;
  organizationId: string;
  providerIdentifier: string;
  type: string;
  internalId: string;
  token: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  deletedAt: Date | null;
}

export interface RecentMediaProvider {
  recentMedia?(id: string, accessToken: string, opts: RecentMediaOptions): Promise<RecentMediaPage>;
}

export interface RecentMediaDeps {
  // Must already be scoped to the organization (IntegrationRepository filters
  // on organizationId); the check below is defence in depth.
  getIntegration(
    orgId: string,
    integrationId: string
  ): Promise<RecentMediaIntegration | null | undefined>;
  getProvider(identifier: string): RecentMediaProvider | undefined;
}

export interface RecentMediaResult {
  integrationId: string;
  provider: string;
  media: RecentMediaItem[];
  nextCursor: string | null;
}

export const listRecentMedia = async (
  deps: RecentMediaDeps,
  orgId: string,
  integrationId: string,
  opts: RecentMediaOptions
): Promise<RecentMediaResult> => {
  const integration = await deps.getIntegration(orgId, integrationId);
  if (!integration || integration.deletedAt || integration.organizationId !== orgId) {
    throw new RecentMediaError('not_found');
  }
  if (
    integration.type !== 'social' ||
    !INSTAGRAM_IDENTIFIERS.includes(integration.providerIdentifier)
  ) {
    throw new RecentMediaError('unsupported_provider');
  }
  const provider = deps.getProvider(integration.providerIdentifier);
  if (!provider?.recentMedia) {
    throw new RecentMediaError('unsupported_provider');
  }
  if (integration.disabled || integration.refreshNeeded || integration.inBetweenSteps) {
    throw new RecentMediaError('reconnect_required');
  }

  let page: RecentMediaPage;
  try {
    page = await provider.recentMedia(integration.internalId, integration.token, opts);
  } catch (error) {
    throw error instanceof RecentMediaError ? error : new RecentMediaError('provider_unavailable');
  }

  return {
    integrationId: integration.id,
    provider: integration.providerIdentifier,
    media: page.media,
    nextCursor: page.nextAfter ? encodeCursor(page.nextAfter) : null,
  };
};
