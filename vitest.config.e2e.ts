import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every spec shares one Postgres database and the permissions spec
    // rewrites RBAC grants, so parallel files race on global state.
    fileParallelism: false,
  },
});
