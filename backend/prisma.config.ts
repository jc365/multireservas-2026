// backend/prisma.config.ts
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Cargar .env solo si DATABASE_URL no está ya definida (respeta test setup)
if (!process.env.DATABASE_URL) {
  config({ path: "./.env" });
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "\n" +
    "════════════════════════════════════════════════════════════\n" +
    "  DATABASE_URL is not defined.\n" +
    "\n" +
    "  Run:\n" +
    "    cp backend/.env.example backend/.env\n" +
    "  And edit backend/.env with your database credentials.\n" +
    "════════════════════════════════════════════════════════════\n"
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    provider: "postgresql",
    url: process.env.DATABASE_URL,
  },
});
