import { HttpException } from '@nestjs/common';
import { topUpUrl } from '@gitroom/nestjs-libraries/chat/tools/wallet.shared';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { Readable } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

// Same allow-list as the public API upload routes.
export const ALLOWED_MEDIA_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

export type StoredMedia = { id?: string; path?: string; error?: string };

type Storage = ReturnType<typeof UploadFactory.createStorage>;

/**
 * Sniff, validate and store a buffer in the media library. The declared file
 * name is never trusted for the type — it is taken from the bytes themselves,
 * the same way CustomFileValidationPipe does it for HTTP uploads.
 */
export const storeBufferAsMedia = async (params: {
  storage: Storage;
  mediaService: MediaService;
  organizationId: string;
  buffer: Buffer;
  fileName?: string;
}): Promise<StoredMedia> => {
  const { storage, mediaService, organizationId, buffer, fileName } = params;

  const detected = await fromBuffer(buffer);
  if (!detected || !ALLOWED_MEDIA_MIME.has(detected.mime)) {
    return {
      error:
        'Unsupported file type. Allowed: jpeg, png, gif, webp, avif, bmp, tiff and mp4.',
    };
  }

  const maxSize = getMaxSize(detected.mime);
  if (buffer.length > maxSize) {
    return {
      error: `File is too large: ${buffer.length} bytes (max ${maxSize} bytes).`,
    };
  }

  try {
    await mediaService.assertStorage(organizationId, buffer.length);
  } catch (err) {
    // A wallet that cannot pay for the storage says so (and where to top
    // up); anything else is the plan's cap.
    const body =
      err instanceof HttpException ? (err.getResponse() as any) : undefined;
    if (body?.wallet) {
      return {
        error: `${body.message} Top up: ${topUpUrl()}`,
      };
    }
    return {
      error:
        'The media library is full. Delete files that are no longer needed, or upgrade for more storage.',
    };
  }

  const safeBase =
    (fileName || 'upload')
      .replace(/\.[^./\\]*$/, '')
      .replace(/[\\/]/g, '_')
      .slice(0, 100) || 'upload';

  const getFile = await storage.uploadFile({
    buffer,
    mimetype: detected.mime,
    size: buffer.length,
    path: '',
    fieldname: '',
    destination: '',
    stream: new Readable(),
    filename: '',
    originalname: `${safeBase}.${detected.ext}`,
    encoding: '',
  });

  const saved = await mediaService.saveFile(
    organizationId,
    getFile.originalname,
    getFile.path,
    undefined,
    buffer.length
  );

  return { id: saved.id, path: saved.path };
};

/**
 * Fetch a public URL and store it in the media library. This is the ONE
 * implementation of "make a remote file durable": uploadFromUrlTool exposes it
 * directly, and the copy-on-attach path in post.write.shared runs every
 * external attachment through it before a post is saved.
 *
 * The fetch goes through ssrfSafeDispatcher — an attachment URL is
 * attacker-influenced input, so it must never be allowed to reach internal
 * addresses. Never returns a hosted path for anything that failed: the result
 * either carries { id, path } or { error }, and it never throws.
 */
export const storeUrlAsMedia = async (params: {
  storage: Storage;
  mediaService: MediaService;
  organizationId: string;
  url: string;
}): Promise<StoredMedia> => {
  const { storage, mediaService, organizationId, url } = params;

  try {
    const response = await fetch(url, {
      // @ts-ignore — undici option, not in lib.dom fetch types
      dispatcher: ssrfSafeDispatcher,
    });

    if (!response.ok) {
      return { error: `Failed to fetch URL (HTTP ${response.status})` };
    }

    // Guard against OOM: bail out before buffering the whole body into
    // memory. Content-Length may be absent or wrong, so storeBufferAsMedia
    // re-checks the real size after download too. The type isn't known yet
    // (sniffed there), so the pre-check uses the largest allowed cap (video).
    const maxDownloadSize = getMaxSize('video/mp4');
    const declaredSize = Number(response.headers.get('content-length'));
    if (declaredSize && declaredSize > maxDownloadSize) {
      return {
        error: `File is too large: ${declaredSize} bytes (max ${maxDownloadSize} bytes).`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Sniffing, size limits and storage are keyed off the bytes, not the URL
    // or the declared type.
    return await storeBufferAsMedia({
      storage,
      mediaService,
      organizationId,
      buffer,
    });
  } catch (err) {
    // undici's fetch rejects with a generic TypeError('fetch failed') and
    // hides the real reason (DNS, TLS, SSRF block, ...) in err.cause, so
    // surface it. Error.cause isn't in the es2020 lib typings this repo
    // compiles against, hence the cast.
    const cause =
      err instanceof Error
        ? (err as Error & { cause?: unknown }).cause
        : undefined;
    const causeText =
      cause instanceof Error && cause.message ? ` (${cause.message})` : '';
    return {
      error: `Failed to fetch URL: ${
        err instanceof Error ? err.message : 'Unexpected error'
      }${causeText}`,
    };
  }
};
