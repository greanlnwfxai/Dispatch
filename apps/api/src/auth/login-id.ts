/**
 * Neutral loginId normalization (AUTH-001). `loginId` is a technical
 * identifier only — never validated or treated as an email address or
 * employee number (see CLAUDE.md AUTH-001 boundary). Normalization rule:
 * trim surrounding whitespace, then lowercase (case-insensitive matching).
 * Only this normalized form is ever persisted or used for lookup.
 */
export function normalizeLoginId(rawLoginId: string): string {
  return rawLoginId.trim().toLowerCase();
}
