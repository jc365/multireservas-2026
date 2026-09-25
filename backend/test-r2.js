// test-r2.js
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: 'https://d80c623a0da02adc686a9e9f136c0e54.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '9b8b5e68a76d9b8322e4ce6dfa61e5ba',
    secretAccessKey: '2090a2f78ac8d68ec4d4019eb191f9040d89e22f3c111eb00ea898fb90efed08',
  },
});

const command = new ListObjectsV2Command({
  Bucket: 'juancarlos-dpdns',
});

try {
  const response = await client.send(command);
  console.log('📁 Contenido del bucket:', response.Contents);
} catch (error) {
  console.error('❌ Error:', error);
}