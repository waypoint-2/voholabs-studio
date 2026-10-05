'use client';

import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { User } from '@prisma/client';
import {
  pricing,
  PricingInnerInterface,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
export const UserContext = createContext<
  | undefined
  | (User & {
      orgId: string;
      tier: PricingInnerInterface;
      publicApi: string;
      role: 'USER' | 'ADMIN' | 'SUPERADMIN';
      totalChannels: number;
      isLifetime?: boolean;
      impersonate: boolean;
      allowTrial: boolean;
      isTrailing: boolean;
      // End of the free trial, `null` when whitelisted forever
      trialEndsAt: string | null;
      needsOnboarding: boolean;
      needsTerms: boolean;
      streakSince: string | null;
    })
>(undefined);
export const ContextWrapper: FC<{
  user: User & {
    orgId: string;
    tier: 'FREE' | 'STANDARD' | 'PRO' | 'ULTIMATE' | 'TEAM';
    role: 'USER' | 'ADMIN' | 'SUPERADMIN';
    publicApi: string;
    totalChannels: number;
  };
  children: ReactNode;
}> = ({ user, children }) => {
  const values = user
    ? {
        ...user,
        tier: pricing[user.tier],
      }
    : ({} as any);
  return (
    <UserContext.Provider value={values}>
      <AnalyticsIdentify user={user} />
      {children}
    </UserContext.Provider>
  );
};

// FREE, PAY_AS_YOU_GO (free plan with a wallet top-up), TRIAL or PAID.
export const planTier = (user: {
  tier?: string;
  payAsYouGo?: boolean;
  trialEndsAt?: string | null;
}) =>
  !user.tier || user.tier === 'FREE'
    ? user.payAsYouGo
      ? 'PAY_AS_YOU_GO'
      : 'FREE'
    : user.trialEndsAt
    ? 'TRIAL'
    : 'PAID';

// Tells PostHog who is using the app, by ids only: no email and no name.
// Every later event carries the organization and its plan, so usage can be
// split by plan. Does nothing when PostHog is not set up.
const AnalyticsIdentify: FC<{ user: any }> = ({ user }) => {
  const posthog = usePostHog();
  const plan = user ? planTier(user) : undefined;
  useEffect(() => {
    if (!user?.id || user.impersonate || !(posthog as any)?.__loaded) {
      return;
    }
    try {
      const props = {
        org_id: user.orgId,
        plan_tier: plan,
        plan_name: user.tier,
        role: user.role,
      };
      posthog.identify(user.id, props);
      posthog.register(props);
    } catch {
      // Analytics must never break the app.
    }
  }, [posthog, user?.id, user?.orgId, plan, user?.tier, user?.role]);
  return null;
};
export const useUser = () => useContext(UserContext);
