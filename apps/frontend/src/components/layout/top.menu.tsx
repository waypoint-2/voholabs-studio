'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AgentMediaModal } from '@gitroom/frontend/components/layout/agent.media.modal';
import {
  TONE_SOFT,
  TONE_TEXT,
  useFeatureTone,
  useWalletAccess,
  WalletAccess,
} from '@gitroom/frontend/components/wallet-locks/wallet.access';
import {
  LockIcon,
  SkillsIcon,
} from '@gitroom/frontend/components/wallet-locks/wallet.icons';

interface MenuItemInterface {
  name: string;
  icon: ReactNode;
  path: string;
  role?: string[];
  hide?: boolean;
  requireBilling?: boolean;
  // Paid-tier only: the AI capability is what the brief and the agent run on.
  requireAi?: boolean;
  onClick?: () => void;
  comingSoon?: boolean;
  // Opened by the first wallet top-up: shown locked on the free plan, with
  // this text on hover.
  lockedTip?: string;
  // The (i) beside the page title. Not shown while the feature is locked.
  titleInfo?: string;
}

export const useMenuItem = () => {
  const { isGeneral } = useVariables();
  const t = useT();
  const { openModal } = useModals();
  // A paid plan keeps the menu it had: the brief as before, no skills.
  const paidPlan = useWalletAccess() === 'plan';

  const handleAgentMediaClick = useCallback(() => {
    openModal({
      title: t('agent_media_title', 'UGC videos by AgentMedia'),
      closeOnClickOutside: true,
      closeOnEscape: true,
      children: <AgentMediaModal />,
    });
  }, [openModal, t]);

  const firstMenu = [
    {
      name: isGeneral ? t('calendar', 'Calendar') : t('launches', 'Launches'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="23"
          viewBox="0 0 21 23"
          fill="none"
        >
          <path
            d="M19.5 9.5H1.5M14.5 1.5V5.5M6.5 1.5V5.5M6.3 21.5H14.7C16.3802 21.5 17.2202 21.5 17.862 21.173C18.4265 20.8854 18.8854 20.4265 19.173 19.862C19.5 19.2202 19.5 18.3802 19.5 16.7V8.3C19.5 6.61984 19.5 5.77976 19.173 5.13803C18.8854 4.57354 18.4265 4.1146 17.862 3.82698C17.2202 3.5 16.3802 3.5 14.7 3.5H6.3C4.61984 3.5 3.77976 3.5 3.13803 3.82698C2.57354 4.1146 2.1146 4.57354 1.82698 5.13803C1.5 5.77976 1.5 6.61984 1.5 8.3V16.7C1.5 18.3802 1.5 19.2202 1.82698 19.862C2.1146 20.4265 2.57354 20.8854 3.13803 21.173C3.77976 21.5 4.61984 21.5 6.3 21.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/launches',
    },
    {
      name: t('analytics', 'Analytics'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="19"
          viewBox="0 0 20 19"
          fill="none"
        >
          <path
            d="M18.5 18H3.01111C2.48217 18 2.2177 18 2.01568 17.8971C1.83797 17.8065 1.69349 17.662 1.60294 17.4843C1.5 17.2823 1.5 17.0178 1.5 16.4889V1M18.5 4.77778L13.3676 9.91019C13.1806 10.0972 13.0871 10.1907 12.9793 10.2257C12.8844 10.2565 12.7823 10.2565 12.6874 10.2257C12.5796 10.1907 12.4861 10.0972 12.2991 9.91019L10.5343 8.14537C10.3472 7.95836 10.2537 7.86486 10.1459 7.82982C10.0511 7.79901 9.94892 7.79901 9.85407 7.82982C9.74625 7.86486 9.65275 7.95836 9.46574 8.14537L5.27778 12.3333M18.5 4.77778H14.7222M18.5 4.77778V8.55556"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/analytics',
    },
    {
      name: t('media', 'Media'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="21"
          viewBox="0 0 20 21"
          fill="none"
        >
          <path
            d="M7.50008 3L6.66675 7.16667M13.3334 3L12.5001 7.16667M18.3334 7.16667H1.66675M5.66675 18H14.3334C15.7335 18 16.4336 18 16.9684 17.7275C17.4388 17.4878 17.8212 17.1054 18.0609 16.635C18.3334 16.1002 18.3334 15.4001 18.3334 14V7C18.3334 5.59987 18.3334 4.8998 18.0609 4.36502C17.8212 3.89462 17.4388 3.51217 16.9684 3.27248C16.4336 3 15.7335 3 14.3334 3H5.66675C4.26662 3 3.56655 3 3.03177 3.27248C2.56137 3.51217 2.17892 3.89462 1.93923 4.36502C1.66675 4.8998 1.66675 5.59987 1.66675 7V14C1.66675 15.4001 1.66675 16.1002 1.93923 16.635C2.17892 17.1054 2.56137 17.4878 3.03177 17.7275C3.56655 18 4.26662 18 5.66675 18Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/media',
    },
    {
      name: t('plugs', 'Plugs'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="19"
          viewBox="0 0 18 19"
          fill="none"
        >
          <path
            d="M11.6711 6.21205C11.3397 5.88068 11.174 5.715 11.1119 5.52395C11.0573 5.35589 11.0573 5.17486 11.1119 5.00681C11.174 4.81575 11.3397 4.65007 11.6711 4.3187L14.0461 1.94369C13.4158 1.65867 12.7162 1.5 11.9795 1.5C9.20677 1.5 6.95901 3.74776 6.95901 6.5205C6.95901 6.93138 7.00837 7.33073 7.10148 7.71294C7.20119 8.12224 7.25104 8.32689 7.24219 8.45618C7.23292 8.59154 7.21274 8.66355 7.15032 8.78401C7.0907 8.89907 6.97646 9.0133 6.748 9.24177L1.52013 14.4696C0.826947 15.1628 0.826948 16.2867 1.52013 16.9799C2.21332 17.6731 3.3372 17.6731 4.03039 16.9799L9.25825 11.752C9.48672 11.5236 9.60095 11.4093 9.71601 11.3497C9.83647 11.2873 9.90848 11.2671 10.0438 11.2578C10.1731 11.249 10.3778 11.2988 10.7871 11.3985C11.1693 11.4916 11.5686 11.541 11.9795 11.541C14.7523 11.541 17 9.29325 17 6.5205C17 5.78382 16.8413 5.0842 16.5563 4.45394L14.1813 6.82895C13.8499 7.16032 13.6843 7.326 13.4932 7.38808C13.3252 7.44269 13.1441 7.44269 12.9761 7.38808C12.785 7.326 12.6193 7.16032 12.288 6.82895L11.6711 6.21205Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/plugs',
    },
    {
      name: t('brief', 'Brief'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Someone briefing someone: a person and what they are saying.
              The scene it comes from has two people, a document and two
              bubbles, which is a smudge at 22px — a person plus one bubble is
              what survives. The bubble is square-ish and off to the side so it
              does not read as the Agent chat icon, which is a round centred
              bubble with the same two lines in it. */}
          <rect x="12.2" y="2.6" width="9.4" height="7.6" rx="1.8" />
          <path d="M15 10.2 13.8 13 17.4 10.2" />
          <path d="M14.6 5.3h4.8M14.6 7.6h2.8" />
          <circle cx="6.5" cy="12.8" r="2.9" />
          <path d="M1.5 21.3c0-3 2.2-5.3 5-5.3s5 2.3 5 5.3" />
        </svg>
      ),
      path: '/brief',
      ...(paidPlan
        ? { requireAi: true }
        : {
            lockedTip: t(
              'brief_locked_tip',
              'Top up to start the brief onboarding.'
            ),
            titleInfo: t(
              'brief_title_info',
              'Brief is the structured document about your brand, audience, voice and channels. It steers what your agent writes. Imagine you are briefing your chief marketing officer: you can brief the agent manually, via MCP using another agent, or by talking directly to the agent.'
            ),
          }),
    },
    {
      name: t('skills', 'Skills'),
      icon: <SkillsIcon />,
      path: '/skills',
      hide: paidPlan,
      lockedTip: `${t(
        'skills_locked',
        'Ready-made skills for hooks, writing in your voice, removing AI slop, and shaping posts for every channel. Skills are available to your agent through MCP.'
      )} ${t('skills_locked_unlock', 'A single top-up unlocks them.')}`,
      titleInfo: t(
        'skills_title_info',
        'Ready-made skills for hooks, writing in your voice, removing AI slop, and shaping posts for every channel. Using them is free.'
      ),
    },
    {
      name: t('agent', 'Agent'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="21"
          viewBox="0 0 22 22"
          fill="none"
        >
          <path
            d="M6.5 8.5H13.5M6.5 12H11M11 19.5C15.6944 19.5 19.5 15.6944 19.5 11C19.5 6.30558 15.6944 2.5 11 2.5C6.30558 2.5 2.5 6.30558 2.5 11C2.5 12.3861 2.83178 13.6948 3.42015 14.8507C3.57628 15.1574 3.62831 15.5091 3.53941 15.8412L3.02409 17.7663C2.80065 18.6009 3.5641 19.3643 4.39869 19.141L6.32378 18.6257C6.65585 18.5368 7.00758 18.5888 7.31434 18.7449C8.47018 19.3333 9.77891 19.5 11 19.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/agents',
      requireAi: true,
      // Hidden from the menu for now, not removed. The page and the /agents
      // route still work and are still reachable by URL - this only unlists it,
      // the same way Integrations below is unlisted. Drop this line to bring it
      // back.
      hide: true,
    },
    // Integrations (/third-party) is deliberately absent. The page and both of
    // its providers still work and the route is still reachable by URL; it is
    // only unlisted, the same way the old chat was. Nothing carries comingSoon
    // now, so the "Coming soon" group below renders nothing.
  ] satisfies MenuItemInterface[] as MenuItemInterface[];

  const secondMenu = [
    {
      name: t('UGC', 'UGC'),
      icon: (
        <svg
          fill="#c52e2e"
          height="30"
          width="20"
          version="1.1"
          id="Layer_1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 408.333 408.333"
        >
          <g id="SVGRepo_bgCarrier" strokeWidth="0" />
          <g
            id="SVGRepo_tracerCarrier"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <g id="SVGRepo_iconCarrier">
            <g id="XMLID_230_">
              <g>
                <path d="M311.056,164.871c41.82-8.912,73.109-49.495,73.109-84.871c0-70-40-80-40-80c0,71.666-19.216,85.621-20,86.666V30 c-50,10-50,96.666-50,116.667c0,7.415-5.414,13.575-12.494,14.773c-5.775-44.153-20.583-71.803-33.729-88.309 c5.77-6.311,12.488-17.252,15.099-35.229c6.586-3.272,11.124-10.049,11.124-17.902c0-11.045-8.955-20-20-20 c-11.046,0-20,8.955-20,20c0,6.912,3.506,13.003,8.837,16.596c-1.916,11.42-5.84,18.233-8.98,22.042 c-5.889-4.981-9.856-6.971-9.856-6.971s-3.968,1.99-9.856,6.971c-3.141-3.809-7.064-10.622-8.98-22.042 c5.33-3.593,8.837-9.685,8.837-16.596c0-11.045-8.955-20-20-20c-11.046,0-20,8.955-20,20c0,7.854,4.537,14.63,11.124,17.902 c2.61,17.977,9.329,28.917,15.099,35.229c-13.146,16.506-27.953,44.156-33.729,88.309c-7.08-1.198-12.494-7.358-12.494-14.773 c0-20,0-106.667-50-116.667v56.666c-0.784-1.045-20-15-20-86.666c0,0-40,10-40,80c0,35.377,31.289,75.96,73.109,84.871 c7.002,19.898,25.135,34.588,46.893,36.558c0,0.08-0.002,0.157-0.002,0.237v15h-21c-13.785,0-25-11.215-25-25h-20 c0,24.813,20.187,45,45,45h21v15h-21c-24.813,0-45,20.187-45,45h20c0-13.785,11.215-25,25-25h21 c0,8.095,3.213,15.436,8.425,20.833c-5.212,5.397-8.425,12.737-8.425,20.833c0,10.41,5.304,19.578,13.355,24.958L134.166,385 c0,0,19.213,23.333,70,23.333c50.787,0,70-23.333,70-23.333l-23.354-46.709c8.051-5.38,13.354-14.548,13.354-24.958 c0-8.096-3.213-15.436-8.425-20.833c5.212-5.397,8.425-12.738,8.425-20.833h21c13.785,0,25,11.215,25,25h20 c0-24.813-20.186-45-45-45h-21v-15h21c24.814,0,45-20.187,45-45h-20c0,13.785-11.215,25-25,25h-21v-15 c0-0.08-0.002-0.158-0.002-0.237C285.923,199.459,304.054,184.77,311.056,164.871z" />
              </g>
            </g>
          </g>
        </svg>
      ),
      path: '#',
      role: ['ADMIN', 'SUPERADMIN', 'USER'],
      requireBilling: true,
      onClick: handleAgentMediaClick,
    },
    {
      name: t('affiliate', 'Affiliate'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="21"
          viewBox="0 0 20 21"
          fill="none"
        >
          <path
            d="M15.0004 6.467C14.9504 6.45866 14.8921 6.45866 14.8421 6.467C13.6921 6.42533 12.7754 5.48366 12.7754 4.31699C12.7754 3.12533 13.7337 2.16699 14.9254 2.16699C16.1171 2.16699 17.0754 3.13366 17.0754 4.31699C17.0671 5.48366 16.1504 6.42533 15.0004 6.467Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.1419 12.5338C15.2836 12.7255 16.5419 12.5255 17.4253 11.9338C18.6003 11.1505 18.6003 9.86713 17.4253 9.08379C16.5336 8.49213 15.2586 8.29212 14.1169 8.49212"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.97466 6.467C5.02466 6.45866 5.08299 6.45866 5.13299 6.467C6.28299 6.42533 7.19966 5.48366 7.19966 4.31699C7.19966 3.12533 6.24133 2.16699 5.04966 2.16699C3.85799 2.16699 2.89966 3.13366 2.89966 4.31699C2.90799 5.48366 3.82466 6.42533 4.97466 6.467Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.83304 12.5338C4.69137 12.7255 3.43304 12.5255 2.54971 11.9338C1.37471 11.1505 1.37471 9.86713 2.54971 9.08379C3.44137 8.49213 4.71637 8.29212 5.85804 8.49212"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.0001 12.6916C9.95014 12.6833 9.89181 12.6833 9.84181 12.6916C8.69181 12.6499 7.77515 11.7083 7.77515 10.5416C7.77515 9.34994 8.73348 8.3916 9.92514 8.3916C11.1168 8.3916 12.0751 9.35827 12.0751 10.5416C12.0668 11.7083 11.1501 12.6583 10.0001 12.6916Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.5751 15.3158C6.4001 16.0992 6.4001 17.3825 7.5751 18.1658C8.90843 19.0575 11.0918 19.0575 12.4251 18.1658C13.6001 17.3825 13.6001 16.0992 12.4251 15.3158C11.1001 14.4325 8.90843 14.4325 7.5751 15.3158Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: 'https://affiliate.postiz.com',
      role: ['ADMIN', 'SUPERADMIN', 'USER'],
      requireBilling: true,
    },
    {
      name: t('billing', 'Billing'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="21"
          viewBox="0 0 20 21"
          fill="none"
        >
          <path
            d="M7.08341 12.7225C7.08341 13.7964 7.95397 14.667 9.02786 14.667H10.8334C11.984 14.667 12.9167 13.7343 12.9167 12.5837C12.9167 11.4331 11.984 10.5003 10.8334 10.5003H9.16675C8.01615 10.5003 7.08341 9.56759 7.08341 8.41699C7.08341 7.2664 8.01615 6.33366 9.16675 6.33366H10.9723C12.0462 6.33366 12.9167 7.20422 12.9167 8.2781M10.0001 5.08366V6.33366M10.0001 14.667V15.917M18.3334 10.5003C18.3334 15.1027 14.6025 18.8337 10.0001 18.8337C5.39771 18.8337 1.66675 15.1027 1.66675 10.5003C1.66675 5.89795 5.39771 2.16699 10.0001 2.16699C14.6025 2.16699 18.3334 5.89795 18.3334 10.5003Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/billing',
      role: ['ADMIN', 'SUPERADMIN'],
      requireBilling: true,
    },
    {
      name: t('support', 'Support'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="21"
          viewBox="0 0 20 21"
          fill="none"
        >
          <path
            d="M10 18.8337C14.6024 18.8337 18.3333 15.1027 18.3333 10.5003C18.3333 5.89795 14.6024 2.16699 10 2.16699C5.39763 2.16699 1.66667 5.89795 1.66667 10.5003C1.66667 15.1027 5.39763 18.8337 10 18.8337Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 13.8337C11.841 13.8337 13.3333 12.3413 13.3333 10.5003C13.3333 8.65938 11.841 7.16699 10 7.16699C8.15905 7.16699 6.66667 8.65938 6.66667 10.5003C6.66667 12.3413 8.15905 13.8337 10 13.8337Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.10833 4.60866L7.64167 8.14199M12.3583 12.8587L15.8917 16.392M12.3583 8.14199L15.8917 4.60866M7.64167 12.8587L4.10833 16.392"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      // The community Discord. An http path opens in a new tab.
      path: 'https://discord.gg/2zXy7A9Fz8',
      role: ['ADMIN', 'USER', 'SUPERADMIN'],
    },
    {
      name: t('settings', 'Settings'),
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="21"
          viewBox="0 0 20 21"
          fill="none"
        >
          <path
            d="M7.82912 16.6429L8.31616 17.7383C8.46094 18.0644 8.69722 18.3414 8.99635 18.5358C9.29547 18.7303 9.64458 18.8337 10.0013 18.8337C10.3581 18.8337 10.7072 18.7303 11.0063 18.5358C11.3055 18.3414 11.5417 18.0644 11.6865 17.7383L12.1736 16.6429C12.3469 16.2542 12.6386 15.9302 13.0069 15.717C13.3776 15.5032 13.8063 15.4121 14.2319 15.4568L15.4236 15.5837C15.7783 15.6212 16.1363 15.555 16.4541 15.3931C16.772 15.2312 17.0361 14.9806 17.2143 14.6716C17.3928 14.3628 17.4778 14.0089 17.4591 13.6527C17.4403 13.2966 17.3186 12.9535 17.1087 12.6651L16.4032 11.6957C16.152 11.3479 16.0177 10.9293 16.0199 10.5003C16.0198 10.0725 16.1553 9.65562 16.4069 9.30959L17.1125 8.34014C17.3223 8.05179 17.444 7.70872 17.4628 7.35255C17.4815 6.99639 17.3965 6.64244 17.218 6.33366C17.0398 6.02469 16.7757 5.77407 16.4578 5.61218C16.14 5.4503 15.782 5.3841 15.4273 5.42162L14.2356 5.54847C13.81 5.59317 13.3813 5.50209 13.0106 5.28829C12.6415 5.07387 12.3498 4.74812 12.1773 4.35773L11.6865 3.26236C11.5417 2.9363 11.3055 2.65925 11.0063 2.46482C10.7072 2.27039 10.3581 2.16693 10.0013 2.16699C9.64458 2.16693 9.29547 2.27039 8.99635 2.46482C8.69722 2.65925 8.46094 2.9363 8.31616 3.26236L7.82912 4.35773C7.65656 4.74812 7.36485 5.07387 6.99579 5.28829C6.62513 5.50209 6.19634 5.59317 5.77079 5.54847L4.57542 5.42162C4.22069 5.3841 3.8627 5.4503 3.54485 5.61218C3.22699 5.77407 2.96293 6.02469 2.78468 6.33366C2.60619 6.64244 2.52116 6.99639 2.5399 7.35255C2.55864 7.70872 2.68034 8.05179 2.89023 8.34014L3.59579 9.30959C3.8474 9.65562 3.9829 10.0725 3.98282 10.5003C3.9829 10.9282 3.8474 11.345 3.59579 11.6911L2.89023 12.6605C2.68034 12.9489 2.55864 13.2919 2.5399 13.6481C2.52116 14.0043 2.60619 14.3582 2.78468 14.667C2.96311 14.9758 3.2272 15.2263 3.54501 15.3882C3.86282 15.55 4.22072 15.6163 4.57542 15.579L5.76708 15.4522C6.19264 15.4075 6.62143 15.4986 6.99208 15.7124C7.36252 15.9262 7.65559 16.252 7.82912 16.6429Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.99985 13.0003C11.3806 13.0003 12.4999 11.881 12.4999 10.5003C12.4999 9.11961 11.3806 8.00033 9.99985 8.00033C8.61914 8.00033 7.49985 9.11961 7.49985 10.5003C7.49985 11.881 8.61914 13.0003 9.99985 13.0003Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      path: '/settings',
      role: ['ADMIN', 'USER', 'SUPERADMIN'],
    },
  ] satisfies MenuItemInterface[] as MenuItemInterface[];

  return {
    all: [...firstMenu, ...secondMenu],
    firstMenu,
    secondMenu,
  };
};

// The menu sits on the start side, so its hovers open towards the end.
const useEndSide = () => {
  const [place, setPlace] = useState<'right' | 'left'>('right');
  useEffect(() => {
    setPlace(document.documentElement.dir === 'rtl' ? 'left' : 'right');
  }, []);
  return place;
};

// A feature the first wallet top-up opens, seen on the free plan. It still
// leads to its page, which explains it and offers the top-up. The lock is
// warm, like every signal that needs a top-up.
const LockedMenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  tip: string;
}> = ({ label, icon, path, tip }) => {
  const t = useT();
  const currentPath = usePathname();
  const place = useEndSide();
  const isActive = currentPath.indexOf(path) === 0;
  const tone = useFeatureTone(path.replace(/^\//, ''));
  return (
    <Link
      prefetch={true}
      href={path}
      aria-label={t('menu_locked_label', '{{label}}, locked. {{tip}}', {
        label,
        tip,
      })}
      data-tooltip-id="tooltip"
      data-tooltip-content={tip}
      data-tooltip-place={place}
      data-tooltip-class-name="!max-w-[280px] !whitespace-normal !leading-[1.5]"
      className={clsx(
        'group relative w-full minCustom:h-[54px] custom:h-[44px] py-[8px] px-[6px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] transition-colors hover:bg-boxHover hover:text-newTextColor',
        isActive ? 'bg-boxHover text-newTextColor' : 'text-textItemBlur'
      )}
    >
      <div className="custom:scale-90 opacity-60 group-hover:opacity-90 transition-opacity">
        {icon}
      </div>
      <div className="custom:text-[9px] minCustom:text-[10px] leading-[1.1] text-center opacity-60 group-hover:opacity-90">
        {label}
      </div>
      <span
        className={clsx(
          'absolute top-[5px] end-[9px] w-[16px] h-[16px] rounded-full border border-newBgColorInner flex items-center justify-center',
          TONE_SOFT[tone],
          TONE_TEXT[tone]
        )}
      >
        <LockIcon size={9} />
      </span>
    </Link>
  );
};

const isLocked = (item: MenuItemInterface, access?: WalletAccess) =>
  !!item.lockedTip && access === 'free';

export const TopMenu: FC = () => {
  const user = useUser();
  const t = useT();
  const { firstMenu, secondMenu } = useMenuItem();
  const { isGeneral, billingEnabled } = useVariables();
  const access = useWalletAccess();
  // Free and pay-as-you-go workspaces pay through the wallet; Postiz billing
  // is for the paid plans.
  const walletWorkspace = access === 'free' || access === 'payg';

  const menuVisible = (f: MenuItemInterface) => {
    if (f.hide) {
      return false;
    }
    if (f.requireBilling && !billingEnabled) {
      return false;
    }
    // The tier already accounts for the deployment: an instance without billing
    // reports ULTIMATE, and only an expired trial or a real free plan reports
    // FREE. Gating on billingEnabled here would switch the check off precisely
    // where the trial paywall does the work.
    if (f.requireAi && !user?.tier?.ai) {
      return false;
    }
    if (f.name === 'Billing' && user?.isLifetime) {
      return false;
    }
    if (f.role) {
      return f.role.includes(user?.role!);
    }
    return true;
  };
  const visibleFirst = firstMenu.filter(menuVisible);
  const firstActive = visibleFirst.filter((f) => !f.comingSoon);
  const firstComingSoon = visibleFirst.filter((f) => f.comingSoon);

  return (
    <>
      <div className="flex flex-1 flex-col minCustom:gap-[16px] blurMe">
        {
          // @ts-ignore
          user?.orgId &&
            // @ts-ignore
            (user.tier !== 'FREE' || !isGeneral || !billingEnabled) && (
              <>
                {firstActive.map((item) =>
                  isLocked(item, access) ? (
                    <LockedMenuItem
                      path={item.path}
                      label={item.name}
                      icon={item.icon}
                      tip={item.lockedTip!}
                      key={item.name}
                    />
                  ) : (
                    <MenuItem
                      path={item.path}
                      label={item.name}
                      icon={item.icon}
                      key={item.name}
                      onClick={item.onClick}
                    />
                  )
                )}
                {firstComingSoon.length > 0 && (
                  <div className="flex flex-col minCustom:gap-[16px] custom:gap-[8px] minCustom:mt-[12px] custom:mt-[6px]">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-textItemBlur text-center leading-none whitespace-nowrap">
                      {t('coming_soon', 'Coming soon')}
                    </div>
                    {firstComingSoon.map((item) => (
                      <MenuItem
                        path={item.path}
                        label={item.name}
                        icon={item.icon}
                        key={item.name}
                        comingSoon
                      />
                    ))}
                  </div>
                )}
              </>
            )
        }
      </div>
      <div className="flex flex-col minCustom:gap-[20px] custom:gap-[8px] blurMe">
        {secondMenu
          .filter((f) => {
            if (f.hide) {
              return false;
            }
            if (f.requireBilling && !billingEnabled) {
              return false;
            }
            if (f.name === 'Billing' && user?.isLifetime) {
              return false;
            }
            if (f.path === '/billing' && walletWorkspace) {
              return false;
            }
            if (f.role) {
              return f.role.includes(user?.role!);
            }
            return true;
          })
          .map((item, index) => (
            <MenuItem
              path={item.path}
              label={item.name}
              icon={item.icon}
              key={item.name}
              onClick={item.onClick}
            />
          ))}
        {/* The free plan is the product, not a rung below one, so it carries no
            label. */}
        {!!user?.tier?.current && user.tier.current !== 'FREE' && (
          <div
            className="w-full px-[4px] custom:text-[8px] minCustom:text-[9px] font-[700] uppercase tracking-[0.04em] text-center leading-[1.1] break-words overflow-hidden"
            style={{ color: '#E8A33D' }}
            title={`Your plan: ${user.tier.current}`}
          >
            {user.tier.current}
          </div>
        )}
      </div>
    </>
  );
};
