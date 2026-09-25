/**
 * @file r2Client.ts
 * @module infrastructure/storage
 *
 * Cliente S3 configurado para Cloudflare R2.
 * En desarrollo, desactiva validación SSL para evitar errores de certificado autofirmado.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

const isDev = process.env.NODE_ENV !== 'production';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '',
  },
  ...(isDev && {
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    }),
  }),
});

export default r2Client;
