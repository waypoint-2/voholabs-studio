'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useSWRConfig } from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  openTopUpIfWalletRefused,
  WALLET_INLINE_REQUEST,
} from '@gitroom/frontend/components/wallet/wallet.bridge';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useHermesSettings } from '@gitroom/frontend/components/hermes/use.hermes.settings';
import {
  HermesAttachment,
  useHermesChat,
} from '@gitroom/frontend/components/hermes/use.hermes.chat';
import { HermesSettings } from '@gitroom/frontend/components/hermes/hermes.settings';
import { HermesWaiting } from '@gitroom/frontend/components/hermes/hermes.waiting';
import { HermesMarkdown } from '@gitroom/frontend/components/hermes/hermes.markdown';
import {
  HERMES_CONVERSATIONS_KEY,
  useHermesConversations,
} from '@gitroom/frontend/components/hermes/use.hermes.conversations';

dayjs.extend(relativeTime);

const AGENT_NAME = 'APEX';
const MAX_ATTACHMENTS = 6;
// Matches what the upload pipeline accepts: images are inlined so they stay
// small, video is uploaded and passed by link.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
// Anything the agent can read as plain text is folded into the message body.
const TEXTUAL =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|scss|js|jsx|ts|tsx|py|rb|go|rs|java|kt|c|h|cpp|sh|sql|env|ini|toml|log)$/i;

const VoholabsMark = ({ size = 26 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 340 330"
    fill="none"
    role="img"
    aria-label="APEX"
  >
    <rect width="340" height="330" rx="58" fill="#091717" />
    <rect
      x="33"
      y="77.876"
      width="76.4141"
      height="255.191"
      rx="38.2071"
      transform="rotate(-29.714 33 77.876)"
      fill="#FAF9F5"
    />
    <circle cx="251.43" cy="97.751" r="45" fill="#20808D" />
  </svg>
);

const BriefMark = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 4.5a3 3 0 0 0-5.6-1.5A2.8 2.8 0 0 0 4 6.1a3 3 0 0 0-1 5A3 3 0 0 0 4.4 16a2.9 2.9 0 0 0 3 3.6A2.9 2.9 0 0 0 12 20.5z" />
    <path d="M12 4.5a3 3 0 0 1 5.6-1.5A2.8 2.8 0 0 1 20 6.1a3 3 0 0 1 1 5A3 3 0 0 1 19.6 16a2.9 2.9 0 0 1-3 3.6A2.9 2.9 0 0 1 12 20.5z" />
    <path d="M12 4.5v16" />
  </svg>
);

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const PLUS = 'M8 3.33V12.67M3.33 8H12.67';
const CLIP =
  'M10.9 4.2 5.6 9.5a1.7 1.7 0 0 0 2.4 2.4l5.3-5.3a3.3 3.3 0 0 0-4.7-4.7L3.3 7.2a5 5 0 0 0 7 7l4.4-4.4';
const CLOSE = 'M12 4L4 12M4 4L12 12';
const ARROW_UP = 'M8 13V3M3.5 7.5L8 3l4.5 4.5';
const COPY =
  'M10.7 5.9H7.1c-.7 0-1.2.5-1.2 1.2v6.2c0 .7.5 1.2 1.2 1.2h6.2c.7 0 1.2-.5 1.2-1.2V9.7M10.7 5.9V2.9c0-.7-.5-1.2-1.2-1.2H2.7c-.7 0-1.2.5-1.2 1.2v6.8c0 .7.5 1.2 1.2 1.2h3.2';
const TICK = 'M13.3 4L6 11.3 2.7 8';

