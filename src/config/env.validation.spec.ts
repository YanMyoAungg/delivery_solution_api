import { envValidation } from './env.validation.js';

describe('envValidation', () => {
  const baseEnv = {
    DATABASE_URL:
      'postgres://delivery_user:delivery_pass@localhost:5432/delivery_db',
    JWT_SECRET: 'test-secret',
  };

  it('returns a normalized configuration for a complete environment', () => {
    const config = envValidation(baseEnv);

    expect(config.DATABASE_URL).toBe(baseEnv.DATABASE_URL);
    expect(config.JWT_SECRET).toBe('test-secret');
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DB_HOST).toBe('localhost');
    expect(config.DB_PORT).toBe(5432);
    expect(config.DB_NAME).toBe('delivery_db');
    expect(config.DB_USER).toBe('delivery_user');
    expect(config.JWT_EXPIRES_IN).toBe('1h');
    expect(config.REDIS_PORT).toBe(6379);
  });

  it('throws when required environment variables are missing', () => {
    expect(() => envValidation({})).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('overrides defaults with explicit values', () => {
    const config = envValidation({
      ...baseEnv,
      PORT: '8080',
      NODE_ENV: 'production',
      DB_PORT: '5433',
      REDIS_PORT: '6380',
      JWT_EXPIRES_IN: '24h',
    });

    expect(config.PORT).toBe(8080);
    expect(config.NODE_ENV).toBe('production');
    expect(config.DB_PORT).toBe(5433);
    expect(config.REDIS_PORT).toBe(6380);
    expect(config.JWT_EXPIRES_IN).toBe('24h');
  });
});