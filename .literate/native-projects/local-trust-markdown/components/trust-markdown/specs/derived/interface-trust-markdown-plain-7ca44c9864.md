# Public interface: trust-markdown.plain

## ADDED Requirements

### Requirement: trust-markdown.plain

JavaScript module trust_markdown/plain exports plain(content:Inline[]):string. Map the array in order;     for nodes whose t is exactly 'text' or 'code' take v, otherwise recurse on c.     Join those results with no separator. Ignore href and every other property.     Preserve ordinary Array.map/join behavior for sparse arrays and string coercion.     Never change the input tree. These are synchronous dependency-free JavaScript functions with no files, network, clock, environment access or hidden mutable state. Use ordinary values without a transport envelope. Preserve every argument, nested object, array, enumerable property, prototype and input reference. Strings are opaque UTF-16 strings; preserve exact text, order and node boundaries, including adjacent text nodes. When nodes or arrays are constructed, each call returns a fresh ordinary graph, including empty arrays; do not reuse result objects across calls. Never freeze caller objects. Formatting/resolution callbacks run only where specified, in order and with exact arguments. Propagate the original thrown callback value unchanged. Do not sanitize, normalize or interpret extra syntax beyond this grammar. Inline is {t:'text',v:string}, {t:'code',v:string}, {t:'strong',c:Inline[]}, {t:'em',c:Inline[]}, or {t:'link',href:string,c:Inline[]}. ListItem is {c:Inline[],sub:List|null}. A List is {t:'list',ordered:boolean,items:ListItem[]}. Block is a List, {t:'heading',level:number,id:string,c:Inline[]}, {t:'para',c:Inline[]}, {t:'table',head:Inline[][],rows:Inline[][][]}, {t:'code',v:string}, {t:'quote',c:Block[]}, or {t:'rule'}. DocPlace is {page:string,prefix:string}. ParseOptions has an opaque prefix:string, optional or nullish resolve:(path:string)=>DocPlace|null, and optional or nullish fill:Record<string,string>. The functions never alter fill or callback records.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:159c9ef07d31ca50230c`
