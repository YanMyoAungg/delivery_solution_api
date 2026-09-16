import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

// Load local env (already handled by Nest config too, but drizzle CLI runs
// outside the Nest runtime so it needs its own dotenv load).
loadEnv({ path: ['.env.local', '.env'] });

const url =
  process.env.DATABASE_URL ??
  `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

export default defineConfig({
  schema: './src/common/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
  // Keep printed SQL readable for reviews.
  verbose: true,
  strict: true,
});
