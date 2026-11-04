import Link from "next/link";
import type { ReactNode } from "react";
import type { Block, Inline, List } from "@/lib/trust/markdown.mts";

// Renders the trust documents' blocks (lib/trust/markdown.mts) as React elements: every piece of text is a React text
// node, so nothing from a document is ever inserted as HTML. Server-only and static; used by /privacy and /trust.

function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        switch (x.t) {
          case "text":
            return x.v;
          case "code":
            return (
              <code key={i} className="rounded bg-zinc-100 px-1 font-mono text-[0.9em]">
                {x.v}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold text-zinc-900">
                <Inlines c={x.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines c={x.c} />
              </em>
            );
          case "link": {
            const external = /^https?:/i.test(x.href);
            return (
              <a key={i} href={x.href} className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900" {...(external ? { rel: "noopener noreferrer" } : {})}>
                <Inlines c={x.c} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

const HEADING_CLASS = ["", "font-display text-[34px] leading-none", "mt-10 text-[24px] font-semibold", "mt-8 text-[19px] font-semibold", "mt-6 text-[16px] font-semibold", "mt-4 text-[15px] font-semibold", "mt-4 text-[15px]"];

function ListView({ l }: { l: List }) {
  const items = l.items.map((it, i) => (
    <li key={i} className="mb-1">
      <Inlines c={it.c} />
      {it.sub && <ListView l={it.sub} />}
    </li>
  ));
  return l.ordered ? <ol className="mb-4 list-decimal pl-6">{items}</ol> : <ul className="mb-4 list-disc pl-6">{items}</ul>;
}

/** A document's blocks. `shift` lowers every heading by that many levels (a document's # title becomes an h2 on /trust). */
export function DocBlocks({ blocks, shift = 0 }: { blocks: Block[]; shift?: number }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "heading": {
            const level = Math.min(6, b.level + shift);
            const Tag = `h${level}` as "h1";
            return (
              <Tag key={i} id={b.id} className={`${HEADING_CLASS[level]} mb-3 scroll-mt-6 text-zinc-900`}>
                <Inlines c={b.c} />
              </Tag>
            );
          }
          case "para":
            return (
              <p key={i} className="mb-4">
                <Inlines c={b.c} />
              </p>
            );
          case "list":
            return <ListView key={i} l={b} />;
          case "table":
            return (
              <div key={i} className="mb-5 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[14px]">
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} className="border-b border-zinc-300 px-2 py-2 align-bottom font-semibold text-zinc-900">
                          <Inlines c={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="border-b border-zinc-200 px-2 py-2 align-top">
                            <Inlines c={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={i} className="mb-4 overflow-x-auto rounded bg-zinc-100 p-3 font-mono text-[13px]">
                {b.v}
              </pre>
            );
          case "quote":
            return (
              <blockquote key={i} className="mb-5 border-l-2 border-zinc-300 pl-4 text-zinc-600">
                <DocBlocks blocks={b.c} shift={shift} />
              </blockquote>
            );
          case "rule":
            return <hr key={i} className="my-6 border-zinc-200" />;
        }
      })}
    </>
  );
}

/** The frame of a public trust page: the Align mark, the page, and links between the two pages and to sign-in. */
export function TrustFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--al-bg)] px-4 py-8 text-[15px] leading-relaxed text-zinc-700 sm:px-6">
      <div className="mx-auto w-full max-w-[860px]">
        <nav className="mb-8 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[14px]">
          <Link href="/app" className="font-display text-[24px] leading-none text-zinc-900">
            Align
          </Link>
          <Link href="/trust" className="underline-offset-2 hover:underline">
            Trust
          </Link>
          <Link href="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </Link>
          <Link href="/app/sign-in" className="underline-offset-2 hover:underline">
            Sign in
          </Link>
        </nav>
        <article className="al-in rounded-[14px] border border-zinc-200 bg-white p-5 sm:p-8">{children}</article>
      </div>
    </main>
  );
}
