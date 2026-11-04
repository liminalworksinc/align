import list from "./disposable-domains.json";
import { forbidden } from "./errors";

// Disposable email domains (the CC0 disposable-email-domains list, vendored in disposable-domains.json with its source
// commit). Checked only when hosted, and only where a person asks for something that costs the operator: workspace
// creation and access requests. Never at sign-in, so someone invited from such an address can still join.

const DOMAINS: ReadonlySet<string> = new Set(list.domains);

/** True when the address's domain, or any parent domain of it, is on the list. */
export function isDisposable(email: string): boolean {
  const at = email.lastIndexOf("@");
  const labels = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < labels.length - 1; i++) if (DOMAINS.has(labels.slice(i).join("."))) return true;
  return false;
}

/** 403 disposable_email for a disposable address. */
export function refuseDisposable(email: string) {
  if (isDisposable(email)) throw forbidden("disposable_email", "Use a work or personal email address, not a disposable one.");
}
