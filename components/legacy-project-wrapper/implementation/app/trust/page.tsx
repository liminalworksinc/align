import type { Metadata } from "next";
import Link from "next/link";
import { DocBlocks, TrustFrame } from "../_trust/doc";
import { TRUST_DOCS, trustBlocks } from "@/lib/trust/docs";
import { TRUST_FILL } from "@/lib/trust/entity";
import { parseInline } from "@/lib/trust/markdown.mts";

// /trust: the security pack (docs/trust): security overview, subprocessors, the retention schedule (docs/RETENTION.md),
// the DPA cover note and questionnaire answers, one section each, plus how to reach us. Public in both modes and on the
// hosted allowlist; the privacy policy is its own page, /privacy.
export const metadata: Metadata = { title: "Trust · Align", description: "How Align protects data: security, subprocessors, retention, the DPA and questionnaire answers." };

const sections = TRUST_DOCS.filter((d) => d.page === "/trust");
/** A line with the contact placeholders filled (an email address becomes a mailto link). */
const contact = (s: string) => <DocBlocks blocks={[{ t: "para", c: parseInline(s, { prefix: "contact", fill: TRUST_FILL }) }]} />;

export default function Page() {
  return (
    <TrustFrame>
      <h1 className="mb-3 font-display text-[34px] leading-none text-zinc-900">Trust</h1>
      <p className="mb-4">
        What Align holds, where, for how long, and how it is protected. Align stores no prompts, agent output or code on its servers, and Align in local mode keeps everything on your own machine.
        These documents describe the code as it is today, including what isn&apos;t done yet, and are drafts under review.
      </p>
      <ul className="mb-6 list-disc pl-6">
        {sections.map((d) => (
          <li key={d.id} className="mb-1">
            <a href={`#${d.id}`} className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900">
              {d.title}
            </a>
          </li>
        ))}
        <li className="mb-1">
          <Link href="/privacy" className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900">
            Privacy policy
          </Link>
        </li>
        <li className="mb-1">
          <a href="#contact" className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900">
            Contact
          </a>
        </li>
      </ul>
      {sections.map((d) => (
        <section key={d.id} id={d.id} className="scroll-mt-6 border-t border-zinc-200 pt-2">
          <DocBlocks blocks={trustBlocks(d)} shift={1} />
        </section>
      ))}
      <section id="contact" className="scroll-mt-6 border-t border-zinc-200 pt-2">
        <h2 className="mt-10 mb-3 text-[24px] font-semibold text-zinc-900">Contact</h2>
        {contact("Security reports: [SECURITY CONTACT EMAIL]. Privacy questions, data requests and the DPA: [PRIVACY CONTACT EMAIL].")}
        {contact("[LEGAL ENTITY], [ADDRESS].")}
      </section>
    </TrustFrame>
  );
}
