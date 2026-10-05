import {
  notEnoughCreditsMessage,
  PricedAction,
  walletFrozenMessage,
  WalletService,
} from '@gitroom/nestjs-libraries/database/prisma/wallet/wallet.service';
import { hasAccess } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/trial';

// Shared by the wallet tools and the schedule tool's cost line. Every number
// comes from the database; every sentence is generated from a row's fields,
// so a new price row needs no new copy here.

export const notOnWalletMessage = 'Your plan does not use wallet credits.';

export const topUpUrl = () => `${process.env.FRONTEND_URL}/wallet`;

export const shortWarning = () =>
  `Not enough credits yet. If you don't top up before it's due, this post won't go out. Top up: ${topUpUrl()}`;

// Hundredths of a credit -> credits, 2 decimals.
export const toCredits = (units: number) => Math.round(units) / 100;

export const creditsText = (units: number) =>
  `${(units / 100).toFixed(2)} credits`;

export const orgFromContext = (context: any) => {
  try {
    return JSON.parse(
      (context?.requestContext as any)?.get('organization') as string
    );
  } catch (err) {
    return undefined;
  }
};

// Paid plans never touch the wallet.
export const onPaidPlan = (org: any) => hasAccess(org);

export interface WalletForecast {
  windowHours: number;
  needed: number;
  short: boolean;
}

// The scheduled paid usage due soon (WalletService.forecast). Failing, it is
// simply left out: the forecast only ever adds a warning.
export const walletForecast = async (
  wallet: WalletService,
  organizationId: string
): Promise<WalletForecast | undefined> => {
  try {
    const result = await wallet.forecast(organizationId);
    return {
      windowHours: result.windowHours,
      needed: result.needed,
      short: result.short,
    };
  } catch (err) {
    return undefined;
  }
};

const providerOf = (identifier: string) =>
  (identifier || '').toLowerCase().split('-')[0];

// The action one post (or reply) is charged as. The link rule lives only in
// WalletService.postActionKey; sent: false reads the text as it is saved,
// before any link stripping at publish.
export const postActionKey = (
  wallet: WalletService,
  identifier: string,
  content: string
) => wallet.postActionKey(identifier, content || '', { sent: false });

// Units of credit for one post and its replies on a channel the wallet
// charges per post. undefined when a row is missing (nothing is guessed).
export const postCost = async (
  wallet: WalletService,
  identifier: string,
  contents: string[]
) => {
  let total = 0;
  for (const content of contents) {
    const priced = await wallet.price(
      await postActionKey(wallet, identifier, content)
    );
    if (!priced) {
      return undefined;
    }
    total += priced.price;
  }
  return total;
};

// Units of credit a post and its replies take from this workspace's wallet,
// or undefined when it does not pay for this channel from the wallet. Never
// throws: the cost only ever adds information.
export const walletPostCost = async (
  wallet: WalletService,
  organization: any,
  identifier: string,
  contents: string[]
) => {
  try {
    if (
      !organization?.id ||
      onPaidPlan(organization) ||
      !(await wallet.billsProvider(identifier))
    ) {
      return undefined;
    }
    return await postCost(wallet, identifier, contents);
  } catch (err) {
    return undefined;
  }
};

// Posts not yet on the schedule, grouped by channel: provider -> the texts of
// every post and reply, and the units they cost.
export type PendingWalletPosts = Map<
  string,
  { contents: string[]; units: number }
>;

export const addPendingWalletPost = (
  pending: PendingWalletPosts,
  identifier: string,
  contents: string[],
  units: number
) => {
  const provider = providerOf(identifier);
  const entry = pending.get(provider) || { contents: [], units: 0 };
  entry.contents.push(...contents);
  entry.units += units;
  pending.set(provider, entry);
};

// The warning for posts about to be scheduled, or undefined when the credits
// cover them. Call it BEFORE the posts are queued: the forecast counts what
// is already queued, so a post counted there and here would count twice.
// Same rule as the composer: the balance plus what auto top-up can still add
// must cover these posts on top of the usage already scheduled.
export const walletWarning = async (
  wallet: WalletService,
  organizationId: string,
  pending: PendingWalletPosts
) => {
  if (!pending.size) {
    return undefined;
  }
  try {
    const estimates = await Promise.all(
      [...pending.entries()].map(([provider, { contents }]) =>
        wallet.estimateContents(organizationId, provider, contents)
      )
    );
    return estimates.some((e) => e.short) ? shortWarning() : undefined;
  } catch (err) {
    return undefined;
  }
};

