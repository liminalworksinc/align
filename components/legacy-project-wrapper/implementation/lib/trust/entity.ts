// Who publishes Align's trust documents: the one place to fill in. The Markdown in docs/trust and SECURITY.md keeps the
// bracketed placeholders; the public pages (/privacy, /trust) show these values in their place, and an email address
// becomes a mailto link. Until counsel confirms them they stay the placeholders themselves, so nothing reads as filled.

export const TRUST_FILL: Record<string, string> = {
  "[LEGAL ENTITY]": "[LEGAL ENTITY]",
  "[ADDRESS]": "[ADDRESS]",
  "[PRIVACY CONTACT EMAIL]": "[PRIVACY CONTACT EMAIL]",
  "[SECURITY CONTACT EMAIL]": "[SECURITY CONTACT EMAIL]",
};
