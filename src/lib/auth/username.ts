/**
 * Sign-in with a name and a password.
 *
 * Firebase Auth needs an email, so each name maps to a fixed internal address
 * that people never see: a hash of the name, folded so small differences don't
 * matter («أحمد» = «احمد», «Sara » = «sara»). Two people can't pick the same
 * name: the second sign-up gets "name already taken".
 */
import { normalizeArabic } from "../parsing/normalize";

const DOMAIN = "users.srm-voice-log.app";

/** The folded form of a name used to identify the account. */
export function usernameKey(name: string): string {
  return normalizeArabic(name).replace(/\s+/g, " ").trim();
}

/** The internal sign-in address for a name. */
export async function usernameEmail(name: string): Promise<string> {
  const bytes = new TextEncoder().encode(usernameKey(name));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return `u${hex.slice(0, 40)}@${DOMAIN}`;
}

export const MIN_PASSWORD = 6;
export const MAX_NAME = 40;

/** Name rules: 2–40 characters after trimming. Returns an error key or null. */
export function nameProblem(name: string): "short" | "long" | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 2) return "short";
  if (n.length > MAX_NAME) return "long";
  return null;
}
