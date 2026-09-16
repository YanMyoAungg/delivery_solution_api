import { Injectable, Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';

export type DatabaseProbeResult =
  | { status: 'up'; latencyMs: number }
  | { status: 'down'; latencyMs: number; message: string };

export interface HealthDetails {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: DatabaseProbeResult;
  };
}

/** OpenAPI response shape for the /health endpoint. */
export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status: 'ok' | 'error';

  @ApiProperty({ example: '2026-09-14T10:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 1234.56 })
  uptime: number;

  @ApiProperty({
    example: {
      database: { status: 'up', latencyMs: 3 },
    },
  })
  dependencies: { database: DatabaseProbeResult };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly database: DatabaseService) {}

  async getHealth(): Promise<HealthDetails> {
    const database = await this.probeDatabase();

    return {
      status: database.status === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: { database },
    };
  }

  private async probeDatabase(): Promise<DatabaseProbeResult> {
    const startedAt = Date.now();
    try {
      await this.database.db.execute(sql`SELECT 1`);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Database health probe failed: ${message}`);
      return { status: 'down', latencyMs: Date.now() - startedAt, message };
    }
  }
}
