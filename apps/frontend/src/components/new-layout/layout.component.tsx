'use client';

import React, { ReactNode, useCallback } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Inter_Tight } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import {
  ApexBanner,
  useApexBanner,
} from '@gitroom/frontend/components/layout/apex.banner';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { TrialBanner } from '@gitroom/frontend/components/layout/trial.banner';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { RequiredOnboarding } from '@gitroom/frontend/components/onboarding/required.onboarding';
import { RequiredTerms } from '@gitroom/frontend/components/onboarding/required.terms';
import { WalletHeader } from '@gitroom/frontend/components/wallet/wallet.header';

const interTight = Inter_Tight({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });
  const apexBanner = useApexBanner(user?.tier === 'FREE');

  if (!user) return null;

  // The form stands alone, with none of the app mounted around it. Anything
  // mounted here would call the API, be refused until the form is done, and
  // leave that refusal cached under keys the calendar reads afterwards. For the
  // same reason finishing is a fresh page load and not a re-render.
  if (user.needsOnboarding) {
    return (
      <ContextWrapper user={user}>
        <MantineWrapper>
          <Toaster />
          <div
            className={clsx(
              'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
              interTight.className
            )}
          >
            <RequiredOnboarding
              name={user.name}
              email={user.email}
              onDone={() => {
                // A new account goes on to connecting its channels.
                window.location.href = '/launches?onboarding=true';
              }}
            />
          </div>
        </MantineWrapper>
      </ContextWrapper>
    );
  }

  // Same again for the Terms: the app waits until the current version has been
  // agreed to. It comes after the onboarding form, and nobody sees it while an
  // admin is impersonating them.
  if (user.needsTerms) {
    return (
      <ContextWrapper user={user}>
        <MantineWrapper>
          <Toaster />
          <div
            className={clsx(
              'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
              interTight.className
            )}
          >
            <RequiredTerms
              onDone={() => {
                // Keep a new account on its way to connecting channels; anyone
                // re-agreeing to updated Terms goes back to the app as before.
                window.location.href = searchParams.get('onboarding')
                  ? '/launches?onboarding=true'
                  : '/';
              }}
            />
          </div>
        </MantineWrapper>
      </ContextWrapper>
    );
  }

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
                interTight.className
              )}
            >
              <div>{user?.admin ? <Impersonate /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  {apexBanner.show && (
                    <ApexBanner onClose={apexBanner.dismiss} />
                  )}
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div className="flex flex-col bg-newBgColorInner w-[80px] rounded-[12px]">
                      <div
                        id="left-menu"
                        className={clsx(
                          'fixed w-[64px] start-[17px] flex flex-1',
                          // The Apex banner pushes the page down 44px; the
                          // fixed menu moves with it to stay aligned.
                          apexBanner.show
                            ? 'top-[44px] h-[calc(100%-44px)]'
                            : 'top-0 h-full',
                          user?.admin && 'pt-[60px] max-h-[1000px]:w-[500px]'
                        )}
                      >
                        <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px]">
                          <Logo />
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <div className="relative flex bg-newBgColorInner h-[80px] px-[20px] items-center">
                        <div className="text-[24px] font-[600] flex flex-1">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] text-textItemBlur items-center">
                          <TrialBanner />
                          <StreakComponent />
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <OrganizationSelector />
                          <div className="hover:text-newTextColor">
                            <ModeComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <LanguageComponent />
                          <ChromeExtensionComponent />
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <AttachToFeedbackIcon />
                          {user.tier === 'FREE' && <WalletHeader />}
                          <NotificationComponent />
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px]">{children}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
