# Public interface: trust-markdown.safe-href

## ADDED Requirements

### Requirement: trust-markdown.safe-href

JavaScript module trust_markdown/safe_href exports safe_href(href:string,opts:ParseOptions):string|null.     Let h=href.trim(). Return null when h is empty or /[\u0000-\u001F\u007F\s]/     matches it. Return h unchanged when /^https?:\/\/[^/]/i or /^mailto:[^:]+@/i     matches. Otherwise an initial '#' returns '#'+opts.prefix+'-'+slug(h.slice(1))     when it has more than one character, or null for '#' alone. Otherwise reject     /^[a-z][a-z0-9+.-]*:/i and an initial '//'. Split h on '#' with limit two into     rawPath and frag; discard later fragments. Remove one initial './' from rawPath.     Call opts.resolve only for this relative case, with that exact path; a nullish     resolver or nullish result yields null. Any falsy place yields null. Otherwise     return place.page+'#'+(frag ? place.prefix+'-'+slug(frag) : place.prefix).     Preserve opaque page and prefix values; do not revalidate callback records,     use a URL parser, collapse paths or invoke resolution on absolute/anchor cases. These are synchronous dependency-free JavaScript functions with no files, network, clock, environment access or hidden mutable state. Use ordinary values without a transport envelope. Preserve every argument, nested object, array, enumerable property, prototype and input reference. Strings are opaque UTF-16 strings; preserve exact text, order and node boundaries, including adjacent text nodes. When nodes or arrays are constructed, each call returns a fresh ordinary graph, including empty arrays; do not reuse result objects across calls. Never freeze caller objects. Formatting/resolution callbacks run only where specified, in order and with exact arguments. Propagate the original thrown callback value unchanged. Do not sanitize, normalize or interpret extra syntax beyond this grammar. Inline is {t:'text',v:string}, {t:'code',v:string}, {t:'strong',c:Inline[]}, {t:'em',c:Inline[]}, or {t:'link',href:string,c:Inline[]}. ListItem is {c:Inline[],sub:List|null}. A List is {t:'list',ordered:boolean,items:ListItem[]}. Block is a List, {t:'heading',level:number,id:string,c:Inline[]}, {t:'para',c:Inline[]}, {t:'table',head:Inline[][],rows:Inline[][][]}, {t:'code',v:string}, {t:'quote',c:Block[]}, or {t:'rule'}. DocPlace is {page:string,prefix:string}. ParseOptions has an opaque prefix:string, optional or nullish resolve:(path:string)=>DocPlace|null, and optional or nullish fill:Record<string,string>. The functions never alter fill or callback records.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:159c9ef07d31ca50230c`
