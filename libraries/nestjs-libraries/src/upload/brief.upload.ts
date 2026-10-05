// File types the brief accepts on top of images: documents that describe a
// brand (guidelines, decks, briefs). They are kept in the media library for
// storage accounting, but are not offered as post media.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

export const BRIEF_DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const BRIEF_DOCUMENT_MIME_TYPES = new Set(
  Object.values(BRIEF_DOCUMENT_TYPES)
);

export const BRIEF_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

// Detects a file's type from its bytes. Office files are zip archives; when
// the detector only sees the zip, the extension decides between docx and pptx.
export async function detectBriefDocument(
  buffer: Buffer,
  originalName?: string
): Promise<{ ext: string; mime: string } | undefined> {
  const detected = await fromBuffer(buffer);
  if (!detected) {
    return undefined;
  }
  if (detected.mime === 'application/zip') {
    const ext = (originalName || '').toLowerCase().split('.').pop() || '';
    if (ext === 'docx' || ext === 'pptx') {
      return { ext, mime: BRIEF_DOCUMENT_TYPES[ext] };
    }
  }
  return { ext: detected.ext, mime: detected.mime };
}
