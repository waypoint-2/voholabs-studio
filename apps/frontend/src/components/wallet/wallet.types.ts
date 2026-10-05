// Shapes returned by the wallet API. Credits are integers in hundredths
// (225 = 2.25 credits); money is in the smallest unit of the wallet currency.

type WalletBilling = 'PER_USE' | 'MONTHLY' | 'UNLOCK';
type WalletFreePeriod = 'ONCE' | 'MONTH';
export type WalletEntryType =
  | 'TOPUP'
  | 'AUTO_TOPUP'
  | 'SPEND'
  | 'REFUND'
  | 'GRANT'
  | 'ADJUST';

interface WalletForecastItem {
  actionKey: string;
  quantity: number;
  at: string;
  postId?: string;
}

export interface WalletSummary {
  balance: number;
  payAsYouGo: boolean;
  frozen?: boolean;
  currency: string;
  paymentsEnabled: boolean;
  topUp: {
    minAmount: number;
    options: number[];
    creditsPerUnit: number;
    // Auto top-up choices (smallest currency unit) and the default threshold
    // (hundredths of a credit), from the billing settings.
    autoOptions?: number[];
    capOptions?: number[];
    defaultThreshold?: number;
  } | null;
  // exp is "MM/YY".
  card: { brand: string | null; last4: string; exp?: string | null } | null;
  autoTopUp: {
    enabled: boolean;
    threshold: number | null;
    amount: number | null;
    monthlyCap: number | null;
    usedThisMonth: number;
  };
  forecast?: {
    windowHours: number;
    needed: number;
    short: boolean;
    items: WalletForecastItem[];
  };
}

export interface WalletTransaction {
  id: string;
  type: WalletEntryType | string;
  description: string | null;
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
  actionKey: string | null;
  reference: string | null;
  receiptUrl?: string | null;
  createdAt: string;
}

export interface WalletTransactions {
  total: number;
  items: WalletTransaction[];
}

export interface WalletUsage {
  byAction: {
    key: string | null;
    name: string | null;
    quantity: number;
    total: number;
  }[];
  byDay: { day: string; total: number }[];
}

export interface WalletPricedAction {
  key: string;
  provider: string | null;
  category: string | null;
  name: string;
  description: string | null;
  unit: string;
  freeUnits: number;
  freePeriod: WalletFreePeriod | null;
  billing: WalletBilling | string;
  requiresTopUp: boolean;
  price: number;
}

export interface WalletPriceSection {
  key: string;
  actions: WalletPricedAction[];
}

export interface SupportedChannel {
  identifier: string;
  name: string;
}

// POST /wallet/estimate: what publishing these contents to a provider costs.
export interface WalletEstimate {
  items: { actionKey: string; price: number }[];
  // Per occurrence when the post repeats.
  price: number;
  // What the edited post group already paid (0 for a new post).
  alreadyPaid: number;
  // What saving charges now: price - alreadyPaid (negative gives back).
  due: number;
  // balance - due
  balanceAfter: number;
  // `due` is not covered, even with auto top-up.
  short: boolean;
  autoCovers: boolean;
  // Smallest currency unit auto top-up would add first, when it covers.
  autoAmount: number | null;
  // "Repeat post every n days": each occurrence is charged on its own.
  perOccurrence: boolean;
  repeatEveryDays: number | null;
}
