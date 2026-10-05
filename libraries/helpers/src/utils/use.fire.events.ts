import { usePlausible } from 'next-plausible';
import { useCallback, useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// A product event. PostHog gets it whenever it was set up for this instance
// (NEXT_PUBLIC_POSTHOG_KEY + NEXT_PUBLIC_POSTHOG_HOST); without them this does
// nothing, so a self-hosted instance sends nothing anywhere. Plausible keeps
// its old rule and only hears events where billing is on.
// The user is identified once, by id only, in AnalyticsIdentify.
export const useFireEvents = () => {
  const { billingEnabled } = useVariables();
  const plausible = usePlausible();
  const posthog = usePostHog();

  return useCallback(
    (
      name: string,
      props?: Record<string, unknown>,
      // e.g. { send_instantly: true } right before the page goes away
      options?: Record<string, unknown>
    ) => {
      try {
        // Without a key the provider is not mounted and this is the bare,
        // never initialised client.
        if ((posthog as any)?.__loaded) {
          posthog.capture(name, props, options as any);
        }
        if (billingEnabled) {
          plausible(name, { props });
        }
      } catch {
        // Analytics must never break the screen that fired it.
      }
    },
    [posthog, billingEnabled, plausible]
  );
};

// Fires `name` once when the screen mounts.
export const useTrackView = (name: string, props?: Record<string, unknown>) => {
  const fireEvents = useFireEvents();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) {
      return;
    }
    sent.current = true;
    fireEvents(name, props);
  }, []);
};

// The shape of what the composer sends: how many channels, how long the
// thread is and whether any media is attached. Never the text itself.
export const postEventName = (type: string) =>
  type === 'draft'
    ? 'draft_saved'
    : type === 'update'
    ? 'post_updated'
    : 'post_scheduled';

export const postEventProps = (
  type: string,
  posts: Array<{ value?: Array<{ image?: unknown[] }> }>,
  extra?: Record<string, unknown>
) => ({
  mode: type,
  provider_count: posts.length,
  thread_length: Math.max(0, ...posts.map((p) => p.value?.length || 0)),
  has_media: posts.some((p) =>
    (p.value || []).some((v) => (v.image || []).length > 0)
  ),
  ...(extra || {}),
});
