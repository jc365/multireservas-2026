/**
 * @file restore-pg.ts
 * @module scripts/restore-pg
 *
 * Restaura un backup de PostgreSQL desde prisma/backups/.
 * Por defecto restaura latest.sql. Se puede especificar un archivo.
 * Opcionalmente ejecuta seed después del restore.
 *
 * Uso:
 *   npx tsx scripts/restore-pg.ts                  # Restaura latest.sql
 *   npx tsx scripts/restore-pg.ts backup_xxx.sql   # Restaura archivo específico
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

// Determine which backup to restore
const argFile = process.argv[2];
let targetFile: string;

if (argFile) {
  targetFile = argFile;
} else {
  const latestPath = path.join(backupsDir, 'latest.sql');
  if (!fs.existsSync(latestPath)) {
    console.error('❌ No hay backup disponible (latest.sql no existe).');
    console.error('   Ejecuta primero: npm run db:backup');
    process.exit(1);
  }
  targetFile = fs.readlinkSync(latestPath) || 'latest.sql';
}

const filepath = path.join(backupsDir, targetFile);

if (!fs.existsSync(filepath)) {
  console.error(`❌ Backup no encontrado: ${targetFile}`);
  process.exit(1);
}

const sizeMB = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(2);
console.log(`📦 Restaurando backup: ${targetFile} (${sizeMB} MB)`);

try {
  // Drop and recreate database
  execSync(`docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"`, { stdio: 'pipe' });
  execSync(`docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME};"`, { stdio: 'pipe' });

  // Restore from backup
  const sql = fs.readFileSync(filepath, 'utf-8');
  execSync(
    `docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}`,
    { input: sql, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
  );

  console.log(`✅ Base de datos restaurada desde ${targetFile}`);
} catch (error) {
  console.error('❌ Restore failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}

// Optional: run seed
if (process.argv.includes('--seed')) {
  try {
    console.log('\n🌱 Ejecutando seed...');
    execSync('npx tsx prisma/seed.ts', { cwd: projectRoot, stdio: 'inherit' });
  } catch {
    console.warn('⚠️  Error al ejecutar seed (restore fue exitoso)');
  }
}
