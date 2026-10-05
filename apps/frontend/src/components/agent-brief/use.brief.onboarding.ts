'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import i18next from 'i18next';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';

export const BRIEF_ONBOARDING_KEY = 'brief-onboarding';

export interface BriefOnboardingStatus {
  // False when this install has no onboarding site configured.
  available: boolean;
  // Whether the next finished run takes credits (wallet workspace, no free
  // run left). Absent from older servers.
  nextRunCharged?: boolean;
  running: { id: string; createdAt: string } | null;
  last: {
    id: string;
    status: 'DONE' | 'FAILED';
    finishedAt: string | null;
    error: string | null;
  } | null;
}

// The open and the last finished onboarding run of this workspace.
export const useBriefOnboarding = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/brief/onboarding')).json();
  }, [fetch]);

  return useSWR<BriefOnboardingStatus>(BRIEF_ONBOARDING_KEY, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

// Opens (or reopens) the onboarding run and sends the browser to it. A
// wallet refusal never resolves the request (the top-up opens instead), so
// the busy state also clears on a timer.
export const useStartBriefOnboarding = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    const reset = setTimeout(() => setBusy(false), 5000);
    try {
      const response = await fetch('/brief/onboarding', {
        method: 'POST',
        body: JSON.stringify({ lang: i18next.resolvedLanguage || 'en' }),
      });
      const data = response.ok ? await response.json() : null;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('no url');
    } catch {
      clearTimeout(reset);
      setBusy(false);
      toaster.show(
        t(
          'brief_onboarding_start_failed',
          'Could not open the onboarding. Try again in a moment.'
        ),
        'warning'
      );
    }
  }, [fetch, t, toaster]);

  return { start, busy };
};
