/**
 * Normalize an email address for consistent lookups and storage.
 * Trims whitespace and lowercases.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Escape SQL LIKE/ILIKE wildcards (% and _) in user-provided search input
 * so the search behaves as a literal substring match rather than a pattern.
 * Escaped with backslash — PostgreSQL default ESCAPE for LIKE/ILIKE.
 */
export function escapeLikeWildcards(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}
