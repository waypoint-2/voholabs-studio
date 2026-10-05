'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ReviewedCheckIcon: FC<{ size?: number; className?: string }> = ({
  size = 12,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M10 3.5L4.75 9L2 6.13636"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A note to self that a post has been eyeballed. It carries no meaning to the
 * publishing pipeline — see `Post.reviewed` in the schema.
 */
export const ReviewedCheckbox: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  // Height override, e.g. to match the 44px buttons beside it.
  className?: string;
}> = ({ checked, onChange, disabled, className }) => {
  const t = useT();

  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      data-tooltip-id="tooltip"
      data-tooltip-content={t(
        'reviewed_hint',
        'Just a note to yourself — it does not change when or how the post goes out'
      )}
      className={clsx(
        `flex items-center gap-[8px] ${
          className || 'h-[36px]'
        } px-[12px] rounded-[8px] border select-none transition-all`,
        disabled
          ? 'opacity-50 cursor-not-allowed border-newTableBorder'
          : 'cursor-pointer',
        !disabled && checked
          ? 'border-forth text-forth'
          : !disabled
          ? 'border-newTableBorder hover:border-forth/50'
          : ''
      )}
    >
      <div
        className={clsx(
          'w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center transition-all',
          checked
            ? 'bg-forth border-forth text-white'
            : 'border-newTableBorder'
        )}
      >
        {checked && <ReviewedCheckIcon />}
      </div>
      <div className="text-[13px] font-[500] whitespace-nowrap">
        {t('reviewed', 'Reviewed')}
      </div>
    </div>
  );
};
