'use client';

// The Settings "Public API" panel exactly as it was before the wallet, for
// paid plans (see PublicComponent in public.component.tsx). Kept as is on
// purpose: change the new panel, not this one.

import { useState, useCallback, FC, ReactNode } from 'react';
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
          ? 'bg-[#20808D] hover:bg-[#5520CB] text-white'
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
        <div className="text-[13px] text-customColor18 mt-[2px]">
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
    className="cursor-pointer px-[16px] h-[36px] bg-[#20808D] hover:bg-[#5520CB] text-white transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
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
            ? 'bg-[#20808D] text-white'
            : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
        )}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Step: FC<{ index: number; title: string; children?: ReactNode }> = ({
  index,
  title,
  children,
}) => (
  <div className="flex gap-[12px]">
    <div className="shrink-0 w-[24px] h-[24px] rounded-full bg-[#20808D] text-white text-[12px] font-[600] flex items-center justify-center">
      {index}
    </div>
    <div className="flex flex-col gap-[8px] flex-1 min-w-0">
      <div className="text-[14px] font-[600] leading-[24px]">{title}</div>
      {children}
    </div>
  </div>
);

const StepText: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-[13px] text-customColor18 leading-[1.7]">{children}</div>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-[8px] text-[13px] leading-[1.7]">
    <span className="text-customColor18 shrink-0">{label}</span>
    <span className="font-[600] break-all">{value}</span>
  </div>
);

type ConnectTarget = 'claude' | 'chatgpt' | 'developer';

const CONNECTOR_NAME = 'Voholabs Studio';

