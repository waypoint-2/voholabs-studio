import dayjs from 'dayjs';

/**
 * Access / free trial.
 *
 * Everything runs on the existing Subscription row - a trial is simply a
 * whitelist entry that expires:
 *
 * - `cancelAt = null`        -> whitelisted forever (manual whitelist, and the
 *                               one-off backfill of the organizations that
 *                               existed before the trial shipped)
 * - `cancelAt` in the future -> free trial (or a time limited whitelist)
 * - `cancelAt` in the past   -> expired, the organization drops to the free
 *                               plan: scheduling stays, everything that costs
 *                               money to run (AI, the brief) is switched off
 *
 * Organizations without any row at all keep the previous behaviour: unlimited
 * when billing is not configured, blocked when it is. That keeps self hosted
 * installs working and makes a missed backfill fail open instead of locking
 * people out.
 */
// 0, the default, is no trial: a new organization starts on the free plan, and
// the row signup writes is already expired. Set it to give new organizations
// the paid features for a while first.
export const trialPeriodDays = () =>
  process.env.TRIAL_PERIOD_DAYS ? Number(process.env.TRIAL_PERIOD_DAYS) : 0;

export const paywallUrl = () =>
  process.env.PAYWALL_URL || 'https://voholabs.com';

export const billingEnabled = () =>
  !!process.env.STRIPE_PUBLISHABLE_KEY || !!process.env.STRIPE_SECRET_KEY;

export interface AccessSubscription {
  deletedAt?: Date | string | null;
  cancelAt?: Date | string | null;
  subscriptionTier?: string;
  identifier?: string | null;
}

/**
 * A paying customer, as opposed to someone on the free trial.
 *
 * Both are stored the same way, as a whitelist with an expiry, because access
 * should stop either way once the date passes. The difference is what the date
 * means: a trial is counting down to a decision, whereas a paid window is just
 * how far ahead the last payment covers and moves forward every renewal.
 *
 * Only the countdown cares. `hasAccess` deliberately does not: a paid window
 * that has run out still has to hit the paywall, or a cancelled customer would
 * keep the product.
 */
export const PAID_IDENTIFIERS = ['apex-stripe'];

export const isPaidSubscription = (subscription?: AccessSubscription | null) =>
  !!subscription?.identifier &&
  PAID_IDENTIFIERS.includes(subscription.identifier);

export interface AccessOrganization {
  subscription?: AccessSubscription | null;
}

export const isActiveSubscription = (
  subscription?: AccessSubscription | null
) =>
  !!subscription &&
  !subscription.deletedAt &&
  (!subscription.cancelAt || dayjs(subscription.cancelAt).isAfter(dayjs()));

// Paid features (AI, the brief), not the product itself: an organization
// without access is on the free plan and keeps scheduling. Nothing may use this
// to lock somebody out of the app, the public API, the MCP or publishing.
export const hasAccess = (org?: AccessOrganization | null) =>
  org?.subscription ? isActiveSubscription(org.subscription) : !billingEnabled();

// The plan whose limits apply. An active row names its own tier; without one
// it is the free plan, or everything on an install with no billing and no row.
export const planOf = (subscription?: AccessSubscription | null) =>
  (isActiveSubscription(subscription) && subscription?.subscriptionTier) ||
  (hasAccess({ subscription }) ? 'ULTIMATE' : 'FREE');

// Channels temporarily unavailable on the free plan: they can't be connected
// or posted to without a paid plan (or, where the wallet charges for them, a
// top-up). X charges per post.
export const paidOnlyProviders = ['x'];

export const providerNeedsPaidPlan = (identifier?: string | null) =>
  paidOnlyProviders.includes(
    (identifier || '').toLowerCase().split('-')[0]
  );

export const paidOnlyChannelMessage = () =>
  'X is temporarily unavailable on the free plan.';

export const paidFeatureMessage = (feature: string) =>
  `${feature} is not part of the free plan. Upgrade at ${paywallUrl()} to use it.`;

// When the free trial runs out. `null` means there is nothing to count down:
// either the organization is whitelisted forever, or it is a paying customer,
// whose expiry is just the end of the period they have paid for and moves
// forward on every renewal. Counting that down reads as "your access is about
// to end" to someone who is not going anywhere.
// The same goes for a trial that is over: that is the free plan, which does not
// end, and nobody on it is told about a trial they are not in.
export const trialEndsAt = (org?: AccessOrganization | null) =>
  org?.subscription &&
  isActiveSubscription(org.subscription) &&
  !isPaidSubscription(org.subscription)
    ? org.subscription.cancelAt || null
    : null;

// Rounded up, so a fresh 7 day trial reads "7 days left" and not "6".
export const trialDaysLeft = (org?: AccessOrganization | null) => {
  const endsAt = trialEndsAt(org);
  return endsAt
    ? Math.max(0, Math.ceil(dayjs(endsAt).diff(dayjs(), 'hour') / 24))
    : null;
};

export const newTrialCancelAt = () =>
  dayjs().add(trialPeriodDays(), 'day').toDate();

export const trialExpiredMessage = () =>
  `Your ${trialPeriodDays()}-day free trial has ended. Please contact sales to continue using the platform.`;
