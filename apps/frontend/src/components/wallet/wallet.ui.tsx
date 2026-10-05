'use client';

import React, { FC, ReactNode } from 'react';
import clsx from 'clsx';
import { tooltipHtml } from '@gitroom/frontend/components/wallet/wallet.text';

// Class strings shared by the wallet surfaces. Every colour is a --new-*
// token (colors.scss), so dark and light follow the theme.
export const BTN_PRIMARY =
  'text-white bg-btnPrimary hover:brightness-110 h-[44px] px-[20px] rounded-[8px] text-[15px] font-[600] flex items-center justify-center gap-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100';
export const BTN_SIMPLE =
  'text-btnText bg-btnSimple hover:brightness-125 h-[44px] px-[20px] rounded-[8px] text-[15px] font-[600] flex items-center justify-center gap-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed';
export const CARD = 'rounded-[12px] border border-newTableBorder';
export const POS_TEXT = 'text-pos';
export const POS_BG = 'bg-pos';
export const POS_SOFT = 'bg-posSoft';
export const TEAL_TEXT = 'text-tealText';
export const TEAL_SOFT = 'bg-tealSoft';
export const DANGER_TEXT = 'text-danger';
export const DANGER_SOFT = 'bg-dangerSoft';
export const PILL =
  'inline-flex items-center h-[22px] px-[8px] rounded-full text-[11px] font-[600] whitespace-nowrap';
export const PILL_TEAL = clsx(PILL, TEAL_SOFT, TEAL_TEXT);
export const PILL_MUTED = clsx(PILL, 'bg-newBgLineColor text-textItemBlur');
export const SCROLL =
  'scrollbar scrollbar-thumb-newColColor scrollbar-track-transparent';

// Keeps signed amounts like "+1,000.00" / "−24.00" intact in right-to-left text.
export const Num: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span dir="ltr" className={clsx('inline-block tabular-nums', className)}>
    {children}
  </span>
);

export const WalletIcon: FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M16.5 14H16.51M3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9C21 7.89543 20.1046 7 19 7L5 7C3.89543 7 3 6.10457 3 5ZM3 5C3 3.89543 3.89543 3 5 3H17M17 14C17 14.2761 16.7761 14.5 16.5 14.5C16.2239 14.5 16 14.2761 16 14C16 13.7239 16.2239 13.5 16.5 13.5C16.7761 13.5 17 13.7239 17 14Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CoinsIcon: FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <ellipse
      cx="9"
      cy="6.5"
      rx="6"
      ry="2.75"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M3 6.5v5c0 1.52 2.69 2.75 6 2.75M3 11.5v5c0 1.52 2.69 2.75 6 2.75M15 6.5v2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <ellipse
      cx="15"
      cy="13"
      rx="6"
      ry="2.75"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M9 13v5c0 1.52 2.69 2.75 6 2.75s6-1.23 6-2.75v-5"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

export const CheckIcon: FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M20 6L9 17L4 12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ArrowIcon: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="rtl:rotate-180 shrink-0"
  >
    <path
      d="M5 12h14M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChevronIcon: FC = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 9l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const InfoIcon: FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M12 16.5V11M12 7.6v-.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const PlusIcon: FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const CardIcon: FC = () => (
  <svg
    width="34"
    height="22"
    viewBox="0 0 34 22"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect
      x="0.75"
      y="0.75"
      width="32.5"
      height="20.5"
      rx="3.5"
      fill="var(--new-bgColorInner)"
      stroke="var(--new-sep)"
      strokeWidth="1.5"
    />
    <rect x="5" y="6" width="7" height="5" rx="1" fill="var(--new-warm)" />
    <path
      d="M5 15.5h10M18 15.5h5"
      stroke="var(--new-textItemBlur)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// An (i) with a longer explanation in the app tooltip. Line breaks are kept.
export const InfoTip: FC<{
  text: string;
  className?: string;
  size?: number;
}> = ({ text, className, size = 16 }) => (
  <span
    tabIndex={0}
    role="img"
    aria-label={text}
    data-tooltip-id="tooltip"
    data-tooltip-html={tooltipHtml(text)}
    className={clsx(
      'shrink-0 cursor-help text-textItemBlur hover:text-newTextColor inline-flex',
      className
    )}
  >
    <InfoIcon size={size} />
  </span>
);

