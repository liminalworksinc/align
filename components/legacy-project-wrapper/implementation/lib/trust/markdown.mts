// Typed public names for the independently qualified trust Markdown library.
import * as native from "../native/.bindings/trust_markdown.js";
import {create_trust_text_parser} from "../native/.bindings/trust_text_parser.js";

export type Inline = {
    t: "text";
    v: string;
} | {
    t: "code";
    v: string;
} | {
    t: "strong";
    c: Inline[];
} | {
    t: "em";
    c: Inline[];
} | {
    t: "link";
    href: string;
    c: Inline[];
};
export interface ListItem {
    c: Inline[];
    sub: List | null;
}
export interface List {
    t: "list";
    ordered: boolean;
    items: ListItem[];
}
export type Block = {
    t: "heading";
    level: number;
    id: string;
    c: Inline[];
} | {
    t: "para";
    c: Inline[];
} | List | {
    t: "table";
    head: Inline[][];
    rows: Inline[][][];
} | {
    t: "code";
    v: string;
} | {
    t: "quote";
    c: Block[];
} | {
    t: "rule";
};
/** Where another document lives: the page that shows it and the anchor prefix of its section there. */
export interface DocPlace {
    page: string;
    prefix: string;
}
export interface ParseOptions {
    /** Prefix for heading anchors, so several documents can share a page ("security" -> #security-architecture). */
    prefix: string;
    /** A relative link's target path (no fragment, no "./"), e.g. "../RETENTION.md", to the page that shows it. */
    resolve?: (path: string) => DocPlace | null;
    /** Placeholder tokens to fill in text, e.g. {"[LEGAL ENTITY]": "Example Ltd"}. An email address becomes a mailto link. */
    fill?: Record<string, string>;
}

export const slug = native.slug as (text: string) => string;
export const safeHref = native.safe_href as (href: string, opts: ParseOptions) => string | null;
export const plain = native.plain as (c: Inline[]) => string;
const parsing = create_trust_text_parser({slug, safeHref, plain}) as {
  parseInline(s: string, opts: ParseOptions): Inline[];
  parseMarkdown(md: string, opts: ParseOptions): Block[];
};
export const parseInline = parsing.parseInline;
export const parseMarkdown = parsing.parseMarkdown;
