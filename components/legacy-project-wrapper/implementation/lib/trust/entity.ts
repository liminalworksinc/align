// Who publishes Align's trust documents: the one place to fill in. The Markdown in docs/trust and SECURITY.md keeps the
// bracketed placeholders; the public pages (/privacy, /trust) show these values in their place, and an email address
// becomes a mailto link. The founder approved the legal entity with no postal address line, and one public company
// address for both privacy and security contact; counsel reviews after publishing.

export const TRUST_FILL: Record<string, string> = {
  "[LEGAL ENTITY]": "Liminal Works, Inc.",
  "[PRIVACY CONTACT EMAIL]": "ops@theliminalspace.io",
  "[SECURITY CONTACT EMAIL]": "ops@theliminalspace.io",
};
