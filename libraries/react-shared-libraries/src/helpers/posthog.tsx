'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { FC, ReactNode } from 'react';
export const PHProvider: FC<{
  children: ReactNode;
  phkey?: string;
  host?: string;
}> = ({ children, phkey, host }) => {
  // Set up during the first render rather than in an effect: a child's
  // effects run before its parent's, and screens fire their first event from
  // an effect on mount.
  if (
    typeof window !== 'undefined' &&
    phkey &&
    host &&
    !(posthog as any).__loaded
  ) {
    posthog.init(phkey, {
      api_host: host,
      person_profiles: 'identified_only',
      // Nothing is stored on the device: the signed-in user is identified
      // again on every load, so no cookie is needed to recognise them.
      persistence: 'memory',
      // The app routes on the client, so a pageview is sent on every route
      // change and not only on the first load.
      capture_pageview: 'history_change',
      capture_pageleave: true,
      autocapture: true,
      // No screen recordings of the app, whatever the project settings say,
      // and no element text on clicks: the calendar, the composer and the
      // brief show customers' own content. Inputs are never captured.
      disable_session_recording: true,
      mask_all_text: true,
      // Every event from the app carries this, so its numbers can be told
      // apart from the marketing site's when both share a project.
      loaded: (ph) => {
        ph.register({ app: 'studio' });
      },
    });
  }
  if (!phkey || !host) {
    return <>{children}</>;
  }
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
