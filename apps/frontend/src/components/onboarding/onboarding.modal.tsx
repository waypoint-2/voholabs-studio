'use client';

import { useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { orderBy } from 'lodash';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { AddProviderComponent } from '@gitroom/frontend/components/launches/add.provider.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ConnectAgentPanel } from '@gitroom/frontend/components/public-api/public.component';
import clsx from 'clsx';
import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';

interface OnboardingModalProps {
  onClose: () => void;
}

export const OnboardingModal: FC<OnboardingModalProps> = ({ onClose }) => {
  const modals = useModals();
  const t = useT();
  const user = useUser();
  // A paid plan keeps the onboarding it always had: channels only.
  const paidPlan = useWalletAccess() === 'plan';
  // After the channels: connect an agent over MCP. It needs the workspace's
  // API key, so without one onboarding ends after the channels as before.
  const hasAgentStep = !paidPlan && !!user?.publicApi;
  const [step, setStep] = useState<'channels' | 'agent'>('channels');

  return (
    <div
      className={clsx(
        'w-full min-h-full flex-1 flex relative',
        paidPlan ? 'p-[40px]' : 'p-[8px] sm:p-[40px]'
      )}
    >
      <style>
        {`#support-discord {display: none}`}
      </style>
      <div className="flex flex-1 bg-newBgColorInner rounded-[20px] flex-col relative">
        <button
          className="outline-none absolute end-[20px] top-[20px] mantine-UnstyledButton-root mantine-ActionIcon-root hover:bg-tableBorder cursor-pointer mantine-Modal-close mantine-1dcetaa"
          type="button"
          onClick={modals.closeAll}
        >
          <svg
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
          >
            <path
              d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </button>
        <div
          className={clsx(
            'flex-1 flex',
            paidPlan ? 'p-[40px]' : 'p-[16px] pt-[56px] sm:p-[40px]'
          )}
        >
          <div
            className={clsx(
              'flex flex-col gap-[24px] flex-1',
              !paidPlan && 'min-w-0'
            )}
          >
            {hasAgentStep && (
              <OnboardingStepper
                step={step}
                onGoToChannels={() => setStep('channels')}
              />
            )}
            {step === 'channels' ? (
              <OnboardingStep1
                onNext={hasAgentStep ? () => setStep('agent') : onClose}
                onSkip={onClose}
                hasNext={hasAgentStep}
                paidPlan={paidPlan}
              />
            ) : (
              <OnboardingAgentStep
                onBack={() => setStep('channels')}
                onDone={onClose}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StepCheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// "1 Connect channels" then "2 Connect your agent". The channels step is
// done once the user has moved past it, and stays clickable to go back.
const OnboardingStepper: FC<{
  step: 'channels' | 'agent';
  onGoToChannels: () => void;
}> = ({ step, onGoToChannels }) => {
  const t = useT();
  const onAgent = step === 'agent';

  const circle = (state: 'done' | 'current' | 'upcoming', index: number) => (
    <span
      className={clsx(
        'shrink-0 w-[28px] h-[28px] rounded-full flex items-center justify-center text-[13px] font-[700] transition-colors',
        state === 'upcoming'
          ? 'border border-newBorder text-textItemBlur'
          : 'bg-btnPrimary text-white',
        state === 'current' && 'ring-4 ring-tealSoft'
      )}
    >
      {state === 'done' ? <StepCheckIcon /> : index}
    </span>
  );

  const label = (text: string, active: boolean) => (
    <span
      className={clsx(
        'text-[13px] sm:text-[14px] font-[600] whitespace-nowrap',
        active ? 'text-newTextColor' : 'text-textItemBlur hidden sm:inline'
      )}
    >
      {text}
    </span>
  );

  return (
    <nav
      aria-label={t('onboarding_steps', 'Onboarding steps')}
      className="flex items-center justify-center gap-[10px] sm:gap-[14px]"
    >
      {onAgent ? (
        <button
          type="button"
          onClick={onGoToChannels}
          className="flex items-center gap-[8px] rounded-[8px] px-[4px] py-[2px] hover:opacity-80 transition-opacity"
        >
          {circle('done', 1)}
          {label(t('onboarding_step_channels', 'Connect channels'), false)}
        </button>
      ) : (
        <div
          aria-current="step"
          className="flex items-center gap-[8px] px-[4px] py-[2px]"
        >
          {circle('current', 1)}
          {label(t('onboarding_step_channels', 'Connect channels'), true)}
        </div>
      )}
      <span
        aria-hidden="true"
        className={clsx(
          'h-[2px] w-[24px] sm:w-[64px] rounded-full',
          onAgent ? 'bg-btnPrimary' : 'bg-newBorder'
        )}
      />
      <div
        aria-current={onAgent ? 'step' : undefined}
        className="flex items-center gap-[8px] px-[4px] py-[2px]"
      >
        {circle(onAgent ? 'current' : 'upcoming', 2)}
        {label(t('onboarding_step_agent', 'Connect your agent'), onAgent)}
      </div>
    </nav>
  );
};

const OnboardingStep1: FC<{
  onNext: () => void;
  onSkip: () => void;
  hasNext?: boolean;
  // The look a paid plan always had.
  paidPlan?: boolean;
}> = ({ onNext, onSkip, hasNext, paidPlan }) => {
  const fetch = useFetch();
  const t = useT();
  useTrackView('onboarding_step', { step: 'connect_channel' });

  const getIntegrations = useCallback(async () => {
    return (await fetch('/integrations')).json();
  }, []);

  const load = useCallback(async (path: string) => {
    const list = (await (await fetch(path)).json()).integrations;
    return list;
  }, []);

  const { data: integrations } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const sortedIntegrations = useMemo(() => {
    return orderBy(
      integrations,
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [integrations]);

  const { data } = useSWR('get-all-integrations-onboarding', getIntegrations);

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex gap-[4px] flex-col text-center">
        <div className="text-[24px] font-semibold">
          {t('connect_your_channels', 'Connect Your Channels')}
        </div>
        <div className="text-[14px] text-customColor18">
          {t(
            'connect_social_media_to_start',
            'Connect your social media accounts to start scheduling posts'
          )}
        </div>
      </div>

      {/* Connected channels */}
      {sortedIntegrations.length > 0 && (
        <div className="bg-newTableHeader rounded-[8px] p-[16px]">
          <div className="text-[14px] font-medium mb-[12px]">
            {t('connected_channels', 'Connected Channels')} (
            {sortedIntegrations.length})
          </div>
          <div className="flex flex-wrap gap-[12px]">
            {sortedIntegrations.map((integration: any) => (
              <div
                key={integration.id}
                className="flex items-center gap-[8px] bg-customColor47/30 rounded-[8px] px-[12px] py-[8px]"
              >
                <div className="relative w-[28px] h-[28px]">
                  <SafeImage
                    src={integration.picture}
                    className="rounded-full"
                    alt={integration.identifier}
                    width={28}
                    height={28}
                  />
                  <SafeImage
                    src={`/icons/platforms/${integration.identifier}.png`}
                    className="rounded-full absolute -bottom-[3px] -end-[3px] border border-fifth"
                    alt={integration.identifier}
                    width={14}
                    height={14}
                  />
                </div>
                <span className="text-[13px]">{integration.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available platforms - using AddProviderComponent */}
      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px] font-medium">
          {t('click_channel_to_add', 'Click a channel to add it')}
        </div>
        {data && (
          <AddProviderComponent
            invite={false}
            social={data.social || []}
            article={data.article || []}
            onboarding={true}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end pt-[24px] mt-[8px]">
        <button
          type="button"
          onClick={onNext}
          className={
            paidPlan
              ? 'group flex items-center gap-[12px] bg-gradient-to-r from-[#622aff] to-[#8b5cf6] hover:from-[#7c3aff] hover:to-[#9d6eff] text-white font-semibold px-[32px] py-[14px] rounded-[12px] text-[16px] transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
              : 'group flex items-center justify-center gap-[12px] w-full sm:w-auto bg-btnPrimary hover:brightness-110 text-white font-semibold px-[32px] py-[14px] rounded-[12px] text-[16px] transition-all'
          }
        >
          {hasNext
            ? t('onboarding_next_agent', 'Next: connect your agent')
            : sortedIntegrations.length > 0
            ? t('onboarding_start', 'Start')
            : t('onboarding_start_without_channels', 'Start without channels')}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              paidPlan
                ? 'group-hover:translate-x-1 transition-transform'
                : 'group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:-scale-x-100 transition-transform'
            }
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Second step: connect Claude, ChatGPT or a coding agent over MCP. The panel
// is the one in Settings, so both stay the same. Skippable.
const OnboardingAgentStep: FC<{ onBack: () => void; onDone: () => void }> = ({
  onBack,
  onDone,
}) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[24px] w-full max-w-[760px] mx-auto">
      <div className="flex gap-[4px] flex-col text-center">
        <div className="text-[24px] font-semibold">
          {t('onboarding_connect_agent', 'Connect your agent')}
        </div>
        <div className="text-[14px] text-textItemBlur">
          {t(
            'onboarding_connect_agent_sub_short',
            'Let Claude, ChatGPT or your coding agent write and schedule posts for you. You can also do this later in Settings.'
          )}
        </div>
      </div>
      <ConnectAgentPanel bare={true} />
      <div className="flex flex-wrap items-center justify-between gap-[12px] pt-[16px] border-t border-newBorder">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-[6px] text-[15px] font-[600] text-textItemBlur hover:text-newTextColor px-[8px] h-[44px]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="rtl:-scale-x-100"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          {t('onboarding_back', 'Back')}
        </button>
        <div className="flex items-center gap-[8px] sm:gap-[12px] ms-auto">
          <button
            type="button"
            onClick={onDone}
            className="text-[15px] font-[600] text-textItemBlur hover:text-newTextColor px-[12px] sm:px-[16px] h-[44px]"
          >
            {t('onboarding_skip_for_now', 'Skip for now')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex items-center bg-btnPrimary hover:brightness-110 text-white font-semibold px-[28px] sm:px-[32px] h-[48px] rounded-[12px] text-[16px] transition-all"
          >
            {t('onboarding_finish', 'Finish')}
          </button>
        </div>
      </div>
    </div>
  );
};
