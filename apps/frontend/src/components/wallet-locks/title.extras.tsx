'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  findAction,
  useWalletFormat,
  useWalletPrices,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { tPaidHint } from '@gitroom/frontend/components/wallet/wallet.text';
import {
  TONE_TEXT,
  toneFor,
  useWalletAccess,
} from '@gitroom/frontend/components/wallet-locks/wallet.access';
import {
  CoinsIcon,
  InfoIcon,
} from '@gitroom/frontend/components/wallet-locks/wallet.icons';

// Which price a page's coins hint explains. UI wiring only: the words and
// numbers come from the price row.
const PAGE_ACTION: Record<string, string> = {
  '/media': 'storage.gb',
  '/brief': 'brief.onboarding',
};

export const hasTitleExtras = (path: string) => !!PAGE_ACTION[path];

const TOOLTIP_CLASS =
  '!max-w-[320px] !whitespace-normal !leading-[1.5] !text-[13px] !font-[400]';

// How the page's paid action is charged, in one generated sentence, in the
// warm accent every paid signal uses.
const PageCoins: FC<{ actionKey: string }> = ({ actionKey }) => {
  const t = useT();
  const f = useWalletFormat();
  const { data } = useWalletPrices();
  const action = findAction(data, actionKey);
  if (!action || action.billing === 'UNLOCK') {
    return null;
  }
  const hint = tPaidHint(t, f, action);
  const tone = toneFor(action.billing);
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={hint}
      data-tooltip-id="tooltip"
      data-tooltip-content={hint}
      data-tooltip-class-name={TOOLTIP_CLASS}
      className={clsx('cursor-help', TONE_TEXT[tone])}
    >
      <CoinsIcon size={16} />
    </span>
  );
};

// The (i) and the coins hint beside a page title. Paid plans never see a
// price; the brief keeps today's look on paid plans, so its (i) shows on the
// wallet tiers only; a locked page explains itself, so no (i) on free.
export const TitleExtras: FC<{ path: string; info?: string }> = ({
  path,
  info,
}) => {
  const access = useWalletAccess();
  if (!access) {
    return null;
  }
  const showInfo =
    !!info && access !== 'free' && !(access === 'plan' && path === '/brief');
  const actionKey = access !== 'plan' ? PAGE_ACTION[path] : undefined;
  return (
    <>
      {showInfo && (
        <span
          tabIndex={0}
          role="img"
          aria-label={info}
          data-tooltip-id="tooltip"
          data-tooltip-content={info}
          data-tooltip-class-name={TOOLTIP_CLASS}
          className="text-textItemBlur hover:text-newTextColor cursor-help"
        >
          <InfoIcon />
        </span>
      )}
      {!!actionKey && <PageCoins actionKey={actionKey} />}
    </>
  );
};
