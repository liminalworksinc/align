import dpa from "@/docs/trust/dpa.md";
import privacy from "@/docs/trust/privacy-policy.md";
import questionnaire from "@/docs/trust/questionnaire.md";
import security from "@/docs/trust/security-overview.md";
import subprocessors from "@/docs/trust/subprocessors.md";
import retention from "@/docs/RETENTION.md";
import { TRUST_FILL } from "./entity";
import { parseMarkdown, type Block, type DocPlace } from "./markdown.mts";

// The public trust documents (PRESEED-008): which Markdown file each page shows, and where a link between them goes.
// /privacy shows the privacy policy; /trust shows the rest, one section each. The Markdown is bundled at build time
// (next.config.ts), so these pages are static and need no files at run time (the image has no docs/ folder).

export interface TrustDoc {
  /** The anchor of its section, and the prefix of its headings' anchors. */
  id: string;
  title: string;
  /** The page that shows it. */
  page: "/privacy" | "/trust";
  /** Its file under docs/, as other documents link to it from docs/trust. */
  file: string;
  source: string;
}

/** The documents in the order /trust shows them. */
export const TRUST_DOCS: TrustDoc[] = [
  { id: "security", title: "Security overview", page: "/trust", file: "security-overview.md", source: security },
  { id: "subprocessors", title: "Subprocessors", page: "/trust", file: "subprocessors.md", source: subprocessors },
  { id: "retention", title: "Retention", page: "/trust", file: "../RETENTION.md", source: retention },
  { id: "dpa", title: "Data processing agreement", page: "/trust", file: "dpa.md", source: dpa },
  { id: "questionnaire", title: "Questionnaire answers", page: "/trust", file: "questionnaire.md", source: questionnaire },
  { id: "privacy", title: "Privacy policy", page: "/privacy", file: "privacy-policy.md", source: privacy },
];

const PLACES = new Map<string, DocPlace>([
  ...TRUST_DOCS.map((d) => [d.file, { page: d.page, prefix: d.id }] as const),
  ["retention.md", { page: "/trust", prefix: "retention" }], // docs/trust/retention.md only points at RETENTION.md
]);

export function trustDoc(id: string): TrustDoc {
  const d = TRUST_DOCS.find((x) => x.id === id);
  if (!d) throw new Error(`No trust document ${id}`);
  return d;
}

/** A document's blocks, with links to the other trust documents pointed at their pages and placeholders filled. */
export function trustBlocks(d: TrustDoc): Block[] {
  return parseMarkdown(d.source, { prefix: d.id, resolve: (p) => PLACES.get(p) ?? null, fill: TRUST_FILL });
}
