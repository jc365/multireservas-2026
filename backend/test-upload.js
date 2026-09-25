// backend/test-upload.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const buffer = Buffer.from('Test upload from script');
const key = 'test-file.txt';

const command = new PutObjectCommand({
  Bucket: process.env.CLOUDFLARE_R2_BUCKET,
  Key: key,
  Body: buffer,
  ContentType: 'text/plain',
});

try {
  const response = await client.send(command);
  console.log('✅ Archivo subido correctamente:', response);
} catch (error) {
  console.error('❌ Error:', error);
}