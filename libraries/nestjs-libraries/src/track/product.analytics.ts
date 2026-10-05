import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// Product events that only the server sees (a post going out, an MCP client
// connecting), sent to the same PostHog project as the app's own events.
// Uses the app's public project key, so it is on exactly when the app's
// analytics are; without the key nothing is sent anywhere.
//
// These events belong to an organization, not to a person: there is no
// person behind a scheduled publish. They carry `org_id`, like every event
// from the app does, so a funnel counted by organization joins both.

const key = () => process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = () =>
  (process.env.NEXT_PUBLIC_POSTHOG_HOST || '').replace(/\/+$/, '');

export const productAnalyticsEnabled = () => !!key() && !!host();

// Fire and forget: never awaited by the caller, never throws.
export const captureOrgEvent = (
  orgId: string,
  event: string,
  properties: Record<string, unknown> = {}
) => {
  if (!productAnalyticsEnabled() || !orgId) {
    return;
  }
  fetch(`${host()}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key(),
      event,
      distinct_id: `org_${orgId}`,
      properties: {
        ...properties,
        org_id: orgId,
        app: 'studio',
        source: 'server',
        // Do not create a person for the organization.
        $process_person_profile: false,
      },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Analytics must never fail the work that fired it.
  });
};

// An MCP request from an organization: `mcp_connected` the first time ever,
// `mcp_active` once a day after that. One Redis write per request, and none
// at all when analytics are off.
export const trackMcpUse = (orgId?: string) => {
  if (!productAnalyticsEnabled() || !orgId) {
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  ioRedis
    .set(`analytics:mcp:${orgId}:${day}`, '1', 'EX', 60 * 60 * 26, 'NX')
    .then(async (fresh) => {
      if (fresh !== 'OK') {
        return;
      }
      const first = await ioRedis.set(
        `analytics:mcp:${orgId}:seen`,
        '1',
        'NX'
      );
      captureOrgEvent(orgId, first === 'OK' ? 'mcp_connected' : 'mcp_active');
    })
    .catch(() => {
      // Redis being down must not touch the MCP.
    });
};
