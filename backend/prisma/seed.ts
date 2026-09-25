/**
 * @file seed.ts
 * @module prisma/seed
 *
 * Script de seed para insertar datos de demo en la base de datos.
 * Ejecutar con: npx dotenv -e .env -- npx tsx prisma/seed.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !connectionString.startsWith('postgresql://')) {
  throw new Error('DATABASE_URL must be set to a PostgreSQL connection string');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD_HASH = bcrypt.hashSync('changeme', 10);

async function main() {
  console.log(`🌱 Ejecutando seed... con URL: ${connectionString}`);

  // --- Users ---
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      id: 'user-admin-1',
      name: 'Admin Demo',
      email: 'admin@demo.com',
      password: DEMO_PASSWORD_HASH,
      role: 'admin',
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: 'user1@demo.com' },
    update: {},
    create: {
      id: 'user-1',
      name: 'User Uno',
      email: 'user1@demo.com',
      password: DEMO_PASSWORD_HASH,
      role: 'user',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@demo.com' },
    update: {},
    create: {
      id: 'user-2',
      name: 'User Dos',
      email: 'user2@demo.com',
      password: DEMO_PASSWORD_HASH,
      role: 'user',
    },
  });

  const guest = await prisma.user.upsert({
    where: { email: 'guest@demo.com' },
    update: {},
    create: {
      id: 'user-guest-1',
      name: 'Guest Demo',
      email: 'guest@demo.com',
      password: DEMO_PASSWORD_HASH,
      role: 'guest',
    },
  });

  console.log(`  ✅ Usuarios: ${admin.id}, ${user1.id}, ${user2.id}, ${guest.id}`);

  // --- Items ---
  const item1 = await prisma.item.upsert({
    where: { id: 'item-demo-1' },
    update: {},
    create: {
      id: 'item-demo-1',
      title: 'First Demo Item',
      description: 'This is a demo item created during seed.',
      status: 'active',
      createdBy: admin.id,
    },
  });

  const item2 = await prisma.item.upsert({
    where: { id: 'item-demo-2' },
    update: {},
    create: {
      id: 'item-demo-2',
      title: 'Second Demo Item',
      description: 'Another demo item with more details.',
      status: 'active',
      createdBy: admin.id,
    },
  });

  const item3 = await prisma.item.upsert({
    where: { id: 'item-demo-3' },
    update: {},
    create: {
      id: 'item-demo-3',
      title: 'Archived Demo Item',
      description: 'This item is archived.',
      status: 'archived',
      createdBy: user1.id,
    },
  });

  console.log(`  ✅ Items: ${item1.id}, ${item2.id}, ${item3.id}`);

  // --- Config ---
  const configs = [
    { key: 'logging.level', value: 'info', description: 'Global logging level', category: 'logging' },
    { key: 'feature_flags.demo_mode', value: 'true', description: 'Enable demo mode', category: 'feature_flags' },
    { key: 'feature_flags.registration_enabled', value: 'true', description: 'Enable user registration', category: 'feature_flags' },
    { key: 'limits.max_items_per_user', value: '50', description: 'Max items per user', category: 'limits' },
    { key: 'integrations.r2_enabled', value: 'true', description: 'Enable Cloudflare R2', category: 'integrations' },
    { key: 'integrations.r2_threshold_gb', value: '7', description: 'R2 storage alert threshold (GB)', category: 'integrations' },
    { key: 'integrations.r2_notify_email', value: 'admin@demo.com', description: 'Email for R2 storage alerts', category: 'integrations' },
    { key: 'integrations.webhooks_enabled', value: 'false', description: 'Enable webhooks', category: 'integrations' },
    { key: 'storage.provider', value: 'local', description: 'Storage provider (local | r2)', category: 'integrations' },
    { key: 'storage.max_file_size_mb', value: '100', description: 'Max file upload size (MB)', category: 'limits' },
    { key: 'storage.allowed_mime_types', value: '*', description: 'Allowed MIME types (* for all)', category: 'limits' },
    { key: 'ui.theme', value: 'dark', description: 'Default theme', category: 'ui' },
    { key: 'ui.language', value: 'en', description: 'Default language', category: 'ui' },
  ];

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { key: cfg.key },
      update: {},
      create: {
        key: cfg.key,
        value: cfg.value,
        description: cfg.description,
        category: cfg.category,
      },
    });
  }

  console.log(`  ✅ Config: ${configs.length} entries`);

  console.log('\n🎉 Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error in seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
