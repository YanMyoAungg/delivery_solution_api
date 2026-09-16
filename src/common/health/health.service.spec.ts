import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  const database = { db: { execute: vi.fn() } };

  beforeEach(async () => {
    vi.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports ok when the database probe succeeds', async () => {
    database.db.execute.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('up');
    expect(typeof result.dependencies.database.latencyMs).toBe('number');
    expect(database.db.execute).toHaveBeenCalled();
  });

  it('reports error when the database probe fails', async () => {
    database.db.execute.mockRejectedValue(new Error('connection refused'));

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.dependencies.database.status).toBe('down');
    expect(result.dependencies.database.message).toBe('connection refused');
  });
});