// A publish error the wallet wrote: not enough credits when the post was due,
// or a wallet on hold. The server's errorKind (PostsService) decides whenever
// the post carries one; the error text is read only when it does not.
export const walletErrorKind = (
  error?: string | null,
  errorKind?: string | null
): 'wallet' | null => {
  if (errorKind === 'wallet') {
    return 'wallet';
  }
  if (errorKind === null) {
    return null;
  }
  if (!error) {
    return null;
  }
  return error.includes(notEnoughCreditsMessage()) ||
    error.includes(walletFrozenMessage()) ||
    /enough credits/i.test(error)
    ? 'wallet'
    : null;
};

// The reason to show for a post the wallet stopped: the wallet's own message
// instead of the serialized publish failure it is stored inside. Any other
// error is returned as stored.
export const walletErrorText = (
  error?: string | null,
  errorKind?: string | null
) => {
  if (!error || walletErrorKind(error, errorKind) !== 'wallet') {
    return error || null;
  }
  return (
    [notEnoughCreditsMessage(), walletFrozenMessage()].find(
      (message) =>
        error.includes(message) ||
        error.includes(JSON.stringify(message).slice(1, -1))
    ) || error
  );
};

// A request refused because it needs the wallet (HTTP 402 with
// { message, wallet: true, url }), as one line for the agent, or undefined
// for any other error.
export const walletRefusal = (err: any) => {
  const status =
    typeof err?.getStatus === 'function' ? err.getStatus() : err?.status;
  const body =
    typeof err?.getResponse === 'function' ? err.getResponse() : err?.response;
  if (status !== 402 || !body || typeof body !== 'object' || !body.wallet) {
    return undefined;
  }
  const url =
    typeof body.url === 'string' && body.url
      ? body.url.startsWith('/')
        ? `${process.env.FRONTEND_URL}${body.url}`
        : body.url
      : topUpUrl();
  return `${body.message || 'This needs wallet credits.'} Top up: ${url}`;
};

const UNIT_LABELS: Record<string, [string, string]> = {
  gb: ['GB', 'GB'],
  '1k_tokens': ['1K tokens', '1K tokens'],
};

const SECTION_LABELS: Record<string, string> = {
  channels: 'Channels',
  storage: 'Storage',
  brief: 'Brief',
  skills: 'Skills',
};

const titleCase = (key: string) =>
  key.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const sectionLabel = (key: string) =>
  SECTION_LABELS[key] || titleCase(key);

const unitLabel = (unit: string, n = 1) => {
  const known = UNIT_LABELS[unit];
  const one = known ? known[0] : unit.replace(/_/g, ' ');
  const many = known ? known[1] : `${one}s`;
  return n === 1 ? one : many;
};

export const pricingModel = (a: PricedAction) =>
  a.billing === 'UNLOCK'
    ? 'Free'
    : a.billing === 'MONTHLY'
    ? `per ${unitLabel(a.unit)} / month`
    : `per ${unitLabel(a.unit)}`;

export const freeAllowance = (a: PricedAction) => {
  const afterTopUp = a.requiresTopUp ? ', unlocks after first top up' : '';
  if (a.billing === 'UNLOCK') {
    return `Unlimited use${afterTopUp}`;
  }
  const n = a.freeUnits || 0;
  if (!n) {
    return 'None';
  }
  if (a.freePeriod === 'ONCE') {
    return `${n === 1 ? 'First time free' : `First ${n} times free`}${afterTopUp}`;
  }
  if (a.freePeriod === 'MONTH') {
    return `${n} ${unitLabel(a.unit, n)} free each month`;
  }
  return `${n} ${unitLabel(a.unit, n)} included free`;
};

export const priceText = (a: PricedAction) =>
  a.billing === 'UNLOCK' ? 'Free' : creditsText(a.price);

// How a MONTHLY row is charged, from one template.
export const monthlyRules = (a: PricedAction) => {
  const n = a.freeUnits || 0;
  const one = unitLabel(a.unit);
  const many = unitLabel(a.unit, 2);
  return [
    n
      ? `Charged per ${one} above ${n} ${unitLabel(a.unit, n)} free, each month you're above it.`
      : `Charged per ${one}, each month you use it.`,
    `Charged the moment usage goes above ${
      n ? `the ${n} ${unitLabel(a.unit, n)} included free` : 'zero'
    }, for that ${one} until the end of the month.`,
    'Charged again at the start of each month while usage is still above it.',
    `Usage is rounded up to whole ${many}.`,
    'If your wallet has no credit, the balance can go negative.',
  ].join(' ');
};
