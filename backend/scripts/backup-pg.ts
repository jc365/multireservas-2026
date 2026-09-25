/**
 * @file backup-pg.ts
 * @module scripts/backup-pg
 *
 * Crea un backup de PostgreSQL usando pg_dump via Docker.
 * Guarda en prisma/backups/ con timestamp.
 * Crea un symlink latest.sql al backup más reciente.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const backupsDir = path.join(projectRoot, 'prisma', 'backups');

const DB_CONTAINER = process.env.DB_CONTAINER || 'multireservas-2026-db';
const DB_USER = process.env.DB_USER || 'multireservas-2026';
const DB_NAME = process.env.DB_NAME || 'multireservas-2026';

fs.mkdirSync(backupsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `backup_${timestamp}.sql`;
const filepath = path.join(backupsDir, filename);
const latestPath = path.join(backupsDir, 'latest.sql');

try {
  const dump = execSync(
    `docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} --no-owner --no-acl`,
    { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
  );

  fs.writeFileSync(filepath, dump);

  // Update latest symlink
  try {
    if (fs.existsSync(latestPath)) {
      fs.unlinkSync(latestPath);
    }
  } catch { /* ignore */ }
  fs.symlinkSync(filename, latestPath);

  const sizeMB = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Backup creado: prisma/backups/${filename} (${sizeMB} MB)`);
} catch (error) {
  console.error('❌ Backup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
