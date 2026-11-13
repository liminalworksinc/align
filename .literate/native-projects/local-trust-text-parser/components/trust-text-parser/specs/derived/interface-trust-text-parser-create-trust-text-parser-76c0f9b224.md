# Public interface: trust-text-parser.create-trust-text-parser

## ADDED Requirements

### Requirement: trust-text-parser.create-trust-text-parser

# Trust document parsing

Capability trust-text-parser.create-trust-text-parser constructs a fresh parser
operation table. Construction starts no work. Its synchronous inline and document
operations produce the existing plain-data nodes for the public trust pages.
Raw HTML remains data; comments are removed only by document parsing. Preserve
the exact supported Markdown grammar, node order, node boundaries, references,
callback effects and original failures. Code text is never filled as a template.

The host supplies the already qualified slug, URL-selection and plain-text
operations. Reuse those owners unchanged. The parser owns placeholder expansion,
inline structure and block structure. It preserves the admitted handling of
indented root lists, including normal termination and each root/nested item once.

When a placeholder value ends in a full stop and the immediately following
character of that template text is a full stop, consume that one template stop.
Keep the replacement value unchanged. Preserve any additional template stops,
all literal text with two stops, links, email nodes, code and every other existing
rule. In particular, a legal entity ending in Inc. followed by the template's
sentence stop renders one stop. This does not normalize arbitrary punctuation.

All operations preserve caller inputs and return fresh ordinary mutable result
graphs. No files, network, clock, process state or hidden mutable state belong to
this component. Keep all five existing host public names: the supplied owners
continue to provide slug, safeHref and plain, while this parser provides
parseInline and parseMarkdown through the selected binding.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:72d0313bab67e1095d42`
