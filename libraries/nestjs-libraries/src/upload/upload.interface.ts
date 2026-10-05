export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  // `documents` also accepts the brief document types (see brief.upload.ts).
  uploadFile(
    file: Express.Multer.File,
    options?: { documents?: boolean }
  ): Promise<any>;
  removeFile(filePath: string): Promise<void>;
}
