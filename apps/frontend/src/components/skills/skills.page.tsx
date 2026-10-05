'use client';

import { useTrackView } from '@gitroom/helpers/utils/use.fire.events';
import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useWalletAccess } from '@gitroom/frontend/components/wallet-locks/wallet.access';
import { LockedFeature } from '@gitroom/frontend/components/wallet-locks/locked.feature';
import {
  findAction,
  useWalletPrices,
} from '@gitroom/frontend/components/wallet/wallet.hooks';
import { tTopUpGift } from '@gitroom/frontend/components/wallet/wallet.text';
import {
  InfoIcon,
  SkillsIcon,
} from '@gitroom/frontend/components/wallet-locks/wallet.icons';
import {
  SkillSummary,
  SkillTag,
  useSkill,
  useSkills,
} from '@gitroom/frontend/components/skills/skills.hooks';
import { HermesMarkdown } from '@gitroom/frontend/components/hermes/hermes.markdown';

type T = ReturnType<typeof useT>;

export const skillsLockedCopy = (t: T) =>
  t(
    'skills_locked',
    'Ready-made skills for hooks, writing in your voice, removing AI slop, and shaping posts for every channel. Skills are available to your agent through MCP.'
  );

// Friendly names for the Studio tools a skill names. A tool not listed here
// shows by its code name only.
const toolLabel = (t: T, tool: string): string | null => {
  switch (tool) {
    case 'briefListTool':
    case 'briefSaveTool':
      return t('skill_tool_brief', 'Brief');
    case 'briefLearnTool':
      return t('skill_tool_brief_experience', 'Brief experience');
    case 'briefHistory':
      return t('skill_tool_brief_changes', 'Brief changes');
    case 'postHistory':
      return t('skill_tool_post_edits', 'Post edits');
    case 'markLearned':
      return t('skill_tool_mark_learned', 'Learning queue');
    case 'postsList':
      return t('skill_tool_posts', 'Your posts');
    case 'editPostTool':
      return t('skill_tool_edit_post', 'Post editing');
    case 'postStatusTool':
      return t('skill_tool_post_status', 'Post status');
    case 'sanityMcpList':
    case 'sanityMcpCall':
      return t('skill_tool_sanity', 'Sanity CMS');
    case 'mediaList':
      return t('skill_tool_media_library', 'Media library');
    case 'integrationSchema':
      return t('skill_tool_channel_rules', 'Channel rules');
    case 'findSlotTool':
      return t('skill_tool_open_slots', 'Open slots');
    case 'integrationSchedulePostTool':
      return t('skill_tool_scheduling', 'Scheduling');
    case 'integrationList':
      return t('skill_tool_channels', 'Channels');
    case 'postAnalyticsTool':
      return t('skill_tool_post_results', 'Post results');
    case 'channelAnalyticsTool':
      return t('skill_tool_channel_results', 'Channel results');
    case 'mediaMcpCall':
      return t('skill_tool_media_generation', 'Media generation');
    case 'uploadFromUrlTool':
    case 'uploadMediaTool':
      return t('skill_tool_media_upload', 'Media upload');
    default:
      return null;
  }
};

const tagLabel = (t: T, tags: SkillTag[], key: string) => {
  const found = tags.find((one) => one.key === key);
  return t(`skill_tag_${key}`, found?.label || key);
};

const TagPill: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center h-[20px] px-[8px] rounded-full text-[11px] font-[600] bg-tealSoft text-tealText">
    {children}
  </span>
);

const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    className="text-textItemBlur shrink-0"
  >
    <path
      d="M14 14L10.5 10.5M12 7.33333C12 9.91066 9.91066 12 7.33333 12C4.75601 12 2.66667 9.91066 2.66667 7.33333C2.66667 4.75601 4.75601 2.66667 7.33333 2.66667C9.91066 2.66667 12 4.75601 12 7.33333Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 4L4 12M4 4l8 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const DetailSection: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div className="flex flex-col gap-[6px]">
    <div className="text-[12px] font-[500] uppercase tracking-[0.08em] text-textItemBlur">
      {title}
    </div>
    {children}
  </div>
);

