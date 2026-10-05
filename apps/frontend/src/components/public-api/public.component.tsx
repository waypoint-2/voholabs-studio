'use client';

import { useState, useCallback, useEffect, useRef, FC, ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { useUser } from '../layout/user.context';
import copy from 'copy-to-clipboard';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';
import clsx from 'clsx';
import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';
import { LegacyPublicComponent } from '@gitroom/frontend/components/public-api/public.component.legacy';

const mcpClients = [
  'Claude Code',
  'Cursor',
  'VS Code / Copilot',
  'Windsurf',
  'Amp',
  'Codex',
  'Gemini CLI',
  'Warp',
] as const;

type McpClient = (typeof mcpClients)[number];

// Coding agents read the key from an Authorization header, so they all point at
// the plain /mcp endpoint. Chat apps (Claude, ChatGPT) cannot set headers, so
// they use the /mcp/<key> form instead — see connectorUrl below.
const getMcpConfig = (
  client: McpClient,
  mcpBase: string,
  apiKey: string
): { config: string; hint: string } => {
  const urlBase = `${mcpBase}/mcp`;
  const bearer = `Bearer ${apiKey}`;
  // Distinct registration name so adding this MCP doesn't overwrite an
  // existing "postiz" server (or CLI) the user may already have configured.
  const serverName = 'voholabs';

  const json = (obj: object) => JSON.stringify(obj, null, 2);

  switch (client) {
    case 'Claude Code':
      return {
        config: `claude mcp add --transport http ${serverName} ${urlBase} --header "Authorization: ${bearer}"`,
        hint: 'Run this command in your terminal.',
      };
    case 'Cursor':
      return {
        config: json({
          mcpServers: {
            [serverName]: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: 'Add to .cursor/mcp.json in your project root.',
      };
    case 'VS Code / Copilot':
      return {
        config: json({
          servers: {
            [serverName]: {
              type: 'http',
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to .vscode/mcp.json in your project root.',
      };
    case 'Windsurf':
      return {
        config: json({
          mcpServers: {
            [serverName]: {
              serverUrl: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to ~/.codeium/windsurf/mcp_config.json',
      };
    case 'Amp':
      return {
        config: json({
          'amp.mcpServers': {
            [serverName]: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: 'Add to your Amp settings.json',
      };
    case 'Codex':
      return {
        config: `# ~/.codex/config.toml\n\n[mcp_servers.${serverName}]\nurl = "${urlBase}"\nhttp_headers = { "Authorization" = "${bearer}" }`,
        hint: 'Add to ~/.codex/config.toml',
      };
    case 'Gemini CLI':
      return {
        config: json({
          mcpServers: {
            [serverName]: { url: urlBase, headers: { Authorization: bearer } },
          },
        }),
        hint: 'Add to ~/.gemini/settings.json',
      };
    case 'Warp':
      return {
        config: json({
          [serverName]: { url: urlBase, headers: { Authorization: bearer } },
        }),
        hint: 'Settings > MCP Servers > + Add, then paste this config.',
      };
  }
};

const maskKey = (text: string, apiKey: string) =>
  text.split(apiKey).join('••••••••••••••••••••');

const CopyButton = ({
  text,
  label,
  primary,
}: {
  text: string;
  label: string;
  primary?: boolean;
}) => {
  const toaster = useToaster();
  return (
    <button
      type="button"
      onClick={() => {
        copy(text);
        toaster.show(`${label} copied to clipboard`, 'success');
      }}
      className={clsx(
        'cursor-pointer px-[16px] h-[36px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]',
        primary
          ? 'bg-btnPrimary hover:brightness-110 text-white'
          : 'bg-btnSimple hover:bg-boxHover'
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {label}
    </button>
  );
};

const RevealButton = ({
  revealed,
  onClick,
}: {
  revealed: boolean;
  onClick: () => void;
}) => {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {revealed ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      {revealed ? t('hide', 'Hide') : t('reveal', 'Reveal')}
    </button>
  );
};

const CodeBlock: FC<{ children: ReactNode }> = ({ children }) => (
  <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
    {children}
  </pre>
);

const SectionCard: FC<{
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}> = ({ title, description, actions, children }) => (
  <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
    <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
      <div>
        <div className="text-[15px] font-[600]">{title}</div>
        <div className="text-[13px] text-textItemBlur mt-[2px]">
          {description}
        </div>
      </div>
      {!!actions && (
        <div className="flex gap-[6px] shrink-0 pt-[2px]">{actions}</div>
      )}
    </div>
    <div className="p-[20px] flex flex-col gap-[16px]">{children}</div>
  </div>
);

const DocsLink = ({ href, label }: { href: string; label: string }) => (
  <a
    className="cursor-pointer px-[16px] h-[36px] bg-btnPrimary hover:brightness-110 text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
    href={href}
    target="_blank"
    rel="noreferrer"
  >
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
    {label}
  </a>
);

const Tabs = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div className="flex flex-wrap gap-[6px]">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={clsx(
          'cursor-pointer px-[14px] h-[36px] text-[13px] font-[500] rounded-[8px] transition-colors',
          value === option.value
            ? 'bg-btnPrimary text-white'
            : 'bg-btnSimple text-textItemBlur hover:bg-boxHover hover:text-textColor'
        )}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const CopyIcon: FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const CheckIcon: FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    className="shrink-0 text-tealText"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// A small icon-only copy button, for values that sit inside a row.
const CopyIconButton = ({ text, label }: { text: string; label: string }) => {
  const t = useT();
  const toaster = useToaster();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        copy(text);
        toaster.show(t('agent_copied', 'Copied to clipboard'), 'success');
      }}
      className="shrink-0 w-[32px] h-[32px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-newTextColor hover:bg-boxHover transition-colors"
    >
      <CopyIcon />
    </button>
  );
};

// A UI path inside a sentence, e.g. Settings › Connectors.
const PathChip: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="px-[7px] py-[2px] mx-[2px] rounded-[6px] bg-btnSimple border border-newBorder text-[12px] font-[600] text-newTextColor whitespace-normal [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
    {children}
  </span>
);

const ShortStep: FC<{ index: number; children: ReactNode }> = ({
  index,
  children,
}) => (
  <li className="flex gap-[12px] items-start">
    <span className="shrink-0 w-[24px] h-[24px] rounded-full bg-tealSoft text-tealText text-[12px] font-[700] flex items-center justify-center">
      {index}
    </span>
    <div className="flex-1 min-w-0 flex flex-col gap-[8px] text-[14px] leading-[24px]">
      {children}
    </div>
  </li>
);

const SubLine: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-[12px] leading-[22px] text-textItemBlur -mt-[4px]">
    {children}
  </div>
);

// The fields to type into the chat app's "add connector" form.
const FieldsCard = ({
  rows,
}: {
  rows: { label: string; value: string; copyText?: string; hint?: boolean }[];
}) => {
  const t = useT();
  return (
    <div className="rounded-[10px] border border-newBorder bg-newBgColorInner divide-y divide-newBorder">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center gap-[12px] ps-[14px] pe-[6px] min-h-[44px] py-[4px]"
        >
          <span className="w-[96px] sm:w-[128px] shrink-0 text-[12px] text-textItemBlur">
            {row.label}
          </span>
          <span
            className={clsx(
              'flex-1 min-w-0 text-[13px] break-words',
              row.hint ? 'text-textItemBlur' : 'font-[600]'
            )}
          >
            {row.value}
          </span>
          {row.copyText ? (
            <CopyIconButton
              text={row.copyText}
              label={t('agent_copy_value', 'Copy')}
            />
          ) : (
            <span className="w-[32px] shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
};

const TRY_IT_PROMPT_DEFAULT =
  'List my Voholabs Studio channels, then schedule a post for tomorrow at 9am about our new feature.';

const TryItBox = () => {
  const t = useT();
  const prompt = t('agent_try_it_prompt', TRY_IT_PROMPT_DEFAULT);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[13px] font-[600]">
        {t('agent_try_it', 'Try it: ask your agent')}
      </div>
      <div className="flex items-center gap-[8px] rounded-[10px] border border-newBorder bg-tealHover ps-[14px] pe-[6px] py-[6px]">
        <span className="flex-1 min-w-0 text-[13px] leading-[1.6]">
          {prompt}
        </span>
        <CopyIconButton
          text={prompt}
          label={t('agent_copy_prompt', 'Copy prompt')}
        />
      </div>
    </div>
  );
};

// Collapsed by default: everything that is useful but not needed to connect.
const MoreHelp: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <details className="group rounded-[10px] border border-newBorder bg-newBgColorInner">
    <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-center justify-between gap-[8px] px-[14px] min-h-[44px] text-[13px] font-[600] text-textItemBlur hover:text-newTextColor">
      {title}
      <svg
        className="shrink-0 transition-transform group-open:rotate-180"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </summary>
    <div className="px-[14px] pb-[14px] flex flex-col gap-[10px] text-[13px] leading-[1.7] text-textItemBlur">
      {children}
    </div>
  </details>
);

const HelpLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="self-start font-[600] text-tealText hover:underline"
  >
    {label}
  </a>
);

// The one thing to do first: copy the link. Shown masked, with the short
// security line always visible.
const ConnectorLinkBlock = ({
  connectorUrl,
  apiKey,
  revealed,
  onToggleReveal,
}: {
  connectorUrl: string;
  apiKey: string;
  revealed: boolean;
  onToggleReveal: () => void;
}) => {
  const t = useT();
  const toaster = useToaster();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = () => {
    copy(connectorUrl);
    toaster.show(
      t('agent_link_copied_toast', 'Connector link copied to clipboard'),
      'success'
    );
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-[10px] rounded-[12px] border border-newBorder bg-newBgColorInner p-[16px]">
      <button
        type="button"
        onClick={onCopy}
        className="w-full sm:w-auto sm:self-start h-[48px] px-[24px] rounded-[10px] bg-btnPrimary hover:brightness-110 transition-all text-white text-[15px] font-[600] flex items-center justify-center gap-[10px]"
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        {copied
          ? t('agent_link_copied', 'Link copied')
          : t('agent_copy_connector_link', 'Copy your connector link')}
      </button>
      <div className="flex items-center gap-[10px] min-w-0">
        <code
          dir="ltr"
          className={clsx(
            'flex-1 min-w-0 text-[12px] text-textItemBlur',
            revealed ? 'break-all' : 'truncate'
          )}
        >
          {revealed ? connectorUrl : maskKey(connectorUrl, apiKey)}
        </code>
        <button
          type="button"
          onClick={onToggleReveal}
          className="shrink-0 text-[12px] font-[600] text-tealText hover:underline"
        >
          {revealed ? t('hide', 'Hide') : t('reveal', 'Reveal')}
        </button>
      </div>
      <div className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
        <ShieldIcon />
        {t(
          'agent_link_private',
          'This link is private: it can post to your channels.'
        )}
      </div>
    </div>
  );
};

const ConnectTabs = ({
  value,
  onChange,
  options,
}: {
  value: ConnectTarget;
  onChange: (value: ConnectTarget) => void;
  options: { value: ConnectTarget; label: string }[];
}) => (
  <div
    role="tablist"
    className="flex w-full sm:w-auto sm:self-start gap-[4px] p-[4px] rounded-[10px] bg-btnSimple"
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="tab"
        aria-selected={value === option.value}
        onClick={() => onChange(option.value)}
        className={clsx(
          'flex-1 sm:flex-none px-[16px] h-[36px] rounded-[8px] text-[13px] font-[600] transition-colors whitespace-nowrap',
          value === option.value
            ? 'bg-btnPrimary text-white'
            : 'text-textItemBlur hover:text-newTextColor'
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

type ConnectTarget = 'claude' | 'chatgpt' | 'developer';

const CONNECTOR_NAME = 'Voholabs Studio';

const ConnectSection = ({
  apiKey,
  mcpBase,
  cloudflareUrl,
  bare,
}: {
  apiKey: string;
  mcpBase: string;
  cloudflareUrl: string;
  // Without the card and its heading, for the onboarding step that has its own.
  bare?: boolean;
}) => {
  const t = useT();
  const [target, setTarget] = useState<ConnectTarget>('claude');
  const [activeClient, setActiveClient] = useState<McpClient>('Claude Code');
  const [revealed, setRevealed] = useState(false);

  // Chat apps cannot send an Authorization header, so the key travels in the URL.
  const connectorUrl = `${mcpBase}/mcp/${apiKey}`;
  const { config, hint } = getMcpConfig(activeClient, mcpBase, apiKey);

  // Agent sandboxes allowlist outbound hosts, so both directions fail until
  // the host is added (Claude's step 4 below). Uploading a
  // local file goes to us; reading a photo or video back comes from wherever
  // media is stored, which is a different host when that is object storage.
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  const allowlistHosts = (() => {
    const app = hostOf(mcpBase);
    if (!cloudflareUrl) {
      // Local storage: media is served by the app itself, so one host covers it.
      return [app];
    }

    const media = hostOf(cloudflareUrl);
    // An R2 public bucket sits on a random subdomain and a new bucket gets a
    // new one, so allow the whole provider rather than a name that can change.
    const mediaEntry = media.endsWith('.r2.dev') ? '*.r2.dev' : media;

    return mediaEntry && mediaEntry !== app ? [app, mediaEntry] : [app];
  })();

  const docsHref =
    target === 'claude'
      ? 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp'
      : target === 'chatgpt'
      ? 'https://developers.openai.com/api/docs/guides/developer-mode'
      : 'https://docs.postiz.com/mcp/introduction';

  const securityDetail = t(
    'agent_link_security_full',
    'This link contains your API key. Anyone who has it can read and publish to your channels. Only paste it into your own Claude or ChatGPT settings, never into a shared chat or document. If it leaks, rotate your API key in Settings and add the connector again.'
  );

  const linkBlock = (
    <ConnectorLinkBlock
      connectorUrl={connectorUrl}
      apiKey={apiKey}
      revealed={revealed}
      onToggleReveal={() => setRevealed(!revealed)}
    />
  );

  const content = (
    <div className="flex flex-col gap-[20px]">
      <ConnectTabs
        value={target}
        onChange={setTarget}
        options={[
          { value: 'claude', label: t('agent_tab_claude', 'Claude') },
          { value: 'chatgpt', label: t('agent_tab_chatgpt', 'ChatGPT') },
          {
            value: 'developer',
            label: t('developer_tools', 'Developer tools'),
          },
        ]}
      />

      {target === 'claude' && (
        <>
          {linkBlock}
          <ol className="flex flex-col gap-[16px]">
            <ShortStep index={1}>
              <div>
                {t('agent_claude_step_open', 'Open')}{' '}
                <PathChip>
                  {t(
                    'agent_claude_path',
                    'Settings › Connectors › Add custom connector'
                  )}
                </PathChip>
              </div>
              <SubLine>
                {t('agent_claude_in_cowork', 'In Cowork:')}{' '}
                <PathChip>
                  {t('agent_claude_cowork_path', 'Customize › Connectors › +')}
                </PathChip>
              </SubLine>
            </ShortStep>
            <ShortStep index={2}>
              <div>
                {t('agent_claude_step_fill', 'Fill in these two fields, then click Add')}
              </div>
              <FieldsCard
                rows={[
                  {
                    label: t('agent_field_name', 'Name'),
                    value: CONNECTOR_NAME,
                    copyText: CONNECTOR_NAME,
                  },
                  {
                    label: t('agent_field_url', 'URL'),
                    value: t('agent_paste_link', 'Paste the link you copied'),
                    hint: true,
                  },
                ]}
              />
            </ShortStep>
            <ShortStep index={3}>
              <div>
                {t('agent_claude_step_turn_on', 'In a chat, switch it on:')}{' '}
                <PathChip>
                  {t(
                    'agent_claude_chat_path',
                    '+ › Connectors › Voholabs Studio'
                  )}
                </PathChip>
              </div>
            </ShortStep>
            <ShortStep index={4}>
              <div className="font-[600]">
                {t(
                  'agent_claude_step_allowlist',
                  "Allow Studio's file domains"
                )}
              </div>
              <div>
                {t('agent_claude_allowlist_in', 'In Claude:')}{' '}
                <PathChip>
                  {t(
                    'agent_claude_allowlist_path',
                    'Settings › Capabilities › Domain allowlist'
                  )}
                </PathChip>
                {allowlistHosts.length > 1
                  ? t('agent_claude_allowlist_add_both', ', add both:')
                  : t('agent_claude_allowlist_add_one', ', add:')}
              </div>
              <div className="flex items-start gap-[8px]">
                <div className="flex-1 min-w-0">
                  <CodeBlock>{allowlistHosts.join('\n')}</CodeBlock>
                </div>
                <CopyIconButton
                  text={allowlistHosts.join('\n')}
                  label={
                    allowlistHosts.length > 1
                      ? t('copy_domains', 'Copy domains')
                      : t('copy_domain', 'Copy domain')
                  }
                />
              </div>
              <SubLine>
                {t(
                  'agent_claude_allowlist_why',
                  "Without this, Claude can't send or open your images and videos."
                )}
              </SubLine>
            </ShortStep>
          </ol>
          <TryItBox />
          <MoreHelp title={t('agent_more_help', 'More help')}>
            <div>
              {t(
                'claude_connector_intro',
                'Connectors live in your Claude account, so adding this once turns it on everywhere you use Claude — Cowork, the desktop app, claude.ai and mobile.'
              )}
            </div>
            <div>
              {t(
                'leave_advanced_settings_empty',
                'Leave "Advanced settings" (OAuth Client ID and Secret) empty — the link already signs you in. Click Add, and Claude will connect straight away.'
              )}
            </div>
            <div>{securityDetail}</div>
            <HelpLink
              href={docsHref}
              label={t('agent_claude_docs', 'Claude help: custom connectors')}
            />
          </MoreHelp>
        </>
      )}

      {target === 'chatgpt' && (
        <>
          {linkBlock}
          <ol className="flex flex-col gap-[16px]">
            <ShortStep index={1}>
              <div>
                {t('agent_chatgpt_step_dev_mode', 'Turn on developer mode:')}{' '}
                <PathChip>
                  {t(
                    'agent_chatgpt_dev_mode_path',
                    'Settings › Security and login › Developer mode'
                  )}
                </PathChip>
              </div>
              <SubLine>
                {t(
                  'agent_chatgpt_web_only',
                  'On the web only, on Plus, Pro, Business, Enterprise or Edu.'
                )}
              </SubLine>
            </ShortStep>
            <ShortStep index={2}>
              <div>
                {t('agent_chatgpt_step_open', 'Open')}{' '}
                <PathChip>{t('agent_chatgpt_plugins_path', 'Plugins › +')}</PathChip>{' '}
                {t('agent_chatgpt_step_open_end', 'and add a remote MCP server')}
              </div>
            </ShortStep>
            <ShortStep index={3}>
              <div>
                {t('agent_chatgpt_step_fill', 'Fill in these fields, then save')}
              </div>
              <FieldsCard
                rows={[
                  {
                    label: t('agent_field_name', 'Name'),
                    value: CONNECTOR_NAME,
                    copyText: CONNECTOR_NAME,
                  },
                  {
                    label: t('agent_field_mcp_url', 'MCP Server URL'),
                    value: t('agent_paste_link', 'Paste the link you copied'),
                    hint: true,
                  },
                  {
                    label: t('agent_field_auth', 'Authentication'),
                    value: t('no_authentication', 'No authentication'),
                  },
                ]}
              />
            </ShortStep>
          </ol>
          <TryItBox />
          <MoreHelp title={t('agent_more_help', 'More help')}>
            <div>
              {t(
                'chatgpt_connector_intro',
                'ChatGPT needs developer mode to add a connector of your own. It is on Plus, Pro, Business, Enterprise and Edu, and only on the web — the phone apps cannot add one.'
              )}
            </div>
            <div>
              {t(
                'agent_chatgpt_admin_note',
                'On a work plan the Developer mode switch only appears once an admin has allowed it, so ask yours if it is missing.'
              )}
            </div>
            <div>
              {t(
                'no_authentication_is_correct',
                '"No authentication" is the right choice here, even though it sounds wrong: your link already carries the key that signs you in, and ChatGPT has no field to put one in separately. Treat the link like a password — anyone holding it can post as you.'
              )}
            </div>
            <div>
              {t(
                'chatgpt_ready_after_saving',
                'Save it and you are done. Start a chat and ask it to list your channels or schedule a post — there is nothing else to switch on.'
              )}
            </div>
            <div>{securityDetail}</div>
            <HelpLink
              href={docsHref}
              label={t('agent_chatgpt_docs', 'ChatGPT help: developer mode')}
            />
          </MoreHelp>
          {/*
            Creating the connector is the last thing anyone has to do: it is
            usable straight away, with no per-chat step and nothing to
            allowlist. Claude needs hosts permitted because it runs tools in a
            sandbox; ChatGPT reaches us from its own infrastructure, so there
            is no images section here.
          */}
        </>
      )}

      {target === 'developer' && (
        <>
          <div className="text-[13px] text-textItemBlur leading-[1.7]">
            {t(
              'developer_tools_intro',
              'These clients send your key in an Authorization header, so it stays out of the URL. Pick your client and paste the config.'
            )}
          </div>
          <Tabs<McpClient>
            value={activeClient}
            onChange={setActiveClient}
            options={mcpClients.map((client) => ({
              value: client,
              label: client,
            }))}
          />
          <div className="flex flex-col gap-[8px]">
            <div className="text-[12px] text-textItemBlur font-[500]">
              {hint}
            </div>
            <CodeBlock>{revealed ? config : maskKey(config, apiKey)}</CodeBlock>
            <div className="flex gap-[8px] flex-wrap">
              <CopyButton
                text={config}
                label={t('copy', 'Copy')}
                primary={true}
              />
              <RevealButton
                revealed={revealed}
                onClick={() => setRevealed(!revealed)}
              />
              <CopyButton
                text={`${mcpBase}/mcp`}
                label={t('copy_url', 'Copy URL')}
              />
            </div>
          </div>
          <HelpLink
            href={docsHref}
            label={t('agent_mcp_docs', 'MCP documentation')}
          />
        </>
      )}
    </div>
  );

  if (bare) {
    return content;
  }

  return (
    <SectionCard
      title={t('connect_an_ai_agent', 'Connect an AI agent')}
      description={t(
        'connect_an_ai_agent_description',
        'Let Claude, ChatGPT or your coding agent write and schedule posts for you. No installation needed.'
      )}
      actions={<DocsLink href={docsHref} label={t('read_the_docs', 'Docs')} />}
    >
      {content}
    </SectionCard>
  );
};

const localCliSteps = [
  {
    label: 'Install the CLI',
    code: 'npm install -g github:voholabs/voholabs-studio-cli',
  },
  {
    label: 'Run: voholabs auth:login',
    code: 'voholabs auth:login',
  },
  {
    label: 'Install the Voholabs skill for your AI agent',
    code: 'npx skills add voholabs/voholabs-studio-cli',
  },
] as const;

const ciCliSteps = [
  {
    label: 'Install the CLI',
    code: 'npm install -g github:voholabs/voholabs-studio-cli',
  },
  {
    label: 'Set your API key as an environment variable',
    code: 'export VOHOLABS_API_KEY="{API_KEY}"',
  },
  {
    label: 'Install the Voholabs skill for your AI agent',
    code: 'npx skills add voholabs/voholabs-studio-cli',
  },
] as const;

const CliSection = ({ apiKey }: { apiKey: string }) => {
  const t = useT();
  const [mode, setMode] = useState<'local' | 'ci'>('local');
  const [revealed, setRevealed] = useState(false);

  const steps =
    mode === 'local'
      ? localCliSteps.map((step) => ({ ...step }))
      : ciCliSteps.map((step) => ({
          ...step,
          code: step.code.replace('{API_KEY}', apiKey),
        }));

  const displaySteps =
    mode === 'ci' && !revealed
      ? steps.map((step) => ({ ...step, code: maskKey(step.code, apiKey) }))
      : steps;

  return (
    <SectionCard
      title={t('cli_and_skills', 'CLI & AI Skills')}
      description={t(
        'cli_description',
        'Use the Voholabs CLI to automate posting from your terminal, or install the skill to let your AI agent schedule posts for you.'
      )}
      actions={
        <DocsLink
          href="https://docs.postiz.com/cli/introduction"
          label={t('read_the_docs', 'Docs')}
        />
      }
    >
      <Tabs<'local' | 'ci'>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'local', label: t('locally', 'Locally') },
          { value: 'ci', label: t('ci_remote_servers', 'CI / Remote servers') },
        ]}
      />
      {displaySteps.map((step, i) => (
        <div key={i} className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600] text-customColor18">
            {i + 1}. {step.label}
          </div>
          <CodeBlock>{step.code}</CodeBlock>
        </div>
      ))}
      <div className="flex gap-[8px]">
        {mode === 'ci' && (
          <RevealButton
            revealed={revealed}
            onClick={() => setRevealed(!revealed)}
          />
        )}
        <CopyButton
          text={steps.map((s) => s.code).join(' && ')}
          label={t('copy_all', 'Copy All')}
        />
      </div>
    </SectionCard>
  );
};

const PublicApiContent = () => {
  const user = useUser();
  const { backendUrl, frontEndUrl, mcpUrl, cloudflareUrl } = useVariables();
  const toaster = useToaster();
  const fetch = useFetch();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const [reveal, setReveal] = useState(false);
  const t = useT();

  const rotateKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_api_key', 'Rotate API Key?'),
      description: t(
        'rotate_api_key_description',
        'This will generate a new API key and invalidate the current one. Any integrations using the old key will stop working — including agents you connected with a connector link.'
      ),
      approveLabel: t('rotate', 'Rotate'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) return;
    await fetch('/user/api-key/rotate', { method: 'POST' });
    await mutate('/user/self');
    setReveal(false);
    toaster.show(
      t('api_key_rotated', 'API Key rotated successfully'),
      'success'
    );
  }, [decision, fetch, mutate, toaster]);

  if (!user || !user.publicApi) {
    return null;
  }

  const mcpBase = mcpUrl || backendUrl;

  return (
    <div className="flex flex-col gap-[40px]">
      <ConnectSection
        apiKey={user.publicApi}
        mcpBase={mcpBase}
        cloudflareUrl={cloudflareUrl}
      />

      <SectionCard
        title={t('api_key', 'API Key')}
        description={t(
          'use_postiz_api_to_integrate_with_your_tools',
          'The same key powers your connectors, the CLI and the API. Keep it private.'
        )}
        actions={
          <>
            <DocsLink
              href="https://docs.postiz.com/public-api"
              label={t('read_the_docs', 'Docs')}
            />
            <DocsLink
              href="https://www.npmjs.com/package/n8n-nodes-postiz"
              label={t('n8n_node', 'N8N Node')}
            />
          </>
        }
      >
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] px-[16px] h-[44px] flex items-center overflow-hidden">
          <code className="text-[14px] flex-1 truncate">
            {reveal ? (
              user.publicApi
            ) : (
              <span className="flex items-center">
                <span className="blur-sm select-none">
                  {user.publicApi.slice(0, -5)}
                </span>
                <span>{user.publicApi.slice(-5)}</span>
              </span>
            )}
          </code>
        </div>
        <div className="flex gap-[8px] flex-wrap">
          <RevealButton revealed={reveal} onClick={() => setReveal(!reveal)} />
          <CopyButton text={user.publicApi} label={t('copy', 'Copy')} />
          <button
            type="button"
            onClick={rotateKey}
            className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6" />
              <path d="M21.34 15.57a10 10 0 11-.57-8.38L21.5 8" />
            </svg>
            {t('rotate_key', 'Rotate Key')}
          </button>
          <button
            type="button"
            data-tooltip-id="tooltip"
            data-tooltip-content={t(
              'payload_wizard_description',
              'Building a POST request to /posts can be complex. Use the wizard to schedule a post with the UI, then copy the generated payload.'
            )}
            onClick={() => window.open(`${frontEndUrl}/modal/dark/all`, '_blank')}
            className="cursor-pointer px-[16px] h-[36px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {t('open_wizard', 'Open Wizard')}
          </button>
        </div>
      </SectionCard>

      <CliSection apiKey={user.publicApi} />

      <div className="text-[13px] text-customColor18 leading-[1.7]">
        {t(
          'api_auth_note_line2',
          'Building a product that schedules posts on behalf of other Voholabs users? Create an OAuth App under the "Apps" tab — your users authorize it with OAuth2 and you receive a pos_ prefixed token that works with the API, MCP and CLI, just like an API Key.'
        )}
      </div>
    </div>
  );
};

// The "Connect an AI agent" panel on its own, for the onboarding step.
// Nothing shows without an API key. `bare` drops the card and its heading.
export const ConnectAgentPanel: FC<{ bare?: boolean }> = ({ bare }) => {
  const user = useUser();
  const { backendUrl, mcpUrl, cloudflareUrl } = useVariables();
  if (!user?.publicApi) {
    return null;
  }
  return (
    <ConnectSection
      apiKey={user.publicApi}
      mcpBase={mcpUrl || backendUrl}
      cloudflareUrl={cloudflareUrl}
      bare={bare}
    />
  );
};

// A paid plan keeps the panel it always had; every other plan gets the new
// connect-agent panel, the same one onboarding shows.
export const PublicComponent = () =>
  useWalletAccess() === 'plan' ? (
    <LegacyPublicComponent />
  ) : (
    <WalletPublicComponent />
  );

const WalletPublicComponent = () => {
  const t = useT();
  const [subTab, setSubTab] = useState<'api' | 'developer'>('api');

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex gap-[6px]">
        {(['api', 'developer'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              'cursor-pointer px-[20px] h-[44px] text-[15px] font-[600] rounded-[8px] transition-colors',
              subTab === tab
                ? 'bg-btnPrimary text-white'
                : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
            )}
            onClick={() => setSubTab(tab)}
          >
            {tab === 'api' ? t('connect', 'Connect') : t('apps', 'Apps')}
          </button>
        ))}
      </div>
      {subTab === 'api' && <PublicApiContent />}
      {subTab === 'developer' && <DeveloperComponent />}
    </div>
  );
};