const ConnectSection = ({
  apiKey,
  mcpBase,
  cloudflareUrl,
}: {
  apiKey: string;
  mcpBase: string;
  cloudflareUrl: string;
}) => {
  const t = useT();
  const [target, setTarget] = useState<ConnectTarget>('claude');
  const [activeClient, setActiveClient] = useState<McpClient>('Claude Code');
  const [revealed, setRevealed] = useState(false);

  // Chat apps cannot send an Authorization header, so the key travels in the URL.
  const connectorUrl = `${mcpBase}/mcp/${apiKey}`;
  const { config, hint } = getMcpConfig(activeClient, mcpBase, apiKey);

  // Agent sandboxes allowlist outbound hosts, so both directions fail until
  // the host is added — see the "allow the domains" step below. Uploading a
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

  // Uploading a local file is the one flow where the assistant itself has to
  // reach us over the network, and both Claude and ChatGPT block that until the
  // domain is permitted — so it gets its own step rather than a footnote.
  const allowlistStep = (index: number, detail: string, hint: string) => (
    <Step
      index={index}
      title={
        allowlistHosts.length > 1
          ? t(
              'to_send_and_read_files_allow_the_domains',
              'To send and read back files, allow these domains'
            )
          : t(
              'allow_uploads_from_your_computer',
              'To post files from your computer, allow the domain'
            )
      }
    >
      <StepText>{detail}</StepText>
      <CodeBlock>{allowlistHosts.join('\n')}</CodeBlock>
      <div className="flex gap-[8px] flex-wrap">
        <CopyButton
          text={allowlistHosts.join('\n')}
          label={
            allowlistHosts.length > 1
              ? t('copy_domains', 'Copy domains')
              : t('copy_domain', 'Copy domain')
          }
        />
      </div>
      {allowlistHosts.length > 1 && (
        <StepText>
          {t(
            'allowlist_two_domains_why',
            'Both are needed and they do different jobs: the first is Voholabs Studio itself, which is where a file you upload goes. The second is where your photos and videos are kept, and it is the one that lets the assistant open an image or video already in your library — to look at it, or to attach it to a post it is drafting. Allow only the first and uploads work while your existing media stays unreadable.'
          )}
        </StepText>
      )}
      <StepText>{hint}</StepText>
    </Step>
  );

  const linkStep = (index: number) => (
    <Step
      index={index}
      title={t('copy_your_connector_link', 'Copy your private connector link')}
    >
      <CodeBlock>
        {revealed ? connectorUrl : maskKey(connectorUrl, apiKey)}
      </CodeBlock>
      <div className="flex gap-[8px] flex-wrap">
        <CopyButton
          text={connectorUrl}
          label={t('copy_link', 'Copy link')}
          primary={true}
        />
        <RevealButton
          revealed={revealed}
          onClick={() => setRevealed(!revealed)}
        />
      </div>
    </Step>
  );

  return (
    <SectionCard
      title={t('connect_an_ai_agent', 'Connect an AI agent')}
      description={t(
        'connect_an_ai_agent_description',
        'Let Claude, ChatGPT or your coding agent write and schedule posts for you. No installation needed.'
      )}
      actions={<DocsLink href={docsHref} label={t('read_the_docs', 'Docs')} />}
    >
      <Tabs<ConnectTarget>
        value={target}
        onChange={setTarget}
        options={[
          {
            value: 'claude',
            label: t('claude_cowork', 'Claude (Cowork)'),
          },
          { value: 'chatgpt', label: t('chatgpt_work', 'ChatGPT (Work)') },
          {
            value: 'developer',
            label: t('developer_tools', 'Developer tools'),
          },
        ]}
      />

      {target === 'claude' && (
        <div className="flex flex-col gap-[20px]">
          <StepText>
            {t(
              'claude_connector_intro',
              'Connectors live in your Claude account, so adding this once turns it on everywhere you use Claude — Cowork, the desktop app, claude.ai and mobile.'
            )}
          </StepText>
          {linkStep(1)}
          <Step
            index={2}
            title={t('open_claude_connectors', 'Open the connector settings')}
          >
            <StepText>
              {t(
                'open_claude_connectors_detail',
                'In Cowork: click Customize at the top right, then Connectors, then the + button. In the Claude desktop app or on claude.ai: Settings → Connectors → Add custom connector.'
              )}
            </StepText>
          </Step>
          <Step
            index={3}
            title={t('fill_in_two_fields', 'Fill in the two fields')}
          >
            <Field label={t('name_label', 'Name:')} value={CONNECTOR_NAME} />
            <Field
              label={t('url_label', 'URL:')}
              value={t('paste_the_link_you_copied', 'paste the link you copied')}
            />
            <StepText>
              {t(
                'leave_advanced_settings_empty',
                'Leave "Advanced settings" (OAuth Client ID and Secret) empty — the link already signs you in. Click Add, and Claude will connect straight away.'
              )}
            </StepText>
          </Step>
          <Step
            index={4}
            title={t('turn_it_on_in_your_chat', 'Turn it on in your chat')}
          >
            <StepText>
              {t(
                'turn_it_on_in_your_chat_detail',
                'Open the + button next to the message box, choose Connectors, and switch on Voholabs Studio.'
              )}
            </StepText>
          </Step>
          <Step index={5} title={t('ask_it_to_post', 'Ask it to post')}>
            <StepText>
              {t(
                'ask_it_to_post_detail',
                'Try: "List my Voholabs Studio channels, then schedule a post for tomorrow at 9am about our new feature."'
              )}
            </StepText>
          </Step>
          {allowlistStep(
            6,
            t(
              'allow_uploads_from_your_computer_detail',
              'Claude blocks its own outgoing connections by default, so sending it a photo or video — and opening one already in your library — fails until you allow these. In Claude: Settings → Capabilities → domain allowlist → add both:'
            ),
            t(
              'allow_uploads_from_your_computer_hint',
              'Skip this if you only post text, or images Claude generates or finds online. If Claude ever says it cannot reach Voholabs Studio, cannot open one of your own images or videos, or offers to put your file on another website first, this is the setting to change.'
            )
          )}
        </div>
      )}

      {target === 'chatgpt' && (
        <div className="flex flex-col gap-[20px]">
          <StepText>
            {t(
              'chatgpt_connector_intro',
              'ChatGPT needs developer mode to add a connector of your own. It is on Plus, Pro, Business, Enterprise and Edu, and only on the web — the phone apps cannot add one.'
            )}
          </StepText>
          {linkStep(1)}
          <Step
            index={2}
            title={t('turn_on_developer_mode', 'Turn on developer mode')}
          >
            <StepText>
              {t(
                'turn_on_developer_mode_detail',
                'On the web: Settings → Security and login → switch on Developer mode. On a work plan the switch only appears once an admin has allowed it, so ask yours if it is missing.'
              )}
            </StepText>
          </Step>
          <Step
            index={3}
            title={t('create_the_connector', 'Create the connector')}
          >
            <StepText>
              {t(
                'create_the_connector_detail',
                'Open Plugins, press the + button, and choose to add a remote MCP server. Then fill in:'
              )}
            </StepText>
            <Field label={t('name_label', 'Name:')} value={CONNECTOR_NAME} />
            <Field
              label={t('mcp_server_url_label', 'MCP Server URL:')}
              value={t('paste_the_link_you_copied', 'paste the link you copied')}
            />
            <Field
              label={t('authentication_label', 'Authentication:')}
              value={t('no_authentication', 'No authentication')}
            />
            <StepText>
              {t(
                'no_authentication_is_correct',
                '"No authentication" is the right choice here, even though it sounds wrong: your link already carries the key that signs you in, and ChatGPT has no field to put one in separately. Treat the link like a password — anyone holding it can post as you.'
              )}
            </StepText>
            <StepText>
              {t(
                'chatgpt_ready_after_saving',
                'Save it and you are done. Start a chat and ask it to list your channels or schedule a post — there is nothing else to switch on.'
              )}
            </StepText>
          </Step>
          {/*
            Creating the connector is the last thing anyone has to do: it is
            usable straight away, with no per-chat step and nothing to
            allowlist. Claude needs hosts permitted because it runs tools in a
            sandbox; ChatGPT reaches us from its own infrastructure, so the
            equivalent step here only sent people looking for settings that do
            not exist.
          */}
        </div>
      )}

      {target === 'developer' && (
        <div className="flex flex-col gap-[16px]">
          <StepText>
            {t(
              'developer_tools_intro',
              'These clients send your key in an Authorization header, so it stays out of the URL. Pick your client and paste the config.'
            )}
          </StepText>
          <div className="flex flex-col gap-[6px]">
            <div className="text-[13px] font-[600] text-customColor18">
              {t('mcp_client', 'Client')}
            </div>
            <Tabs<McpClient>
              value={activeClient}
              onChange={setActiveClient}
              options={mcpClients.map((client) => ({
                value: client,
                label: client,
              }))}
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <div className="text-[12px] text-customColor18 font-[500]">
              {hint}
            </div>
            <CodeBlock>
              {revealed ? config : maskKey(config, apiKey)}
            </CodeBlock>
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
        </div>
      )}

      {target !== 'developer' && (
        <div className="flex gap-[10px] text-[13px] leading-[1.7] bg-newBgColorInner border border-newBorder rounded-[8px] p-[14px]">
          <svg
            className="shrink-0 mt-[3px] text-[#20808D]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <div>
            {t(
              'connector_link_security_note',
              'This link contains your API key — anyone who has it can read and publish to your channels. Only paste it into your own Claude or ChatGPT settings, and never into a shared chat or document. If it leaks, rotate your API key below and add the connector again.'
            )}
          </div>
        </div>
      )}
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

export const LegacyPublicComponent = () => {
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
                ? 'bg-[#20808D] text-white'
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
