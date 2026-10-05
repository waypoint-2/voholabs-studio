'use client';

import { useFireEvents, useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import React, { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';

/**
 * Shown in place of the app to anybody who has not agreed to the current
 * Terms: every account from before we kept a record, and everybody again when
 * the Terms change. A new account never sees it, it ticked the box signing up.
 *
 * It shows the short version of the Terms, with links to the full text.
 */
export const RequiredTerms: FC<{
  onDone: () => void;
}> = ({ onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const fireEvents = useFireEvents();
  useTrackView('onboarding_step', { step: 'terms' });

  const logout = useCallback(async () => {
    await fetch('/user/logout', { method: 'POST' });
    window.location.href = '/';
  }, []);

  const agree = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const response = await fetch('/user/terms', { method: 'POST' });
    setLoading(false);

    if (response.ok) {
      fireEvents('onboarding_step', { step: 'terms_accepted' }, { send_instantly: true });
      onDone();
      return;
    }

    setFailed(true);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center py-[40px]">
      <div className="w-full max-w-[640px] bg-newBgColorInner rounded-[12px] p-[32px] flex flex-col gap-[24px] text-textColor">
        <div className="flex flex-col gap-[12px]">
          <Logo />
          <h1 className="text-[28px] font-[600] text-newTextColor">
            {t('terms_gate_title', 'Our Terms have changed')}
          </h1>
          <div className="text-[14px] text-textItemBlur">
            {t(
              'terms_gate_subtitle',
              'Voholabs Studio is now free. Please read the short version and agree to carry on.'
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-[10px] text-[14px] list-disc ps-[18px]">
          <li>
            {t(
              'terms_gate_point_risk',
              'The service is free, provided as is, and you use it entirely at your own risk. We are not liable to you for anything that happens because you used it.'
            )}
          </li>
          <li>
            {t(
              'terms_gate_point_accounts',
              'Your social accounts and everything posted from your workspace are your responsibility, including posts made by team members, API keys and AI agents. That includes an account, a page, a login or data that is leaked, hacked, lost, restricted, suspended or banned, and any money, reach or business you lose.'
            )}
          </li>
          <li>
            {t(
              'terms_gate_point_posts',
              'A post can go out late, twice, or not at all. Check the posts that matter.'
            )}
          </li>
          <li>
            {t(
              'terms_gate_point_hosting',
              'Studio is community hosted. There is no uptime or support commitment, and the free plan and its limits can change or end.'
            )}
          </li>
          <li>
            {t(
              'terms_gate_point_business',
              'Studio is for business use. If you need a provider that accepts liability or promises a service level, use a paid service that sells one, and insure your business.'
            )}
          </li>
        </ul>

        <div className="text-[14px]">
          {t(
            'terms_gate_read',
            'Agreeing means you accept the Terms of Service and have read the Privacy Policy:'
          )}
          &nbsp;
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="underline hover:font-bold"
          >
            {t('terms_of_service', 'Terms of Service')}
          </a>
          &nbsp;{t('and', 'and')}&nbsp;
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="underline hover:font-bold"
          >
            {t('privacy_policy', 'Privacy Policy')}
          </a>
          .
        </div>

        {failed && (
          <div className="text-red-400 text-[12px]">
            {t('terms_gate_failed', 'Something went wrong, please try again.')}
          </div>
        )}

        <div className="flex items-center gap-[16px]">
          <Button
            type="button"
            onClick={agree}
            className="flex-1 rounded-[10px] !h-[52px]"
            loading={loading}
          >
            {t(
              'terms_gate_agree',
              'I use Studio for my business and I agree to the Terms'
            )}
          </Button>
          <button
            type="button"
            onClick={logout}
            className="text-[14px] text-textItemBlur hover:text-newTextColor"
          >
            {t('logout', 'Logout')}
          </button>
        </div>
      </div>
    </div>
  );
};
