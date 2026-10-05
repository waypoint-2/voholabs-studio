'use client';

import { FC, ReactNode, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  useBriefTree,
  BriefTreeDocument,
  BriefTreeGroup,
} from '@gitroom/frontend/components/agent-brief/use.brief.tree';
import {
  BRIEF_DOCUMENTS_KEY,
  BriefDocumentsResponse,
  useBriefDocuments,
} from '@gitroom/frontend/components/agent-brief/use.brief.documents';
import { BriefTree } from '@gitroom/frontend/components/agent-brief/brief.tree';
import { BriefDocument } from '@gitroom/frontend/components/agent-brief/brief.document';

// /brief, /brief/<category>, /brief/<category>/<document key>
// headerAction sits beside the save indicator (the wallet's redo button).
export const AgentBrief: FC<{ headerAction?: ReactNode }> = ({
  headerAction,
}) => {
  const t = useT();
  const router = useRouter();
  const params = useParams();
  const fetch = useFetch();
  const toaster = useToaster();
  const { mutate } = useSWRConfig();
  const { data, isLoading: documentsLoading } = useBriefDocuments();
  const { groups, findDocument, firstDocument, isLoading } = useBriefTree(
    data?.documents
  );

  const slug = (params?.slug as string[]) || [];
  const [categoryId, documentKey] = slug;

  const active = useMemo(
    () => findDocument(categoryId, documentKey) || firstDocument,
    [findDocument, categoryId, documentKey, firstDocument]
  );

  const content = useMemo(
    () =>
      data?.documents.find(
        (document) =>
          document.category === active?.category.id &&
          document.key === active?.key
      )?.content,
    [data, active]
  );

  const select = useCallback(
    (document: BriefTreeDocument) =>
      router.push(
        `/brief/${document.category.id}/${encodeURIComponent(document.key)}`
      ),
    [router]
  );

  // A user-created document only exists once it is saved, so creating one is a
  // save of an empty document under a fresh key.
  const create = useCallback(
    async (group: BriefTreeGroup) => {
      const key = makeId(12);
      const response = await fetch(
        `/brief/${encodeURIComponent(group.category.id)}/${key}`,
        { method: 'PATCH', body: JSON.stringify({ title: '', blocks: [] }) }
      );

      if (!response.ok) {
        toaster.show(t('brief_save_failed', 'Could not save'), 'warning');
        return;
      }

      const saved = await response.json();
      mutate<BriefDocumentsResponse>(
        BRIEF_DOCUMENTS_KEY,
        (current) =>
          current && { ...current, documents: [...current.documents, saved] },
        { revalidate: false }
      );

      router.push(`/brief/${group.category.id}/${key}`);
    },
    [fetch, mutate, router, t, toaster]
  );

  const afterDelete = useCallback(() => router.push('/brief'), [router]);

  return (
    <>
      <div className="bg-newBgColorInner w-[300px] relative">
        <div className="absolute top-0 start-0 w-full h-full p-[20px] overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          <BriefTree
            groups={groups}
            active={active}
            onSelect={select}
            onCreate={create}
          />
        </div>
      </div>
      <div className="bg-newBgColorInner flex-1 relative">
        <div className="absolute top-0 start-0 w-full h-full p-[20px] overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
          {isLoading || documentsLoading ? (
            <LoadingComponent />
          ) : active ? (
            <BriefDocument
              key={`${active.category.id}:${active.key}`}
              document={active}
              content={content}
              onDeleted={afterDelete}
              headerAction={headerAction}
            />
          ) : (
            <div className="text-textItemBlur">
              {t('brief_empty_state', 'Pick a document to start')}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
