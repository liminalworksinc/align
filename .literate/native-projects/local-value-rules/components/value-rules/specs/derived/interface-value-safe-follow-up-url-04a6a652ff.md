# Public interface: value.safe-follow-up-url

## ADDED Requirements

### Requirement: value.safe-follow-up-url

JavaScript module value_rules/safe_follow_up_url exports safe_follow_up_url(v:string|null|undefined):string|null. Falsy inputs return null. For a truthy input v, parse new URL(v.trim()) using the ordinary WHATWG URL constructor. Return null on a thrown parse or decode error. For protocol https:, return null if the parsed username, password or port is nonempty, or hostname is empty; otherwise return u.toString(). Default https port 443 normalizes to an empty port and is accepted; normal URL case, host, IDN, path, query and fragment normalization remain observable. Empty credential markers that normalize to empty username/password are accepted. Do not add validation of percent escapes in HTTPS path/query/fragment. For protocol mailto:, reject any searchParams key whose lowercase spelling is not subject. Repeated subject keys and arbitrary subject values are accepted. Decode the pathname with decodeURIComponent and require exactly one @, at least one character before it, and a domain containing a dot with at least one character on each side. Every non-@ character must exclude whitespace, comma, semicolon, angle brackets, double quote, question mark and ampersand. This is a syntactic check, without DNS or email delivery. Preserve the URL's own serialized percent escapes and fragment in the returned u.toString(); decoding is only for validation. Reject every other protocol.  Synchronous dependency-free JavaScript API. Preserve caller input objects and values without mutation. No network, filesystem, clock or persistent state. Only follow_up_url and follow_up_problem read process.env, and only when their env argument is omitted or undefined. Such calls consult the three named fields afresh on every call; all other functions never read the environment. Preserve ordinary JavaScript strings, UTF-16 code units, non-finite numbers, negative zero and native URL behavior. The shared estimate table is ordinary mutable process-local data; never freeze, clone or reset it. Public functions receive natural JavaScript arguments and return natural values without a JSON transport wrapper.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:857f6f77da51e167b897`