export const Spinner: FC<{ size?: number }> = ({ size = 28 }) => (
  <div
    className="animate-spin border-4 border-newTextColor border-t-transparent rounded-full"
    style={{ width: size, height: size }}
  />
);

export const EmptyState: FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div
    className={clsx(
      CARD,
      'py-[56px] px-[16px] flex flex-col items-center gap-[8px] text-center'
    )}
  >
    <div className="w-[44px] h-[44px] rounded-full bg-newBgLineColor text-textItemBlur flex items-center justify-center mb-[6px]">
      <WalletIcon size={20} />
    </div>
    <div className="text-[15px] font-[600]">{title}</div>
    <div className="text-[13px] text-textItemBlur max-w-[360px]">{body}</div>
  </div>
);

// Section icons for the price list. Unknown sections get a generic grid.
const STORAGE_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <ellipse
      cx="12"
      cy="5.5"
      rx="8"
      ry="3"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);
const CHANNEL_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M1.66675 10.0417C3.35907 10.2299 4.93698 10.9884 6.14101 12.1924C7.34504 13.3964 8.10353 14.9743 8.29175 16.6667M1.66675 13.4167C2.46749 13.58 3.20253 13.9751 3.7804 14.553C4.35827 15.1309 4.75344 15.8659 4.91675 16.6667M1.66675 16.6667H1.67508M11.6667 17.5H14.3334C15.7335 17.5 16.4336 17.5 16.9684 17.2275C17.4388 16.9878 17.8212 16.6054 18.0609 16.135C18.3334 15.6002 18.3334 14.9001 18.3334 13.5V6.5C18.3334 5.09987 18.3334 4.3998 18.0609 3.86502C17.8212 3.39462 17.4388 3.01217 16.9684 2.77248C16.4336 2.5 15.7335 2.5 14.3334 2.5H5.66675C4.26662 2.5 3.56655 2.5 3.03177 2.77248C2.56137 3.01217 2.17892 3.39462 1.93923 3.86502C1.66675 4.3998 1.66675 5.09987 1.66675 6.5V6.66667"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const BRIEF_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="12.2" y="2.6" width="9.4" height="7.6" rx="1.8" />
    <path d="M15 10.2 13.8 13 17.4 10.2" />
    <path d="M14.6 5.3h4.8M14.6 7.6h2.8" />
    <circle cx="6.5" cy="12.8" r="2.9" />
    <path d="M1.5 21.3c0-3 2.2-5.3 5-5.3s5 2.3 5 5.3" />
  </svg>
);
const SKILLS_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M13.2 2.5 5 13.1c-.36.47-.03 1.15.56 1.15H11.5l-1 7.25 8.2-10.6c.36-.47.03-1.15-.56-1.15H12.2l1-7.25Z" />
  </svg>
);
const GENERIC_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="3.5"
      y="3.5"
      width="7"
      height="7"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <rect
      x="13.5"
      y="3.5"
      width="7"
      height="7"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <rect
      x="3.5"
      y="13.5"
      width="7"
      height="7"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <rect
      x="13.5"
      y="13.5"
      width="7"
      height="7"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);
const SECTION_ICONS: Record<string, ReactNode> = {
  channels: CHANNEL_ICON,
  storage: STORAGE_ICON,
  brief: BRIEF_ICON,
  skills: SKILLS_ICON,
};
export const sectionIcon = (key: string | null | undefined) =>
  (key && SECTION_ICONS[key]) || GENERIC_ICON;

// A provider's logo (the same files the Add Channel dialog uses). Hidden when
// there is no logo for it.
export const ProviderLogo: FC<{ provider: string; size?: number }> = ({
  provider,
  size = 20,
}) => (
  <img
    src={
      provider === 'youtube'
        ? '/icons/platforms/youtube.svg'
        : `/icons/platforms/${provider}.png`
    }
    alt=""
    width={size}
    height={size}
    className="rounded-full shrink-0 object-cover"
    style={{ width: size, height: size }}
    onError={(e) => {
      (e.currentTarget as HTMLImageElement).style.display = 'none';
    }}
  />
);
