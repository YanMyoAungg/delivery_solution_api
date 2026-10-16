import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export function currentDateInTimezone(
  timezone: string,
  now = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function localDateRange(
  column: PgColumn,
  date: string,
  timezone: string,
): SQL {
  return sql`${column} >= (${date}::date::timestamp AT TIME ZONE ${timezone}) AND ${column} < ((${date}::date + 1)::timestamp AT TIME ZONE ${timezone})`;
}