export const HermesChat = () => {
  const t = useT();
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const { openModal, closeAll } = useModals();
  const { data: settings, isLoading } = useHermesSettings();
  const { data: conversations } = useHermesConversations();
  const { messages, setMessages, streaming, error, send, stop, reset } =
    useHermesChat();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<HermesAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Following the stream is only helpful if the reader is at the bottom;
  // yanking them back while they scroll up to re-read is not.
  useEffect(() => {
    if (atBottom) {
      bottom.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, atBottom]);

  // Saved once the answer is complete, so a half-streamed reply is never stored.
  const persisted = useRef('');
  // Bumped whenever the user switches away to another chat or starts a fresh
  // one. A save that was already in flight must not write its id back onto the
  // conversation that replaced it.
  const session = useRef(0);
  // The save can be triggered from a click handler that is about to clear the
  // messages, so it reads them from a ref rather than from the closure it was
  // created in.
  const latest = useRef({ messages, conversationId });
  latest.current = { messages, conversationId };

  const saveNow = useCallback(async () => {
    const { messages: current, conversationId: id } = latest.current;
    if (!current.length) {
      return;
    }

    const fingerprint = JSON.stringify(current);
    if (fingerprint === persisted.current) {
      return;
    }

    persisted.current = fingerprint;
    const token = session.current;

    const response = await fetch('/hermes/conversations', {
      method: 'POST',
      // Only the conversation itself is stored; the step trace stays on the
      // client and is never written down.
      body: JSON.stringify({
        id,
        messages: current.map(({ role, content }) => ({ role, content })),
      }),
    });

    if (!response.ok) {
      // Let a later attempt try again rather than swallowing the thread.
      persisted.current = '';
      return;
    }

    const saved = await response.json();
    mutate(HERMES_CONVERSATIONS_KEY);

    // The user moved on while this was saving; adopting the id now would point
    // the chat they are looking at at the wrong conversation.
    if (session.current !== token) {
      return;
    }

    setConversationId(saved.id);
  }, [fetch, mutate]);

  useEffect(() => {
    if (streaming) {
      return;
    }

    saveNow();
  }, [streaming, messages, saveNow]);

  const openConversation = useCallback(
    async (id: string) => {
      const response = await fetch(`/hermes/conversations/${id}`);
      if (!response.ok) {
        return;
      }

      const conversation = await response.json();
      // Whatever is on screen is written down, but the switch does not wait on
      // it — the snapshot was already captured.
      void saveNow();
      session.current += 1;
      reset();
      persisted.current = JSON.stringify(conversation.messages);
      setMessages(conversation.messages);
      setConversationId(id);
    },
    [fetch, reset, saveNow, setMessages]
  );

  const newConversation = useCallback(() => {
    // Fire the save with what is on screen now, then clear immediately: waiting
    // on the network here would wipe anything typed in the meantime.
    void saveNow();
    session.current += 1;
    reset();
    persisted.current = '';
    setConversationId(undefined);
    setDraft('');
    setAttachments([]);
    setAttachError(null);
    input.current?.focus();
  }, [reset, saveNow]);

  const removeConversation = useCallback(
    (id: string) => async (event: { stopPropagation: () => void }) => {
      event.stopPropagation();

      if (!(await deleteDialog(t('hermes_delete_confirm', 'Delete this chat?')))) {
        return;
      }

      await fetch(`/hermes/conversations/${id}`, { method: 'DELETE' });
      mutate(HERMES_CONVERSATIONS_KEY);

      if (id === conversationId) {
        newConversation();
      }
    },
    [conversationId, fetch, mutate, newConversation, t]
  );

  const configure = useCallback(
    () =>
      openModal({
        title: AGENT_NAME,
        closeOnClickOutside: true,
        closeOnEscape: true,
        children: <HermesSettings onClose={closeAll} />,
      }),
    [closeAll, openModal]
  );

  const copy = useCallback(async (text: string, index: number) => {
    await navigator.clipboard?.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const submit = useCallback(() => {
    const text = draft;
    setDraft('');
    setAttachments([]);
    setAttachError(null);
    send(text, attachments);
  }, [attachments, draft, send]);

  // Images ride along inline so the model can see them, video is uploaded and
  // handed over as a link, and text files are folded into the message so the
  // agent can read them without needing a file API.
  const attach = useCallback(async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setAttachError(null);

    for (const file of Array.from(files).slice(0, MAX_ATTACHMENTS)) {
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setAttachError(`${file.name} is larger than 1GB`);
          continue;
        }

        setUploading(true);
        try {
          const form = new FormData();
          form.append('file', file);

          const response = await fetch('/media/upload-simple', {
            ...WALLET_INLINE_REQUEST,
            method: 'POST',
            body: form,
          });

          const refused = await openTopUpIfWalletRefused(response);
          if (refused !== undefined) {
            setAttachError(refused || `${file.name} could not be uploaded.`);
            continue;
          }

          if (!response.ok) {
            setAttachError(
              `${file.name} could not be uploaded — only MP4 video is supported`
            );
            continue;
          }

          const saved = await response.json();
          setAttachments((current) =>
            [
              ...current,
              { name: file.name, mime: file.type, url: saved.path },
            ].slice(0, MAX_ATTACHMENTS)
          );
        } finally {
          setUploading(false);
        }
        continue;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError(`${file.name} is larger than 10MB`);
        continue;
      }

      if (file.type.startsWith('image/')) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        setAttachments((current) =>
          [...current, { name: file.name, mime: file.type, data }].slice(
            0,
            MAX_ATTACHMENTS
          )
        );
        continue;
      }

      if (TEXTUAL.test(file.name) || file.type.startsWith('text/')) {
        const text = await file.text();
        setDraft(
          (current) =>
            `${current}${current ? '\n\n' : ''}${file.name}:\n\n${text}`
        );
        continue;
      }

      setAttachError(
        `${file.name} cannot be attached — images, MP4 video, or text and code files`
      );
    }
  }, [fetch]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // The textarea grows with what is typed rather than scrolling in one line.
  useEffect(() => {
    const node = input.current;
    if (!node) {
      return;
    }

    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [draft]);

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner flex-1 flex">
        <LoadingComponent />
      </div>
    );
  }

  if (!settings?.configured) {
    return (
      <div className="bg-newBgColorInner flex-1 flex flex-col items-center justify-center gap-[14px] text-center p-[20px]">
        <span className="rounded-[12px] overflow-hidden">
          <VoholabsMark size={44} />
        </span>
        <div className="text-[18px] font-[500]">{AGENT_NAME}</div>
        <div className="text-[14px] text-textItemBlur max-w-[380px]">
          {t('hermes_not_connected', 'APEX is not connected yet')}
        </div>
        <div
          onClick={configure}
          className="cursor-pointer select-none flex items-center gap-[8px] rounded-[8px] bg-warm text-newBgColor px-[16px] h-[38px] text-[14px] font-[500]"
        >
          {t('hermes_connect', 'Connect APEX')}
        </div>
      </div>
    );
  }

  const suggestions = [
    t('hermes_suggest_1', 'What should we post this week?'),
    t('hermes_suggest_2', 'Draft a post about our latest release'),
    t('hermes_suggest_3', 'Who are we writing for?'),
  ];

  return (
    <>
      <div className="bg-newBgColorInner w-[260px] relative">
        <div className="absolute top-0 start-0 w-full h-full p-[16px] overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          <div
            onClick={newConversation}
            className="cursor-pointer select-none flex items-center gap-[8px] rounded-[10px] border border-newTableBorder h-[40px] px-[14px] text-[14px] mb-[18px] hover:border-warm hover:text-warm hover:bg-warmHover transition-colors"
          >
            <Icon d={PLUS} size={14} />
            {t('hermes_new_chat', 'New chat')}
          </div>

          {!!conversations?.length && (
            <div className="text-[11px] uppercase tracking-[0.08em] text-textItemBlur mb-[8px] ps-[12px]">
              {t('hermes_recent', 'Recent')}
            </div>
          )}

          {!conversations?.length ? (
            <div className="text-[13px] text-textItemBlur ps-[12px]">
              {t('hermes_no_history', 'No chats yet')}
            </div>
          ) : (
            <div className="flex flex-col gap-[2px]">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  className={clsx(
                    'group/chat relative cursor-pointer select-none flex flex-col gap-[1px] py-[7px] ps-[12px] pe-[30px] rounded-[8px] transition-colors',
                    conversation.id === conversationId
                      ? 'bg-warmSoft'
                      : 'hover:bg-warmHover'
                  )}
                >
                  <span className="text-[13px] leading-[1.3] whitespace-nowrap text-ellipsis overflow-hidden">
                    {conversation.title || t('hermes_untitled', 'Untitled')}
                  </span>
                  <span className="text-[11px] text-textItemBlur">
                    {dayjs(conversation.updatedAt).fromNow()}
                  </span>
                  <span
                    onClick={removeConversation(conversation.id)}
                    data-tooltip-id="tooltip"
                    data-tooltip-content={t('delete', 'Delete')}
                    className="absolute end-[8px] top-[9px] opacity-0 group-hover/chat:opacity-100 text-textItemBlur hover:text-warm transition-opacity"
                  >
                    <Icon d={CLOSE} size={12} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-newBgColorInner flex-1 flex flex-col min-w-0">
        <div
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            setAtBottom(
              node.scrollHeight - node.scrollTop - node.clientHeight < 80
            );
          }}
          className="relative flex-1 overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor"
        >
          {!messages.length ? (
            <div className="h-full flex flex-col items-center justify-center gap-[16px] px-[20px]">
              <span className="rounded-[12px] overflow-hidden">
                <VoholabsMark size={44} />
              </span>
              <div className="text-[20px] font-[500]">
                {t('hermes_start', 'Ask APEX anything.')}
              </div>
              <div className="flex flex-wrap justify-center gap-[8px] max-w-[560px]">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion}
                    onClick={() => {
                      setDraft(suggestion);
                      input.current?.focus();
                    }}
                    className="cursor-pointer select-none rounded-[999px] border border-newTableBorder px-[14px] h-[34px] flex items-center text-[13px] text-textItemBlur hover:border-warm hover:text-warm hover:bg-warmHover transition-colors"
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-[720px] mx-auto flex flex-col gap-[22px] px-[20px] py-[24px]">
              {messages.map((message, index) => {
                const waiting =
                  streaming && index === messages.length - 1 && !message.content;

                if (message.role === 'user') {
                  return (
                    <div key={index} className="flex flex-col items-end gap-[6px]">
                      {!!message.attachments?.length && (
                        <div className="flex flex-wrap justify-end gap-[6px] max-w-[80%]">
                          {message.attachments.map((attachment, position) =>
                            attachment.data ? (
                              <img
                                key={`${attachment.name}-${position}`}
                                src={attachment.data}
                                alt={attachment.name}
                                className="w-[104px] h-[104px] rounded-[10px] object-cover border border-newTableBorder"
                              />
                            ) : (
                              <div
                                key={`${attachment.name}-${position}`}
                                className="flex items-center gap-[8px] rounded-[10px] border border-newTableBorder px-[10px] h-[36px] text-[12px]"
                              >
                                <span className="text-warm">MP4</span>
                                <span className="max-w-[180px] truncate">
                                  {attachment.name}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                      {!!message.content && (
                        <div className="bg-warmSoft rounded-[14px] rounded-ee-[4px] px-[14px] py-[10px] text-[14px] leading-[1.7] whitespace-pre-wrap max-w-[80%]">
                          {message.content}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={index} className="flex gap-[12px]">
                    <span className="shrink-0 mt-[2px] rounded-[8px] overflow-hidden">
                      <VoholabsMark size={26} />
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-textItemBlur">
                        {AGENT_NAME}
                      </div>
                      {waiting ? (
                        <HermesWaiting activity={message.activity} />
                      ) : (
                        <>
                          {!!message.activity?.length && (
                            <details className="text-[12px] text-textItemBlur">
                              <summary className="cursor-pointer select-none hover:text-warm">
                                {t('hermes_steps', 'Steps')} ·{' '}
                                {message.activity.length}
                              </summary>
                              <div className="mt-[6px] flex flex-col gap-[3px] ps-[10px] border-s border-newTableBorder">
                                {message.activity.map((step) => (
                                  <span key={step.id}>
                                    {!!step.emoji && (
                                      <span className="me-[6px]">{step.emoji}</span>
                                    )}
                                    {step.label}
                                  </span>
                                ))}
                              </div>
                            </details>
                          )}
                          <div className="text-[14px] leading-[1.75]">
                            <HermesMarkdown text={message.content} />
                          </div>
                          <div
                            onClick={() => copy(message.content, index)}
                            data-tooltip-id="tooltip"
                            data-tooltip-content={
                              copied === index
                                ? t('hermes_copied', 'Copied')
                                : t('hermes_copy', 'Copy')
                            }
                            className="self-start cursor-pointer select-none w-[26px] h-[26px] -ms-[4px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-warm hover:bg-warmHover transition-colors"
                          >
                            <Icon
                              d={copied === index ? TICK : COPY}
                              size={14}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {!!error && (
                <div className="text-[13px] text-red-400 border border-red-400/30 bg-red-400/5 rounded-[10px] px-[14px] py-[10px]">
                  {error}
                </div>
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>

        {!atBottom && !!messages.length && (
          <div className="relative">
            <div
              onClick={() =>
                bottom.current?.scrollIntoView({ behavior: 'smooth' })
              }
              className="absolute -top-[46px] start-1/2 -translate-x-1/2 cursor-pointer select-none rounded-[999px] border border-newTableBorder bg-newBgColorInner px-[14px] h-[30px] flex items-center text-[12px] text-textItemBlur hover:text-warm hover:border-warm transition-colors"
            >
              {t('hermes_jump', 'Jump to latest')}
            </div>
          </div>
        )}

        <div className="px-[20px] pb-[20px] pt-[8px]">
          <div className="max-w-[720px] mx-auto">
            {!!attachments.length && (
              <div className="flex flex-wrap gap-[8px] mb-[8px]">
                {attachments.map((attachment, position) => (
                  <div
                    key={`${attachment.name}-${position}`}
                    className="flex items-center gap-[8px] rounded-[8px] border border-newTableBorder ps-[8px] pe-[6px] h-[34px] text-[12px]"
                  >
                    {attachment.data ? (
                      <img
                        src={attachment.data}
                        alt={attachment.name}
                        className="w-[22px] h-[22px] rounded-[4px] object-cover"
                      />
                    ) : (
                      <span className="w-[22px] h-[22px] rounded-[4px] bg-warmSoft text-warm flex items-center justify-center text-[9px]">
                        MP4
                      </span>
                    )}
                    <span className="max-w-[160px] truncate">{attachment.name}</span>
                    <span
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, index) => index !== position)
                        )
                      }
                      className="cursor-pointer text-textItemBlur hover:text-warm"
                    >
                      <Icon d={CLOSE} size={12} />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!!attachError && (
              <div className="text-[12px] text-red-400 mb-[8px]">{attachError}</div>
            )}

            <div className="flex items-end gap-[8px] rounded-[16px] border border-newTableBorder bg-newBgColor px-[14px] py-[10px] focus-within:border-warm transition-colors">
              <input
                ref={filePicker}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  attach(event.target.files);
                  event.target.value = '';
                }}
              />
              <div
                onClick={() => !uploading && filePicker.current?.click()}
                data-tooltip-id="tooltip"
                data-tooltip-content={
                  uploading
                    ? t('hermes_uploading', 'Uploading...')
                    : t('hermes_attach', 'Attach a file')
                }
                className="shrink-0 cursor-pointer select-none w-[32px] h-[32px] rounded-[999px] flex items-center justify-center text-textItemBlur hover:text-warm hover:bg-warmHover transition-colors"
              >
                <Icon d={CLIP} size={16} />
              </div>
              <textarea
                ref={input}
                value={draft}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onPaste={(event) => {
                  const files = event.clipboardData?.files;
                  if (files?.length) {
                    event.preventDefault();
                    attach(files);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={t('hermes_placeholder', 'Message APEX...')}
                className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-[1.6] py-[5px] max-h-[180px] placeholder:text-textItemBlur"
              />
              {streaming ? (
                <div
                  onClick={stop}
                  data-tooltip-id="tooltip"
                  data-tooltip-content={t('hermes_stop', 'Stop')}
                  className="shrink-0 cursor-pointer select-none w-[32px] h-[32px] rounded-[999px] bg-warm text-newBgColor flex items-center justify-center"
                >
                  <span className="w-[10px] h-[10px] rounded-[2px] bg-newBgColor" />
                </div>
              ) : (
                <div
                  onClick={submit}
                  className={clsx(
                    'shrink-0 select-none w-[32px] h-[32px] rounded-[999px] flex items-center justify-center transition-colors',
                    !draft.trim() && !attachments.length
                      ? 'opacity-30 cursor-default bg-newColColor'
                      : 'cursor-pointer bg-warm text-newBgColor'
                  )}
                >
                  <Icon d={ARROW_UP} size={15} />
                </div>
              )}
            </div>
            <div className="text-[11px] text-textItemBlur mt-[6px] text-center">
              {streaming
                ? t('hermes_stop_hint', 'Working — press stop to interrupt')
                : t('hermes_hint', 'Enter to send · Shift + Enter for a new line')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
