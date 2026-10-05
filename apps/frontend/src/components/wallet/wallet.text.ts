// Wallet copy generated from data fields, so a new priced action needs no new
// UI text. Each template goes through t() with an English default; database
// text (name, description) is only a fallback, translated by key when a
// translation exists.
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  WalletPricedAction,
  WalletTransaction,
} from '@gitroom/frontend/components/wallet/wallet.types';
import { WalletFormat } from '@gitroom/frontend/components/wallet/wallet.hooks';

export type T = ReturnType<typeof useT>;

const raw = { interpolation: { escapeValue: false } };

// English defaults for known units; unknown units fall back to the raw value.
const UNIT_DEFAULTS: Record<string, [string, string]> = {
  post: ['post', 'posts'],
  gb: ['GB', 'GB'],
  onboarding: ['onboarding', 'onboardings'],
  skill: ['skill', 'skills'],
  '1k_tokens': ['1K tokens', '1K tokens'],
  minute: ['minute', 'minutes'],
  read: ['read', 'reads'],
  lookup: ['lookup', 'lookups'],
};

export const titleCase = (k: string) =>
  k.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const sectionLabel = (t: T, key: string) =>
  t(`wallet_section_${key}`, titleCase(key));

export const unitLabel = (t: T, unit: string, n = 1) => {
  const known = UNIT_DEFAULTS[unit];
  const one = known ? known[0] : unit.replace(/_/g, ' ');
  const many = known ? known[1] : `${one}s`;
  return n === 1
    ? t(`wallet_unit_${unit}_one`, one)
    : t(`wallet_unit_${unit}_other`, many);
};

export const actionName = (t: T, a: { key: string; name: string }) =>
  t(`wallet_action_${a.key.replace(/\./g, '_')}`, a.name, raw);

export const actionDescription = (
  t: T,
  a: { key: string; description: string | null }
) =>
  a.description
    ? t(
        `wallet_action_${a.key.replace(/\./g, '_')}_description`,
        a.description,
        raw
      )
    : '';

// "per post", "per GB / month", "Free"
export const tModel = (t: T, a: WalletPricedAction) => {
  const unit = unitLabel(t, a.unit);
  if (a.billing === 'UNLOCK') return t('wallet_model_free', 'Free');
  if (a.billing === 'MONTHLY')
    return t('wallet_model_monthly', 'per {{unit}} / month', { unit, ...raw });
  return t('wallet_model_per_use', 'per {{unit}}', { unit, ...raw });
};

const unlocksSuffix = (t: T, a: WalletPricedAction) =>
  a.requiresTopUp
    ? t('wallet_allowance_unlocks_suffix', ', unlocks after first top up')
    : '';

const firstFree = (t: T, n: number) =>
  n === 1
    ? t('wallet_allowance_first_free', 'First time free')
    : t('wallet_allowance_first_n_free', 'First {{n}} times free', { n });

// The "Included free" column.
export const tAllowance = (t: T, a: WalletPricedAction) => {
  if (a.billing === 'UNLOCK')
    return (
      t('wallet_allowance_unlimited', 'Unlimited use') + unlocksSuffix(t, a)
    );
  const n = a.freeUnits || 0;
  if (!n) return '';
  if (a.freePeriod === 'ONCE') return firstFree(t, n) + unlocksSuffix(t, a);
  const units = unitLabel(t, a.unit, n);
  if (a.freePeriod === 'MONTH')
    return t('wallet_allowance_monthly', '{{n}} {{units}} free each month', {
      n,
      units,
      ...raw,
    });
  return t('wallet_allowance_included', '{{n}} {{units}} included free', {
    n,
    units,
    ...raw,
  });
};

export const tPrice = (t: T, f: WalletFormat, a: WalletPricedAction) =>
  a.billing === 'UNLOCK'
    ? t('wallet_price_free', 'Free')
    : t('wallet_price_credits', '{{credits}} credits', {
        credits: f.credits(a.price),
        ...raw,
      });

// What using a feature costs once it is open, from its price row: "Free,
// unlimited use." for an unlock, the free units for a priced action, or ''
// when nothing is free.
export const tFreeUse = (t: T, a: WalletPricedAction) => {
  if (a.billing === 'UNLOCK')
    return t('wallet_free_unlimited', 'Free, unlimited use.');
  const n = a.freeUnits || 0;
  if (!n) return '';
  const units = unitLabel(t, a.unit, n);
  if (a.freePeriod === 'ONCE')
    return n === 1
      ? t('wallet_free_first_one', 'Your first {{unit}} is free.', {
          unit: units,
          ...raw,
        })
      : t('wallet_free_first_n', 'Your first {{n}} {{units}} are free.', {
          n,
          units,
          ...raw,
        });
  if (a.freePeriod === 'MONTH')
    return t('wallet_free_monthly', '{{n}} {{units}} free each month.', {
      n,
      units,
      ...raw,
    });
  return t('wallet_free_included', '{{n}} {{units}} included free.', {
    n,
    units,
    ...raw,
  });
};

// The line a locked feature shows on what a top-up gives, e.g. "Any top-up
// opens it. Your first onboarding is free."
export const tTopUpGift = (t: T, a?: WalletPricedAction) => {
  const opens = t('wallet_gift_opens', 'Any top-up opens it.');
  const free = a ? tFreeUse(t, a) : '';
  return free ? `${opens} ${free}` : opens;
};

