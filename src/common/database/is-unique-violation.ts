function asErrorObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getErrorCode(err: unknown): unknown {
  const error = asErrorObject(err);
  const cause = asErrorObject(error?.cause);
  return error?.code ?? cause?.code;
}

/** Narrow a caught DB error to a Postgres unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return getErrorCode(err) === '23505';
}

/** Return the violated constraint name when the error identifies one. */
export function getUniqueViolationConstraint(
  err: unknown,
): string | undefined {
  if (!isUniqueViolation(err)) return undefined;

  const error = asErrorObject(err);
  const cause = asErrorObject(error?.cause);
  const constraint =
    error?.constraint ??
    error?.constraint_name ??
    cause?.constraint ??
    cause?.constraint_name;
  return typeof constraint === 'string' ? constraint : undefined;
}
