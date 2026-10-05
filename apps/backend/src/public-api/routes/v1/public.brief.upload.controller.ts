import {
  Controller,
  HttpException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { BriefFileValidationPipe } from '@gitroom/nestjs-libraries/upload/brief.upload.validation';
import { BRIEF_DOCUMENT_MAX_BYTES } from '@gitroom/nestjs-libraries/upload/brief.upload';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { briefUploadTicketKey } from '@gitroom/nestjs-libraries/upload/upload.ticket';

/**
 * Receives a file for the brief with a ticket minted by
 * `POST /public/v1/upload-ticket` with `{ purpose: 'brief' }`. Works like the
 * media ticket route (the ticket in the path is the credential, so this is
 * kept out of the authenticated list in PublicApiModule), and also accepts
 * documents. The file is stored in the organization's media library, counted
 * and charged as storage like any upload; documents are kept out of the media
 * picker.
 */
@ApiTags('Public API')
@Controller('/public/v1')
export class PublicBriefUploadController {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}

  @Post('/brief-upload/:token')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: BRIEF_DOCUMENT_MAX_BYTES } })
  )
  @UsePipes(new BriefFileValidationPipe())
  async upload(
    @Param('token') token: string,
    @UploadedFile('file') file: Express.Multer.File
  ) {
    const key = briefUploadTicketKey(token);
    const organizationId = await ioRedis.get(key);
    if (!organizationId) {
      throw new HttpException(
        { msg: 'This upload link is invalid or has expired.' },
        404
      );
    }

    if (!file) {
      throw new HttpException(
        {
          msg: 'No file provided. Send it as multipart form data field "file".',
        },
        400
      );
    }

    await this._mediaService.assertStorage(organizationId, file.size);
    const document = !file.mimetype.startsWith('image/');
    const stored = await this.storage.uploadFile(file, { documents: true });
    const saved = await this._mediaService.saveFile(
      organizationId,
      stored.originalname,
      stored.path,
      file.originalname,
      file.size,
      document ? 'document' : undefined
    );

    await ioRedis.del(key);

    return {
      ...saved,
      type: document ? 'document' : 'image',
      mime: file.mimetype,
    };
  }
}
