import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  BRIEF_DOCUMENT_MAX_BYTES,
  BRIEF_DOCUMENT_MIME_TYPES,
  detectBriefDocument,
} from '@gitroom/nestjs-libraries/upload/brief.upload';

const IMAGE_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
]);

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Validates a file for the brief: images, or a brief document type. The type
// comes from the bytes, never from the name or the claimed mime.
@Injectable()
export class BriefFileValidationPipe implements PipeTransform {
  async transform(value: any) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (
      !('buffer' in value) &&
      !('mimetype' in value) &&
      !('fieldname' in value)
    ) {
      return value;
    }

    if (!value.buffer || !Buffer.isBuffer(value.buffer)) {
      throw new BadRequestException('Invalid file upload.');
    }

    const detected = await detectBriefDocument(
      value.buffer,
      value.originalname
    );
    const image = !!detected && IMAGE_MIME_TYPES.has(detected.mime);
    const document = !!detected && BRIEF_DOCUMENT_MIME_TYPES.has(detected.mime);
    if (!detected || (!image && !document)) {
      throw new BadRequestException(
        'Unsupported file type. Send an image, a PDF, a DOCX or a PPTX.'
      );
    }

    const maxSize = image ? IMAGE_MAX_BYTES : BRIEF_DOCUMENT_MAX_BYTES;
    if (value.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds the maximum allowed size of ${maxSize} bytes.`
      );
    }

    value.mimetype = detected.mime;
    const safeBase =
      (value.originalname || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
    value.originalname = `${safeBase}.${detected.ext}`;

    return value;
  }
}
