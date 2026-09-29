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
import {
  generateRRuleFromSchedule,
  generateRRuleFromHoliday,
} from '../src/domain/utils/dayMaster';

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !connectionString.startsWith('postgresql://')) {
  throw new Error('DATABASE_URL must be set to a PostgreSQL connection string');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD_HASH = bcrypt.hashSync('changeme', 10);

// F3.4: schedules/holidays con rrule derivada (dayMaster), igual que
// hace el dominio al guardar. El re-run del seed los re-aplica.
const DEMO_SCHEDULES = [
  {
    label: 'Horario semanal',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: '09:00',
    end: '18:00',
    breaks: [{ start: '13:00', end: '14:00' }],
  },
  {
    label: 'Sábado',
    days: ['sat'],
    start: '10:00',
    end: '14:00',
    breaks: [],
  },
].map((block) => ({ ...block, rrule: generateRRuleFromSchedule(block) }));

const DEMO_HOLIDAYS = [
  { label: 'Navidad', date: '2026-12-25', recurring: true },
  { label: 'Puente local', date: '2026-10-12', recurring: false },
].map((holiday) => ({ ...holiday, rrule: generateRRuleFromHoliday(holiday) }));

async function main() {
  console.log(`🌱 Ejecutando seed... con URL: ${connectionString}`);

  // --- Tenant demo (SF5: id fijo para referencia de tests/scripts) ---
  await prisma.tenant.upsert({
    where: { id: 'tenant-demo' },
    update: {
      name: 'Tenant Demo',
      slug: 'demo',
      settings: {
        requireClientPhone: true,
        requireClientEmail: false,
        clientDataRetention: 'nextMonth',
      },
      schedules: DEMO_SCHEDULES,
      holidays: DEMO_HOLIDAYS,
    },
    create: {
      id: 'tenant-demo',
      name: 'Tenant Demo',
      slug: 'demo',
      currency: 'EUR',
      timezone: 'UTC',
      settings: {
        requireClientPhone: true,
        requireClientEmail: false,
        clientDataRetention: 'nextMonth',
      },
      schedules: DEMO_SCHEDULES,
      holidays: DEMO_HOLIDAYS,
      isActive: true,
    },
  });

  console.log('  ✅ Tenant: tenant-demo (slug demo)');

  // --- Users (SF3a: un usuario demo por rol MR; SF5: tenant salvo admin plataforma) ---
  const DEMO_SEED_USERS = [
    { id: 'user-owner-1', name: 'Owner Demo', email: 'owner@demo.com', role: 'owner', tenantId: 'tenant-demo' },
    { id: 'user-employee-1', name: 'Employee Demo', email: 'employee@demo.com', role: 'employee', tenantId: 'tenant-demo' },
    { id: 'user-admin-1', name: 'Admin Demo', email: 'admin@demo.com', role: 'admin', tenantId: null },
    { id: 'user-client-1', name: 'Client Demo', email: 'client@demo.com', role: 'client', tenantId: 'tenant-demo' },
  ] as const;

  const seedUsers: Record<string, { id: string }> = {};
  for (const u of DEMO_SEED_USERS) {
    seedUsers[u.role] = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, tenantId: u.tenantId },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        password: DEMO_PASSWORD_HASH,
        role: u.role,
        tenantId: u.tenantId,
      },
    });
  }

  console.log(`  ✅ Usuarios: ${DEMO_SEED_USERS.map((u) => `${u.role} (${u.email})`).join(', ')}`);

  // --- Services ---
  const service1 = await prisma.service.upsert({
    where: { id: 'svc-demo-1' },
    update: {},
    create: {
      id: 'svc-demo-1',
      tenantId: 'tenant-demo',
      name: 'Classic Haircut',
      description: 'Cut, wash and style with a finish of your choice.',
      duration: 30,
      price: 25,
      category: 'hair',
    },
  });

  const service2 = await prisma.service.upsert({
    where: { id: 'svc-demo-2' },
    update: {},
    create: {
      id: 'svc-demo-2',
      tenantId: 'tenant-demo',
      name: 'Full Color',
      description: 'Full head colour treatment including aftercare advice.',
      duration: 90,
      price: 65.5,
      category: 'hair',
    },
  });

  const service3 = await prisma.service.upsert({
    where: { id: 'svc-demo-3' },
    update: {},
    create: {
      id: 'svc-demo-3',
      tenantId: 'tenant-demo',
      name: 'Manicure',
      description: 'Classic manicure with polish.',
      duration: 45,
      price: 18,
      category: 'nails',
      isActive: false,
    },
  });

  console.log(`  ✅ Services: ${service1.id}, ${service2.id}, ${service3.id}`);

  // --- Employees (F3.2: empleado demo ligado al usuario employee@demo.com) ---
  const demoEmployee = await prisma.employee.upsert({
    where: { id: 'emp-demo-1' },
    update: { userId: seedUsers['employee'].id },
    create: {
      id: 'emp-demo-1',
      tenantId: 'tenant-demo',
      userId: seedUsers['employee'].id,
      name: 'Employee Demo',
      email: 'employee@demo.com',
      offersAllServices: true,
      isActive: true,
    },
  });

  console.log(`  ✅ Employees: ${demoEmployee.id} (userId: ${demoEmployee.userId})`);

  // --- Clients + Reservations (F3.3: cliente interno + reserva demo) ---
  const demoClient = await prisma.client.upsert({
    where: { id: 'cli-demo-1' },
    update: {},
    create: {
      id: 'cli-demo-1',
      tenantId: 'tenant-demo',
      firstName: 'Laura',
      lastName: 'Gómez',
      email: 'laura@example.com',
      phone: '+34600111222',
      visitCount: 1,
    },
  });

  // Reserva demo con fecha futura relativa (now + 7 días, 10:00 UTC) para
  // que nunca caduque al re-ejecutar el seed.
  const demoStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  demoStart.setUTCHours(10, 0, 0, 0);
  const demoEnd = new Date(demoStart.getTime() + 30 * 60 * 1000);
  const demoDate = new Date(
    Date.UTC(demoStart.getUTCFullYear(), demoStart.getUTCMonth(), demoStart.getUTCDate())
  );
  const demoActiveKey = `emp-demo-1-${demoStart.toISOString().slice(0, 10)}-10:00`;

  const demoReservation = await prisma.reservation.upsert({
    where: { id: 'res-demo-1' },
    update: { date: demoDate, startTimeUTC: demoStart, endTimeUTC: demoEnd, activeKey: demoActiveKey },
    create: {
      id: 'res-demo-1',
      tenantId: 'tenant-demo',
      clientId: demoClient.id,
      employeeId: demoEmployee.id,
      serviceId: service1.id,
      date: demoDate,
      startTimeUTC: demoStart,
      endTimeUTC: demoEnd,
      timezone: 'UTC',
      duration: 30,
      status: 'confirmed',
      activeKey: demoActiveKey,
      cancelToken: 'demo-cancel-token-1',
    },
  });

  console.log(`  ✅ Client: ${demoClient.id} | Reservation: ${demoReservation.id} (${demoStart.toISOString()})`);

  // --- Config ---
  const configs = [
    { key: 'logging.level', value: 'info', description: 'Global logging level', category: 'logging' },
    { key: 'feature_flags.demo_mode', value: 'true', description: 'Enable demo mode', category: 'feature_flags' },
    { key: 'feature_flags.registration_enabled', value: 'true', description: 'Enable user registration', category: 'feature_flags' },
    { key: 'limits.max_services_per_tenant', value: '50', description: 'Max services per tenant', category: 'limits' },
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
