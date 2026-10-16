import { ConfigService } from '@nestjs/config';
import { WaysService } from './ways.service.js';

function resultChain<T>(result: T) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    then: (resolve: (value: T) => unknown) => Promise.resolve(result).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  return chain;
}

function transactionMock(
  riderOverride: string | null,
  settingValue: string | undefined,
  insertResult: Array<{ id: string }>,
  existingResult: Array<{ id: string }> = [],
) {
  const selectResults: unknown[] = [
    [{ id: 'rider-1', commissionPerWayOverride: riderOverride }],
    settingValue === undefined ? [] : [{ value: settingValue }],
    existingResult,
  ];
  const transaction = {
    select: vi.fn(() => resultChain(selectResults.shift() ?? [])),
    insert: vi.fn(),
  };
  const insertBuilder = {
    onConflictDoNothing: vi.fn(),
    returning: vi.fn().mockResolvedValue(insertResult),
  };
  insertBuilder.onConflictDoNothing.mockReturnValue(insertBuilder);
  transaction.insert.mockReturnValue({ values: vi.fn().mockReturnValue(insertBuilder) });
  return { transaction, insertBuilder };
}

describe('WaysService open-way creation', () => {
  const config = { get: vi.fn().mockReturnValue('Asia/Yangon') };
  const service = new WaysService({} as never, config as unknown as ConfigService);

  it('snapshots the rider commission override ahead of the default setting', async () => {
    const { transaction, insertBuilder } = transactionMock('650.00', '700.00', [{ id: 'way-1' }]);

    await expect(service.findOrCreateOpenWayForRider(transaction as never, 'rider-1')).resolves.toBe('way-1');

    expect(transaction.insert).toHaveBeenCalledWith(expect.anything());
    expect(insertBuilder.returning).toHaveBeenCalled();
    const insertedValues = transaction.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as { commissionRate: string };
    expect(insertedValues.commissionRate).toBe('650.00');
  });

  it('uses the configured default setting when the rider has no override', async () => {
    const { transaction } = transactionMock(null, '725.00', [{ id: 'way-2' }]);

    await service.findOrCreateOpenWayForRider(transaction as never, 'rider-1');

    const insertedValues = transaction.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as { commissionRate: string };
    expect(insertedValues.commissionRate).toBe('725.00');
  });

  it('uses the 500.00 default when the setting row is missing', async () => {
    const { transaction } = transactionMock(null, undefined, [{ id: 'way-3' }]);

    await service.findOrCreateOpenWayForRider(transaction as never, 'rider-1');

    const insertedValues = transaction.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as { commissionRate: string };
    expect(insertedValues.commissionRate).toBe('500.00');
  });

  it('returns the winner’s way after a concurrent insert hits the partial unique index', async () => {
    const winningTransaction = transactionMock(null, '500.00', [{ id: 'shared-way' }]);
    const losingTransaction = transactionMock(null, '500.00', [], [{ id: 'shared-way' }]);

    const wayIds = await Promise.all([
      service.findOrCreateOpenWayForRider(winningTransaction.transaction as never, 'rider-1'),
      service.findOrCreateOpenWayForRider(losingTransaction.transaction as never, 'rider-1'),
    ]);

    expect(wayIds).toEqual(['shared-way', 'shared-way']);
    expect(losingTransaction.transaction.select).toHaveBeenCalledTimes(3);
  });
});