// One sentence on how something is paid, e.g. for a page's coins hint.
export const tPaidHint = (t: T, f: WalletFormat, a: WalletPricedAction) => {
  const n = a.freeUnits || 0;
  const paid = t('wallet_hint_paid', '{{credits}} credits {{model}}', {
    credits: f.credits(a.price),
    model: tModel(t, a),
    ...raw,
  });
  if (!n) return `${paid.charAt(0).toUpperCase()}${paid.slice(1)}.`;
  const units = unitLabel(t, a.unit, n);
  const free =
    a.freePeriod === 'ONCE'
      ? firstFree(t, n)
      : a.freePeriod === 'MONTH'
      ? t('wallet_hint_free_monthly', '{{n}} {{units}} free each month', {
          n,
          units,
          ...raw,
        })
      : t('wallet_hint_free_included', '{{n}} {{units}} included free', {
          n,
          units,
          ...raw,
        });
  return t('wallet_hint_free_then', '{{free}}, then {{paid}}.', {
    free,
    paid,
    ...raw,
  });
};

// The (i) text for a MONTHLY action: one template filled from its fields.
export const tMonthly = (
  t: T,
  f: WalletFormat,
  a: WalletPricedAction,
  today = new Date()
) => {
  const n = a.freeUnits || 0;
  const one = unitLabel(t, a.unit);
  const many = unitLabel(t, a.unit, 2);
  const nUnits = unitLabel(t, a.unit, n);
  const p = f.credits(a.price);
  const p2 = f.credits(a.price * 2);
  const month = f.monthName(today);
  const next = f.monthName(
    new Date(today.getFullYear(), today.getMonth() + 1, 1)
  );
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const line = n
    ? t(
        'wallet_monthly_line_free',
        "Charged per {{one}} above {{n}} {{nUnits}} free, each month you're above it.",
        { one, n, nUnits, ...raw }
      )
    : t('wallet_monthly_line', 'Charged per {{one}}, each month you use it.', {
        one,
        ...raw,
      });
  const rules = [
    n
      ? t(
          'wallet_monthly_rule_charge_free',
          'Charged the moment usage goes above the {{n}} {{nUnits}} included free, for that {{one}} until the end of the month.',
          { n, nUnits, one, ...raw }
        )
      : t(
          'wallet_monthly_rule_charge',
          'Charged the moment usage goes above zero, for that {{one}} until the end of the month.',
          { one, ...raw }
        ),
    t(
      'wallet_monthly_rule_again',
      'Charged again at the start of each month while usage is still above it.'
    ),
    t('wallet_monthly_rule_round', 'Usage is rounded up to whole {{many}}.', {
      many,
      ...raw,
    }),
    t(
      'wallet_monthly_rule_negative',
      'If your wallet has no credit, the balance can go negative.'
    ),
  ];
  const example = [
    t(
      'wallet_monthly_example_1',
      'Example: usage goes from {{from}} to {{to}} {{many}} on 10 {{month}}. That is 1 {{one}} over, so {{p}} credits are charged then, covering you to {{last}} {{month}}. Still above on 1 {{next}}: {{p}} again.',
      {
        from: f.oneDecimal(n),
        to: f.oneDecimal(n + 0.1),
        many,
        month,
        one,
        p,
        last,
        next,
        ...raw,
      }
    ),
    t(
      'wallet_monthly_example_2',
      'Going to {{to}} {{many}} means 2 {{many}} over, so {{p2}} credits a month. If that happens mid-month, only the extra {{one}} is charged then ({{p}}), and the next month charges both ({{p2}}).',
      { to: f.oneDecimal(n + 1.1), many, p2, one, p, ...raw }
    ),
  ];
  return [line, '', ...rules.map((r) => `• ${r}`), '', ...example].join('\n');
};

const TX_TYPES: Record<string, string> = {
  TOPUP: 'Top-up',
  AUTO_TOPUP: 'Auto top-up',
  SPEND: 'Spend',
  REFUND: 'Refund',
  GRANT: 'Grant',
  ADJUST: 'Adjustment',
};

export const txTypeLabel = (t: T, type: string) =>
  t(`wallet_tx_type_${type.toLowerCase()}`, TX_TYPES[type] || titleCase(type));

// A ledger line's display name, generated from its type and action.
export const txName = (
  t: T,
  tx: WalletTransaction,
  findAction: (key: string) => WalletPricedAction | undefined
) => {
  if ((tx.type === 'SPEND' || tx.type === 'REFUND') && tx.actionKey) {
    const a = findAction(tx.actionKey);
    const name = a ? actionName(t, a) : tx.actionKey;
    const qty = tx.quantity && tx.quantity > 1 ? ` × ${tx.quantity}` : '';
    return tx.type === 'REFUND'
      ? t('wallet_tx_refund_of', 'Refund: {{name}}', { name, ...raw }) + qty
      : name + qty;
  }
  return txTypeLabel(t, tx.type);
};

// Escapes text for a react-tooltip HTML tooltip and keeps its line breaks.
export const tooltipHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
