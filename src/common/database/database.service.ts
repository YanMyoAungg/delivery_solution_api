import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema.js';
import path from 'node:path';

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly sql: ReturnType<typeof postgres>;
  private readonly _db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('DATABASE_URL') ??
      `postgres://${this.config.get('DB_USER')}:${this.config.get('DB_PASSWORD')}@${this.config.get('DB_HOST')}:${this.config.get('DB_PORT')}/${this.config.get('DB_NAME')}`;

    this.sql = postgres(url, {
      max: 10,
      onnotice: (notice) =>
        this.logger.debug(`PostgreSQL notice: ${notice.message}`),
    });

    this._db = drizzle(this.sql, { schema });
  }

  get db() {
    return this._db;
  }

  async onApplicationBootstrap() {
    await this.runMigrations();
  }

  async runMigrations() {
    this.logger.log('Running Drizzle migrations…');
    const migrationsFolder = path.join(process.cwd(), 'drizzle');
    await migrate(this._db, { migrationsFolder });
    this.logger.log('Migrations completed');
  }
}
