// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tests use a separate PostgreSQL database on the same Docker server
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://multireservas-2026:multireservas-2026@localhost:5433/multireservas-2026_test';
process.env.JWT_SECRET = 'test-secret';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.test.ts', 'backend/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    alias: {
      '@': path.resolve(__dirname, './backend/src'),
    },
    globalSetup: './tests/globalSetup.ts',
  },
});
