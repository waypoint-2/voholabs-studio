'use client';

import { FC, useCallback, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  openTopUpIfWalletRefused,
  WALLET_INLINE_REQUEST,
} from '@gitroom/frontend/components/wallet/wallet.bridge';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useBriefClassic } from '@gitroom/frontend/components/agent-brief/brief.classic';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BRIEF_ASSET_NOTE_MAX,
  BRIEF_ASSETS_MAX,
} from '@gitroom/nestjs-libraries/agent-brief/brief.registry';
import { BriefAsset } from '@gitroom/nestjs-libraries/agent-brief/brief.types';

const isImage = (asset: BriefAsset) =>
  (asset.mime || '').startsWith('image/') ||
  /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(asset.url);

const isVideo = (asset: BriefAsset) =>
  (asset.mime || '').startsWith('video/') || /\.(mp4|mov|webm)$/i.test(asset.url);

// The brand's files. Uploads go through the app's normal media pipeline, so they
// land wherever storage is configured — R2 in this deployment — rather than in a
// second bucket of their own.
export const BriefAssets: FC<{
  assets: BriefAsset[];
  onChange: (assets: BriefAsset[]) => void;
}> = ({ assets, onChange }) => {
  const t = useT();
  const classic = useBriefClassic();
  const fetch = useFetch();
  const toaster = useToaster();
  const { backendUrl, uploadDirectory } = useVariables() as any;
  const picker = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<BriefAsset[]>(assets);
  const [uploading, setUploading] = useState(false);

  const update = useCallback(
    (next: BriefAsset[]) => {
      setCurrent(next);
      onChange(next);
    },
    [onChange]
  );

  // A stored path is relative to the upload host; an absolute URL is already
  // wherever it lives.
  const resolve = useCallback(
    (url: string) =>
      /^https?:\/\//i.test(url)
        ? url
        : `${uploadDirectory || backendUrl || ''}${url}`,
    [backendUrl, uploadDirectory]
  );

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) {
        return;
      }

      setUploading(true);

      try {
        const added: BriefAsset[] = [];

        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append('file', file);

          const response = await fetch('/media/upload-simple', {
            ...WALLET_INLINE_REQUEST,
            method: 'POST',
            body: form,
          });

          // Not enough credits to store it: the top-up opens with the
          // reason, and the rest of the files wait for it.
          if (await openTopUpIfWalletRefused(response)) {
            break;
          }

          if (!response.ok) {
            toaster.show(
              t('brief_asset_failed_named', '{{name}} could not be uploaded', {
                name: file.name,
                interpolation: { escapeValue: false },
              }),
              'warning'
            );
            continue;
          }

          const saved = await response.json();
          added.push({
            id: makeId(10),
            name: file.name,
            url: saved.path,
            mime: file.type,
            note: '',
          });
        }

        if (added.length) {
          update([...current, ...added].slice(0, BRIEF_ASSETS_MAX));
        }
      } finally {
        setUploading(false);
      }
    },
    [current, fetch, t, toaster, update]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      {!!current.length && (
        <div className="flex flex-col gap-[10px]">
          {current.map((asset) => (
            <div
              key={asset.id}
              className={
                classic
                  ? 'flex gap-[12px] rounded-[10px] border border-newTableBorder p-[10px] focus-within:border-warm transition-colors'
                  : 'flex gap-[12px] rounded-[10px] border border-newTableBorder p-[10px] focus-within:border-tealText transition-colors'
              }
            >
              <div className="shrink-0 w-[72px] h-[72px] rounded-[8px] overflow-hidden bg-newBgColor flex items-center justify-center">
                {isImage(asset) ? (
                  <img
                    src={resolve(asset.url)}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                ) : isVideo(asset) ? (
                  <video
                    src={resolve(asset.url)}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : (
                  <span className="text-[10px] text-textItemBlur px-[4px] text-center break-all">
                    {asset.name.split('.').pop()}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                <div className="flex items-center gap-[8px]">
                  <a
                    href={resolve(asset.url)}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      classic
                        ? 'flex-1 text-[13px] truncate hover:text-warm'
                        : 'flex-1 text-[13px] truncate hover:text-tealText'
                    }
                  >
                    <bdi>{asset.name}</bdi>
                  </a>
                  <span
                    onClick={() =>
                      update(current.filter((one) => one.id !== asset.id))
                    }
                    data-tooltip-id="tooltip"
                    data-tooltip-content={t('brief_asset_remove', 'Remove')}
                    className={
                      classic
                        ? 'cursor-pointer select-none text-textItemBlur hover:text-warm'
                        : 'cursor-pointer select-none text-textItemBlur hover:text-tealText'
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
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
                  </span>
                </div>
                <textarea
                  value={asset.note || ''}
                  maxLength={BRIEF_ASSET_NOTE_MAX}
                  rows={2}
                  dir="auto"
                  onChange={(event) =>
                    update(
                      current.map((one) =>
                        one.id === asset.id
                          ? { ...one, note: event.target.value }
                          : one
                      )
                    )
                  }
                  placeholder={t(
                    'brief_asset_note_placeholder',
                    'When should the agent use this, and when should it not?'
                  )}
                  className="w-full bg-transparent outline-none resize-none text-[13px] text-textItemBlur placeholder:text-textItemBlur"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {current.length < BRIEF_ASSETS_MAX && (
        <>
          <input
            ref={picker}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = '';
            }}
          />
          <div
            onClick={() => !uploading && picker.current?.click()}
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
            {uploading
              ? t('brief_asset_uploading', 'Uploading...')
              : t('brief_asset_add', 'Add a file')}
          </div>
        </>
      )}
    </div>
  );
};
