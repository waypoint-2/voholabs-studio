'use client';

import { FC, useCallback, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useBriefClassic } from '@gitroom/frontend/components/agent-brief/brief.classic';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BRIEF_LINK_NOTE_MAX,
  BRIEF_LINK_URL_MAX,
  BRIEF_LINKS_MAX,
} from '@gitroom/nestjs-libraries/agent-brief/brief.registry';
import { BriefLink } from '@gitroom/nestjs-libraries/agent-brief/brief.types';

// The links a source document registers, each with its own note about what it
// is and how the agent should use it.
export const BriefLinks: FC<{
  links: BriefLink[];
  onChange: (links: BriefLink[]) => void;
}> = ({ links, onChange }) => {
  const t = useT();
  const classic = useBriefClassic();
  // Local first so typing stays responsive; the parent debounces the save.
  const [current, setCurrent] = useState<BriefLink[]>(links);

  const update = useCallback(
    (next: BriefLink[]) => {
      setCurrent(next);
      onChange(next);
    },
    [onChange]
  );

  const change = useCallback(
    (id: string, field: 'url' | 'note') =>
      (event: { target: { value: string } }) =>
        update(
          current.map((link) =>
            link.id === id ? { ...link, [field]: event.target.value } : link
          )
        ),
    [current, update]
  );

  const remove = useCallback(
    (id: string) => () => update(current.filter((link) => link.id !== id)),
    [current, update]
  );

  const add = useCallback(
    () => update([...current, { id: makeId(10), url: '', note: '' }]),
    [current, update]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      {current.map((link) => (
        <div
          key={link.id}
          className={
            classic
              ? 'flex flex-col gap-[8px] rounded-[10px] border border-newTableBorder p-[12px] focus-within:border-warm transition-colors'
              : 'flex flex-col gap-[8px] rounded-[10px] border border-newTableBorder p-[12px] focus-within:border-tealText transition-colors'
          }
        >
          <div className="flex items-center gap-[10px]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={
                classic ? 'text-warm shrink-0' : 'text-tealText shrink-0'
              }
            >
              <path
                d="M6.7 8.7a2.9 2.9 0 0 0 4.4.4l2-2a2.9 2.9 0 1 0-4.1-4.1l-1.1 1.1M9.3 7.3a2.9 2.9 0 0 0-4.4-.4l-2 2a2.9 2.9 0 1 0 4.1 4.1l1.1-1.1"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              value={link.url}
              onChange={change(link.id, 'url')}
              maxLength={BRIEF_LINK_URL_MAX}
              dir="auto"
              placeholder={t('brief_link_placeholder', 'Paste a link...')}
              className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-textItemBlur"
            />
            <div
              onClick={remove(link.id)}
              data-tooltip-id="tooltip"
              data-tooltip-content={t('brief_remove_link', 'Remove link')}
              className={
                classic
                  ? 'cursor-pointer select-none text-textItemBlur hover:text-warm transition-colors'
                  : 'cursor-pointer select-none text-textItemBlur hover:text-tealText transition-colors'
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M12 4L4 12M4 4L12 12"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <textarea
            value={link.note || ''}
            onChange={change(link.id, 'note')}
            maxLength={BRIEF_LINK_NOTE_MAX}
            rows={2}
            dir="auto"
            placeholder={t(
              'brief_link_note_placeholder',
              'What is this, and how should the agent use it?'
            )}
            className="w-full bg-transparent outline-none resize-none text-[14px] text-textItemBlur placeholder:text-textItemBlur"
          />
        </div>
      ))}

      {current.length < BRIEF_LINKS_MAX && (
        <div
          onClick={add}
          className={
            classic
              ? 'self-start cursor-pointer select-none flex items-center gap-[8px] rounded-[8px] border border-dashed border-newTableBorder px-[14px] h-[38px] text-[14px] text-textItemBlur hover:border-warm hover:text-warm hover:bg-warmHover transition-colors'
              : 'self-start cursor-pointer select-none flex items-center gap-[8px] rounded-[8px] border border-dashed border-newTableBorder px-[14px] h-[38px] text-[14px] text-textItemBlur hover:border-tealText hover:text-tealText hover:bg-tealHover transition-colors'
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M8 3.33333V12.6667M3.33333 8H12.6667"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('brief_add_link', 'Add link')}
        </div>
      )}
    </div>
  );
};
