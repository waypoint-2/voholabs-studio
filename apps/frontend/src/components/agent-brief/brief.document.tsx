'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import { useSWRConfig } from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useBriefClassic } from '@gitroom/frontend/components/agent-brief/brief.classic';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BRIEF_BLOCKS_MAX,
  BRIEF_HEADING_MAX,
  documentHasFeature,
  emptyContent,
  stripHtml,
} from '@gitroom/nestjs-libraries/agent-brief/brief.registry';
import {
  BriefBlock,
  BriefDocumentContent,
} from '@gitroom/nestjs-libraries/agent-brief/brief.types';
import { BriefTreeDocument } from '@gitroom/frontend/components/agent-brief/use.brief.tree';
import { useBriefAutosave } from '@gitroom/frontend/components/agent-brief/use.brief.autosave';
import { BriefTextarea } from '@gitroom/frontend/components/agent-brief/brief.textarea';
import { BriefSaveIndicator } from '@gitroom/frontend/components/agent-brief/brief.save.indicator';
import { BriefLinks } from '@gitroom/frontend/components/agent-brief/brief.links';
import { BriefAssets } from '@gitroom/frontend/components/agent-brief/brief.assets';
import {
  BRIEF_DOCUMENTS_KEY,
  BriefDocumentsResponse,
} from '@gitroom/frontend/components/agent-brief/use.brief.documents';

const PlusIcon: FC = () => (
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
);

const TrashIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
  >
    <path
      d="M2 4H14M12.6667 4V13.3333C12.6667 14 12 14.6667 11.3333 14.6667H4.66667C4 14.6667 3.33333 14 3.33333 13.3333V4M5.33333 4V2.66667C5.33333 2 6 1.33333 6.66667 1.33333H9.33333C10 1.33333 10.6667 2 10.6667 2.66667V4"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// One shape, always. The button does not change size or style with the state of
// the document.
const ActionButton: FC<{
  label: string;
  onClick: () => void;
  icon: 'plus' | 'trash';
}> = ({ label, onClick, icon }) => {
  const classic = useBriefClassic();
  return (
    <div
      onClick={onClick}
      className={
        classic
          ? 'self-start cursor-pointer select-none flex items-center gap-[8px] rounded-[8px] border border-newTableBorder px-[14px] h-[38px] text-[14px] text-textItemBlur hover:border-warm hover:text-warm hover:bg-warmHover transition-colors'
          : 'self-start cursor-pointer select-none flex items-center gap-[8px] rounded-[8px] border border-newTableBorder px-[14px] h-[38px] text-[14px] text-textItemBlur hover:border-tealText hover:text-tealText hover:bg-tealHover transition-colors'
      }
    >
      {icon === 'plus' ? <PlusIcon /> : <TrashIcon />}
      {label}
    </div>
  );
};

