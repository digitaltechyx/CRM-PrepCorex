/**
 * Minimal shape for user display (e.g. UserProfile).
 */
export interface UserDisplayLike {
  clientId?: string | null;
  name?: string | null;
  email?: string | null;
  uid?: string | null;
}

/**
 * Formats a user for display with optional 5-digit client ID before the name.
 * e.g. "10001 Zain Sheikh (onlywork0308@gmail.com)" or "Zain Sheikh (email)" when no clientId.
 */
export function formatUserDisplayName(
  user: UserDisplayLike,
  options?: { showEmail?: boolean }
): string {
  const showEmail = options?.showEmail !== false;
  const name = user.name || user.email || user.uid || "Unknown";
  const prefix = user.clientId ? `${user.clientId} ` : "";
  const main = `${prefix}${name}`;
  if (showEmail && user.email && user.email !== name) {
    return `${main} (${user.email})`;
  }
  return main;
}
