/**
 * @file storageService.ts
 * @module infrastructure/storage
 *
 * Servicio de almacenamiento unificado.
 * Si Cloudflare R2 está configurado, almacena en R2 (bucket privado con presigned URLs).
 * Si no, usa almacenamiento local en backend/uploads/files/.
 */

import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import r2Client from './r2Client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/files');
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const R2_FOLDER = process.env.CLOUDFLARE_R2_TARGET_FOLDER || 'uploads/files';
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    R2_BUCKET
  );
}

function r2Key(key: string): string {
  return `${R2_FOLDER}/${key}`;
}

export async function uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (isR2Configured()) {
    const fullKey = r2Key(key);
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fullKey,
      Body: buffer,
      ContentType: contentType,
    }));
    return fullKey;
  }

  // Fallback: local storage
  const filePath = path.join(LOCAL_UPLOADS_DIR, key);
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
  return key;
}

export function getFileUrl(key: string, expiresIn: number = PRESIGNED_URL_EXPIRY): string {
  if (isR2Configured()) {
    return key;
  }
  return `/uploads/files/${key}`;
}

export async function getFileUrlAsync(key: string, expiresIn: number = PRESIGNED_URL_EXPIRY): Promise<string> {
  if (isR2Configured()) {
    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    return getSignedUrl(r2Client, command, { expiresIn });
  }
  return `/uploads/files/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  if (isR2Configured()) {
    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));
    return;
  }

  // Fallback: local delete
  const filePath = path.join(LOCAL_UPLOADS_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