const SkillDetail: FC<{
  slug: string;
  fallback?: SkillSummary;
  tags: SkillTag[];
  onClose: () => void;
}> = ({ slug, fallback, tags, onClose }) => {
  const t = useT();
  const { data, error } = useSkill(slug);
  const skill = data || fallback;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      className="w-[clamp(300px,30vw,480px)] shrink-0 bg-newBgColorInner border-s border-newTableBorder relative"
      aria-label={skill?.name || slug}
    >
      <div className="absolute inset-0 overflow-y-auto p-[24px] flex flex-col gap-[22px]">
        <div className="flex items-start gap-[12px]">
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-[600] break-words">
              {skill?.name || slug}
            </div>
            {!!skill?.tags.length && (
              <div className="flex gap-[6px] mt-[8px] flex-wrap">
                {skill.tags.map((key) => (
                  <TagPill key={key}>{tagLabel(t, tags, key)}</TagPill>
                ))}
              </div>
            )}
            {typeof skill?.usesBrief === 'boolean' && (
              <div className="text-[12px] text-textItemBlur mt-[8px]">
                {skill.usesBrief
                  ? t(
                      'skills_uses_brief',
                      'Uses your brief. The more of it you fill in, the better it works.'
                    )
                  : t(
                      'skills_standalone',
                      'Works on its own. No brief needed.'
                    )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', 'Close')}
            className="w-[28px] h-[28px] shrink-0 flex items-center justify-center rounded-[6px] text-textItemBlur hover:text-newTextColor hover:bg-newBgLineColor"
          >
            <CloseIcon />
          </button>
        </div>
        {!data && !error ? (
          <div className="text-[14px] text-textItemBlur">
            {t('skills_loading', 'Loading...')}
          </div>
        ) : !data ? (
          <div className="text-[14px] text-textItemBlur">
            {t(
              'skills_detail_error',
              'Could not load this skill. Try again shortly.'
            )}
          </div>
        ) : (
          <>
            {!!(data.whatItDoes || data.summary) && (
              <DetailSection title={t('skills_what_it_does', 'What it does')}>
                <div className="text-[14px] leading-[1.6] whitespace-pre-line">
                  {data.whatItDoes || data.summary}
                </div>
              </DetailSection>
            )}
            {!!data.whenToUse && (
              <DetailSection
                title={t('skills_when_to_use', 'When your agent uses it')}
              >
                <div className="text-[14px] leading-[1.6] text-newTextColor/85 whitespace-pre-line">
                  {data.whenToUse}
                </div>
              </DetailSection>
            )}
            {!!data.tools.length && (
              <DetailSection
                title={t('skills_studio_tools', 'What it uses in Studio')}
              >
                <div className="flex flex-col gap-[6px]">
                  {data.tools.map((tool) => {
                    const label = toolLabel(t, tool);
                    return (
                      <div
                        key={tool}
                        className="flex items-center gap-[10px] min-h-[40px] px-[12px] rounded-[8px] bg-newTableHeader text-[14px]"
                      >
                        <span className="flex-1 min-w-0">{label || ''}</span>
                        <code className="text-[12px] text-textItemBlur font-mono break-all">
                          {tool}
                        </code>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[12px] text-textItemBlur">
                  {t(
                    'skills_studio_tools_note',
                    'The skill tells your agent to use these Studio routes, not outside tools.'
                  )}
                </div>
              </DetailSection>
            )}
            {!!data.body.trim() && (
              <DetailSection title={t('skills_the_skill', 'The skill')}>
                <div className="text-[12px] text-textItemBlur">
                  {t(
                    'skills_the_skill_note',
                    'What your agent reads and follows, word for word.'
                  )}
                </div>
                <div
                  dir="auto"
                  className="rounded-[8px] border border-newTableBorder bg-newBgColor p-[16px] text-[14px] leading-[1.6] break-words"
                >
                  <HermesMarkdown text={data.body} />
                </div>
              </DetailSection>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

const SkillsLibrary: FC = () => {
  const t = useT();
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Search on the server once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, error, isLoading } = useSkills(tag, search);
  const tags = useMemo(() => data?.tags || [], [data]);
  const skills = data?.skills || [];

  // A tag that no active skill uses any more drops back to All.
  useEffect(() => {
    if (tag && data && !data.tags.some((one) => one.key === tag)) {
      setTag('');
    }
  }, [tag, data]);

  const more = t(
    'skills_intro_more',
    'Your agent finds skills through MCP and picks the right one for each task. Every skill tells it which Studio tools to use.'
  );

  if (isLoading && !data) {
    return <LoadingComponent />;
  }

  const chips = [
    { key: '', label: t('skills_all', 'All') },
    ...tags.map((one) => ({ key: one.key, label: tagLabel(t, tags, one.key) })),
  ];

  return (
    <>
      <div className="bg-newBgColorInner flex-1 relative min-w-0">
        <div className="absolute inset-0 overflow-y-auto p-[20px] flex flex-col gap-[16px]">
          <div className="inline-flex items-center gap-[6px] text-[14px] text-textItemBlur">
            <span>
              {t(
                'skills_intro',
                'Ready-made skills your agent can use. Using them is free.'
              )}
            </span>
            <span
              tabIndex={0}
              role="img"
              aria-label={more}
              data-tooltip-id="tooltip"
              data-tooltip-content={more}
              data-tooltip-class-name="!max-w-[280px] !whitespace-normal !leading-[1.5]"
              className="shrink-0 cursor-help text-textItemBlur hover:text-newTextColor"
            >
              <InfoIcon />
            </span>
          </div>
          <div className="flex items-center gap-[12px] flex-wrap">
            <div
              className="flex items-center gap-[6px] flex-wrap flex-1 min-w-[260px]"
              role="tablist"
              aria-label={t('skills_filter', 'Filter skills')}
            >
              {chips.map((chip) => {
                const active = tag === chip.key;
                return (
                  <button
                    key={chip.key || 'all'}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTag(chip.key)}
                    className={`h-[32px] px-[12px] rounded-[8px] text-[13px] font-[500] transition-colors border ${
                      active
                        ? 'bg-tealSoft text-tealText border-tealText'
                        : 'border-newTableBorder text-textItemBlur hover:text-newTextColor hover:border-tealText'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-[8px] h-[38px] w-full max-w-[320px] min-w-[200px] flex-1 px-[12px] rounded-[8px] border border-newTableBorder focus-within:border-tealText transition-colors">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('skills_search', 'Search skills...')}
                aria-label={t('skills_search_label', 'Search skills')}
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-textItemBlur"
              />
            </div>
          </div>
          {error && !data ? (
            <div className="text-[14px] text-textItemBlur py-[40px] text-center">
              {t(
                'skills_error',
                'Could not load the skills library. Try again shortly.'
              )}
            </div>
          ) : !skills.length ? (
            <div className="text-[14px] text-textItemBlur py-[40px] text-center">
              {tag || search
                ? t('skills_no_match', 'No skills match.')
                : t('skills_empty', 'No skills yet.')}
            </div>
          ) : (
            <div
              className="grid gap-[12px]"
              style={{
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              }}
            >
              {skills.map((skill) => {
                const selected = open === skill.slug;
                return (
                  <button
                    key={skill.slug}
                    type="button"
                    onClick={() => setOpen(selected ? null : skill.slug)}
                    aria-pressed={selected}
                    className={`rounded-[12px] border text-start p-[18px] flex flex-col gap-[10px] transition-colors hover:border-tealText hover:bg-tealSoft ${
                      selected
                        ? 'border-tealText bg-tealSoft'
                        : 'border-newTableBorder'
                    }`}
                  >
                    <div className="text-[15px] font-[600]">{skill.name}</div>
                    <div className="text-[13px] text-textItemBlur leading-[1.45] line-clamp-1">
                      {skill.summary}
                    </div>
                    {!!skill.tags.length && (
                      <div className="flex items-center gap-[6px] flex-wrap">
                        {skill.tags.map((key) => (
                          <TagPill key={key}>{tagLabel(t, tags, key)}</TagPill>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {!!open && (
        <SkillDetail
          key={open}
          slug={open}
          fallback={skills.find((one) => one.slug === open)}
          tags={tags}
          onClose={close}
        />
      )}
    </>
  );
};

// Free plan, nothing topped up: the same layout as the locked brief. What the
// top-up gives for free comes from the skills.library price row.
const LockedSkills: FC = () => {
  const t = useT();
  const { data: prices } = useWalletPrices();
  const library = findAction(prices, 'skills.library');
  return (
    <LockedFeature
      icon={<SkillsIcon size={28} />}
      eyebrow={t('skills', 'Skills')}
      title={t(
        'skills_locked_title',
        'Skills make posting easy: your agent already knows how'
      )}
      body={t(
        'skills_locked_body',
        'Ready-made skills teach your agent how to write, make media and schedule for each channel. It finds them through MCP and picks the right one for each task.'
      )}
      bullets={[
        t(
          'skills_locked_bullet_1',
          'Ask for a post in plain words. The skill handles the format for each channel.'
        ),
        t(
          'skills_locked_bullet_2',
          'Hooks, writing in your voice, removing AI slop, and posts shaped for every channel.'
        ),
        t(
          'skills_locked_bullet_3',
          'Works with Claude, ChatGPT or any agent connected through MCP.'
        ),
      ]}
      gift={prices ? tTopUpGift(t, library) : undefined}
      cta={t('skills_locked_cta', 'Top up to unlock skills')}
    />
  );
};

export const SkillsPage: FC = () => {
  const access = useWalletAccess();
  useTrackView('skills_viewed');

  if (!access) {
    return <LoadingComponent />;
  }
  if (access === 'free') {
    return <LockedSkills />;
  }
  return <SkillsLibrary />;
};
