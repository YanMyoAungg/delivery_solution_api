export interface EnvironmentVariables {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  VIBER_BOT_TOKEN: string;
  VIBER_GROUP_ID: string;
  VIBER_WEBHOOK_URL: string;
}

export function envValidation(
  env = process.env,
): EnvironmentVariables {
  const required = ['DATABASE_URL', 'JWT_SECRET'] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    PORT: Number(env.PORT ?? 3000),
    NODE_ENV: env.NODE_ENV ?? 'development',
    DATABASE_URL: env.DATABASE_URL!,
    DB_HOST: env.DB_HOST ?? 'localhost',
    DB_PORT: Number(env.DB_PORT ?? 5432),
    DB_NAME: env.DB_NAME ?? 'delivery_db',
    DB_USER: env.DB_USER ?? 'delivery_user',
    DB_PASSWORD: env.DB_PASSWORD ?? 'delivery_pass',
    JWT_SECRET: env.JWT_SECRET!,
    JWT_EXPIRES_IN: env.JWT_EXPIRES_IN ?? '1h',
    REDIS_HOST: env.REDIS_HOST ?? 'localhost',
    REDIS_PORT: Number(env.REDIS_PORT ?? 6379),
    VIBER_BOT_TOKEN: env.VIBER_BOT_TOKEN ?? '',
    VIBER_GROUP_ID: env.VIBER_GROUP_ID ?? '',
    VIBER_WEBHOOK_URL: env.VIBER_WEBHOOK_URL ?? '',
  };
}