// Mounted with a key of category + document, so every document gets its own
// autosave controller.
export const BriefDocument: FC<{
  document: BriefTreeDocument;
  content?: BriefDocumentContent;
  onDeleted: () => void;
  headerAction?: ReactNode;
}> = ({ document, content, onDeleted, headerAction }) => {
  const t = useT();
  const classic = useBriefClassic();
  const fetch = useFetch();
  const toaster = useToaster();
  const { mutate } = useSWRConfig();

  const current = content || emptyContent();
  // Bodies written before this was plain text may still carry markup.
  const [blocks, setBlocks] = useState<BriefBlock[]>(() =>
    (current.blocks || []).map((block) =>
      /<[a-z][\s\S]*>/i.test(block.body)
        ? { ...block, body: stripHtml(block.body).replace(/\s+/g, ' ').trim() }
        : block
    )
  );
  const [title, setTitle] = useState(current.title || '');

  const { state, save, discardPending, retry } = useBriefAutosave(
    document.category.id,
    document.key
  );

  const hasLinks = documentHasFeature(document.definition, 'links');
  const hasAssets = documentHasFeature(document.definition, 'assets');
  // The agent writes this category itself. That only changes what we say at
  // the top of the page, not what can be done with it: a note the agent got
  // wrong is worth no more than a note it never wrote.
  const agentKept = !!document.category.agentManaged;
  const canDelete = !!document.category.canDelete;
  const canRename = document.category.source === 'user';

  const commitBlocks = useCallback(
    (next: BriefBlock[]) => {
      setBlocks(next);
      save({ blocks: next });
    },
    [save]
  );

  const addBlock = useCallback(
    () => commitBlocks([...blocks, { id: makeId(10), heading: '', body: '' }]),
    [blocks, commitBlocks]
  );

  const changeBlock = useCallback(
    (id: string, field: 'heading' | 'body', value: string) =>
      commitBlocks(
        blocks.map((block) =>
          block.id === id ? { ...block, [field]: value } : block
        )
      ),
    [blocks, commitBlocks]
  );

  const removeBlock = useCallback(
    (id: string) => () => commitBlocks(blocks.filter((b) => b.id !== id)),
    [blocks, commitBlocks]
  );

  const remove = useCallback(async () => {
    if (
      !(await deleteDialog(
        t('brief_delete_confirm', 'Delete this document and everything in it?'),
        t('brief_delete_document', 'Delete document')
      ))
    ) {
      return;
    }

    // Anything still buffered or in flight would write the content straight back.
    await discardPending();

    const response = await fetch(
      `/brief/${encodeURIComponent(
        document.category.id
      )}/${encodeURIComponent(document.key)}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      toaster.show(t('brief_save_failed', 'Could not save'), 'warning');
      return;
    }

    mutate<BriefDocumentsResponse>(
      BRIEF_DOCUMENTS_KEY,
      (documents) =>
        documents && {
          ...documents,
          documents: documents.documents.filter(
            (one) =>
              one.category !== document.category.id || one.key !== document.key
          ),
        },
      { revalidate: false }
    );

    onDeleted();
  }, [
    fetch,
    mutate,
    t,
    toaster,
    discardPending,
    onDeleted,
    document.category.id,
    document.key,
  ]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-start gap-[16px]">
        <div className="flex-1 flex flex-col gap-[6px] min-w-0">
          <div className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
            <span>
              {classic ? t('brief_title', 'Agent Brief') : t('brief', 'Brief')}
            </span>
            <span>/</span>
            <span>
              {t(document.category.labelKey, document.category.label)}
            </span>
            <span>/</span>
            <bdi className={classic ? 'text-warm' : 'text-tealText'}>
              {document.label}
            </bdi>
          </div>
          {canRename ? (
            <input
              value={title}
              maxLength={BRIEF_HEADING_MAX}
              dir="auto"
              onChange={(event) => {
                setTitle(event.target.value);
                save({ title: event.target.value });
              }}
              placeholder={t('brief_untitled', 'Untitled source')}
              className="text-[28px] font-[500] bg-transparent outline-none w-full placeholder:text-textItemBlur"
            />
          ) : (
            <h2 className="text-[28px] font-[500]">
              <bdi>{document.label}</bdi>
            </h2>
          )}
          {!!document.description && (
            <div className="text-[14px] text-textItemBlur">
              {document.description}
            </div>
          )}
        </div>
        <div
          className={
            classic
              ? 'flex items-center gap-[12px] pt-[4px]'
              : 'flex items-center gap-[12px] pt-[4px] flex-wrap justify-end'
          }
        >
          {headerAction}
          <BriefSaveIndicator state={state} onRetry={retry} />
        </div>
      </div>

      {hasLinks && (
        <BriefLinks
          links={current.links || []}
          onChange={(links) => save({ links })}
        />
      )}

      {hasAssets && (
        <BriefAssets
          assets={current.assets || []}
          onChange={(assets) => save({ assets })}
        />
      )}

      {agentKept && (
        <div className="flex items-center gap-[8px] text-[12px] text-textItemBlur">
          <span
            className={
              classic
                ? 'w-[6px] h-[6px] rounded-full bg-warm'
                : 'w-[6px] h-[6px] rounded-full bg-tealText'
            }
          />
          {t(
            'brief_agent_kept',
            'Written by the agent as it learns. Correct anything it got wrong.'
          )}
        </div>
      )}

      {agentKept && !blocks.length && (
        <div className="text-[14px] text-textItemBlur">
          {t('brief_agent_empty', 'Fills in as agent learns')}
        </div>
      )}

      {/* No cards, no rules: a heading and the text under it, straight on the
          page, the way a document reads. */}
      {blocks.map((block) => (
        <div key={block.id} className="flex flex-col gap-[6px] mt-[10px]">
          <div className="flex items-start gap-[10px]">
            <input
              value={block.heading}
              maxLength={BRIEF_HEADING_MAX}
              dir="auto"
              onChange={(event) =>
                changeBlock(block.id, 'heading', event.target.value)
              }
              placeholder={t('brief_heading_placeholder', 'Heading')}
              className="flex-1 text-[22px] font-[600] bg-transparent outline-none placeholder:text-textItemBlur"
            />
            <div
              onClick={removeBlock(block.id)}
              data-tooltip-id="tooltip"
              data-tooltip-content={t('brief_remove_block', 'Remove')}
              className={
                classic
                  ? 'shrink-0 mt-[4px] cursor-pointer select-none w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-warm hover:bg-warmHover transition-colors'
                  : 'shrink-0 mt-[4px] cursor-pointer select-none w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-tealText hover:bg-tealHover transition-colors'
              }
            >
              <TrashIcon />
            </div>
          </div>
          <BriefTextarea
            value={block.body}
            placeholder={t('brief_body_placeholder', 'Write here...')}
            onChange={(value) => changeBlock(block.id, 'body', value)}
            className="w-full bg-transparent outline-none resize-none overflow-hidden text-[15px] leading-[1.7] placeholder:text-textItemBlur"
          />
        </div>
      ))}

      <div className="flex items-center gap-[10px] mt-[10px]">
        {blocks.length < BRIEF_BLOCKS_MAX && (
          <ActionButton
            icon="plus"
            label={t('brief_add_rule', 'Add a rule')}
            onClick={addBlock}
          />
        )}
        {canDelete && (
          <ActionButton
            icon="trash"
            label={t('brief_delete_document', 'Delete document')}
            onClick={remove}
          />
        )}
      </div>
    </div>
  );
};
