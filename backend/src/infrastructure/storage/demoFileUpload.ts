/**
 * @file demoFileUpload.ts
 * @module infrastructure/storage
 *
 * Multer configuration for file uploads.
 * Uses memoryStorage for upload to R2 or local disk via StorageService.
 * MIME validation is informational only (warns, does not reject).
 */

import multer from 'multer';
import logger from '../logging/logger';

const DEFAULT_ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webm',
  'application/pdf',
  'application/zip',
];

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (DEFAULT_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    logger.warn(
      { mimetype: file.mimetype, originalname: file.originalname },
      'File MIME type not in default list (allowed anyway)'
    );
    cb(null, true);
  }
};

const demoFileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: DEFAULT_MAX_FILE_SIZE },
});

export default demoFileUpload;
export { DEFAULT_ALLOWED_MIME_TYPES, DEFAULT_MAX_FILE_SIZE };
