'use client';

import { useMemo } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useWalletPrices } from '@gitroom/frontend/components/wallet/wallet.hooks';

// plan: a paid plan (or an instance without billing). Never sees the wallet.
// payg: free plan with a wallet top-up; X, the brief and skills are open.
// free: free plan, nothing topped up; those features show locked.
export type WalletAccess = 'plan' | 'payg' | 'free';

export const useWalletAccess = (): WalletAccess | undefined => {
  const user = useUser();
  if (!user?.tier?.current) {
    return undefined;
  }
  if (user.tier.current !== 'FREE') {
    return 'plan';
  }
  // @ts-ignore - sent by /user/self, not part of the Prisma user
  return user.payAsYouGo ? 'payg' : 'free';
};

// Lock and coins colour. Anything that costs money or needs a top-up (a
// pay-per-use price, a feature the first top-up opens) carries the warm
// accent; the tone type stays so a second accent can come back in one place.
export type WalletTone = 'warm';

export const toneFor = (_billing?: string | null): WalletTone => 'warm';

export const TONE_TEXT: Record<WalletTone, string> = {
  warm: 'text-warm',
};

export const TONE_SOFT: Record<WalletTone, string> = {
  warm: 'bg-warmSoft',
};

export const useFeatureTone = (_feature: string): WalletTone => 'warm';

// The tone of one priced action (e.g. a channel's per-post price).
export const useActionTone = (
  _actionKey: string,
  fallback: WalletTone = 'warm',
  _enabled = true
): WalletTone => fallback;

// Providers whose channels charge per use, from the price rows. Their
// connected channels keep a warm ring wherever channels are listed or
// picked. Empty for paid plans.
export const usePerUseProviders = (): Set<string> => {
  const access = useWalletAccess();
  const walletOrg = access === 'free' || access === 'payg';
  const { data } = useWalletPrices(walletOrg);
  return useMemo(
    () =>
      new Set(
        walletOrg
          ? (data || [])
              .flatMap((s) => s.actions)
              .filter((a) => !!a.provider && a.billing === 'PER_USE')
              .map((a) => a.provider as string)
          : []
      ),
    [data, walletOrg]
  );
};

// The ring itself: warm, outside the avatar, so a selection border inside
// it still shows.
export const PER_USE_RING = 'ring-[2px] ring-warm';
