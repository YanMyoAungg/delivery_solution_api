/**
 * Narrow a caught DB error to a Postgres unique-constraint violation
 * (SQLSTATE 23505). Drizzle's Postgres driver surfaces the code directly
 * on the error or wrapped under `cause`, so check both.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string }).code ??
    (err as { cause?: { code?: string } }).cause?.code ??
    '';
  return code === '23505';
}
